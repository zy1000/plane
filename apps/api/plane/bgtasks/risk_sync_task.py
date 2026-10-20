"""风险 → 简道云的出站推送（新建 / 修改 / 删除），由 ``utils/risk.py`` 在事务提交后投递。

- 只在网关 / 简道云连不上（INTEGRATION_REMOTE_UNREACHABLE）时重试，指数退避 5 次（约 1/2/4/8/16 分钟）；
  其它错误（配置缺失、简道云拒绝）直接标 failed，详情页显示「未同步」，可手动「重新同步」。
- 修改任务只带字段名，发送时读当前库里的值：几次修改排队时后到的任务自然带最新值。
- 新建任务重试前先按「同项目 + 同名 + 本地创建之后」到简道云查一遍，防止上一次其实建成了只是没等到响应。
"""

import logging

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from plane.db.models import Risk, RiskSyncStatus
from plane.integrations import risk_sync
from plane.integrations.base import IntegrationError
from plane.integrations.jiandaoyun import create_entry_row, delete_entry_row, update_entry_row
from plane.utils.exception_logger import log_exception

logger = logging.getLogger("plane")

MAX_RETRIES = 5
RETRY_BASE_SECONDS = 60
# 修改任务到得比新建任务早（新建还没拿到 _id）：等一会再试，最多等 10 分钟
WAIT_FOR_CREATE_SECONDS = 30
WAIT_FOR_CREATE_MAX_RETRIES = 20


def _mark(risk_id, **fields):
    Risk.all_objects.filter(pk=risk_id).update(**fields)


def _mark_synced(risk_id):
    _mark(risk_id, sync_status=RiskSyncStatus.SYNCED, sync_error="", synced_at=timezone.now())


def _mark_failed(risk_id, message):
    _mark(risk_id, sync_status=RiskSyncStatus.FAILED, sync_error=message[:500])


def _handle_error(task, risk_id, exc):
    """连不上就 retry（抛 Retry，不会走到后面），其它一律标 failed。"""
    if isinstance(exc, IntegrationError):
        if exc.code == "INTEGRATION_REMOTE_UNREACHABLE" and task.request.retries < MAX_RETRIES:
            raise task.retry(exc=exc, countdown=RETRY_BASE_SECONDS * (2**task.request.retries))
        logger.warning("risk push failed: risk=%s code=%s detail=%s", risk_id, exc.code, exc.detail)
        _mark_failed(risk_id, f"{exc.code}: {exc.detail}")
        return
    log_exception(exc)
    _mark_failed(risk_id, f"INTEGRATION_INTERNAL_ERROR: {exc}")


def _load(risk_id):
    """要推的风险；不存在 / 不同步的返回 None（软删的也取：删除任务要用）。"""
    risk = Risk.all_objects.select_related("project", "workspace").filter(pk=risk_id).first()
    if risk is None or risk.external_source != risk_sync.EXTERNAL_SOURCE:
        return None
    return risk


def _ensure_enabled(risk_id):
    if risk_sync.is_push_enabled():
        return True
    _mark_failed(risk_id, "INTEGRATION_NOT_CONFIGURED: jiandaoyun write settings missing")
    return False


@shared_task(bind=True, max_retries=MAX_RETRIES)
def push_risk_create(self, risk_id):
    risk = _load(risk_id)
    if risk is None or risk.deleted_at is not None:
        return
    if risk.external_id:
        # 简道云的推送抢先一步把这条认领了（或上一次重试已绑定）：远端已有，不再建
        return
    if not _ensure_enabled(risk_id):
        return
    try:
        row = risk_sync.find_remote_duplicate(risk) if self.request.retries > 0 else None
        if row is None:
            row = create_entry_row(
                settings.JIANDAOYUN_API_CREATE_BASE_URL,
                settings.JIANDAOYUN_RISK_APP_ID,
                settings.JIANDAOYUN_RISK_ENTRY_ID,
                risk_sync.to_remote_values(risk),
            )
    except Exception as exc:  # noqa: BLE001
        _handle_error(self, risk_id, exc)
        return
    risk_sync.bind_created(risk, row)


@shared_task(bind=True, max_retries=MAX_RETRIES)
def push_risk_update(self, risk_id, fields):
    risk = _load(risk_id)
    if risk is None or risk.deleted_at is not None:
        return
    if not risk.external_id:
        if risk.sync_status == RiskSyncStatus.PENDING:
            if self.request.retries >= WAIT_FOR_CREATE_MAX_RETRIES:
                # 等了 10 分钟新建还没回来（任务丢了 / worker 没起）：标失败，详情页能「重新同步」、对账也会补
                _mark_failed(risk_id, "INTEGRATION_INTERNAL_ERROR: waited too long for the jiandaoyun record to be created")
                return
            # 新建任务还没回来：等它拿到 _id 再发这次的改动
            raise self.retry(countdown=WAIT_FOR_CREATE_SECONDS, max_retries=WAIT_FOR_CREATE_MAX_RETRIES + 1)
        # 没绑定也没在建（新建失败了）：改动留在本地，「重新同步」会连同新建一起补
        return
    if not _ensure_enabled(risk_id):
        return
    try:
        values = risk_sync.to_remote_values(risk, fields)
        if values:
            update_entry_row(
                settings.JIANDAOYUN_API_UPDATE_BASE_URL,
                settings.JIANDAOYUN_RISK_APP_ID,
                settings.JIANDAOYUN_RISK_ENTRY_ID,
                risk.external_id,
                values,
            )
    except Exception as exc:  # noqa: BLE001
        _handle_error(self, risk_id, exc)
        return
    _mark_synced(risk_id)


@shared_task(bind=True, max_retries=MAX_RETRIES)
def push_risk_delete(self, risk_id, external_id):
    if _load(risk_id) is None or not external_id:
        return
    if not _ensure_enabled(risk_id):
        return
    try:
        delete_entry_row(
            settings.JIANDAOYUN_API_DELETE_BASE_URL,
            settings.JIANDAOYUN_RISK_APP_ID,
            settings.JIANDAOYUN_RISK_ENTRY_ID,
            external_id,
        )
    except Exception as exc:  # noqa: BLE001
        _handle_error(self, risk_id, exc)
        return
    _mark_synced(risk_id)
