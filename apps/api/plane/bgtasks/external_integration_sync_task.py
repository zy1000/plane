"""第三方集成的 Celery 入口：每日 beat 跑「拉取型」且 scheduled 的集成；设置页「立即同步」对 run_async 的集成投这里。

beat 计划在 plane/celery.py。
"""

import logging

from celery import shared_task

from plane.db.models import User, Workspace
from plane.integrations.base import (
    DIRECTION_PULL,
    IntegrationError,
    acquire_sync_lock,
    claim_sync_lock,
    release_sync_lock,
    run_integration,
)
from plane.integrations.registry import INTEGRATIONS, get_integration
from plane.utils.exception_logger import log_exception

logger = logging.getLogger("plane")


@shared_task
def sync_external_integrations():
    specs = [spec for spec in INTEGRATIONS if spec.direction == DIRECTION_PULL and spec.scheduled]
    if not specs:
        return
    for workspace in Workspace.objects.filter(deleted_at__isnull=True).iterator():
        for spec in specs:
            if spec.schedule_filter is not None and not spec.schedule_filter(workspace):
                continue
            # 和手动同步共用一把锁：有人正在手动跑就跳过这一轮
            lock_token = acquire_sync_lock(spec, workspace.id)
            if lock_token is None:
                continue
            try:
                # actor=None：快照显示为定时任务
                snapshot = run_integration(spec, workspace)
                logger.info(
                    "external integration synced: workspace=%s integration=%s summary=%s",
                    workspace.slug,
                    spec.key,
                    snapshot.get("summary"),
                )
            except IntegrationError as exc:
                # 未配置 / 远端故障：快照已写（未配置除外），只记 warning，别让一个工作区挡住其它的
                logger.warning(
                    "external integration sync failed: workspace=%s integration=%s code=%s detail=%s",
                    workspace.slug,
                    spec.key,
                    exc.code,
                    exc.detail,
                )
            except Exception as exc:  # noqa: BLE001
                log_exception(exc)
            finally:
                release_sync_lock(spec, workspace.id, lock_token)


@shared_task
def run_external_integration(workspace_id, key, actor_id, lock_token):
    """设置页手动触发的后台同步。锁由 view 加好、令牌随任务传来，跑完只释放自己那把；
    结果写进「上次同步」快照，前端轮询拿。"""
    spec = get_integration(key)
    if spec is None:
        return
    # 排队太久时锁可能已被下一次点击拿走：那次会自己跑，这次不跑，也不碰它的锁
    if not claim_sync_lock(spec, workspace_id, lock_token):
        logger.info("external integration task superseded: workspace=%s integration=%s", workspace_id, key)
        return
    workspace = Workspace.objects.filter(id=workspace_id).first()
    try:
        if workspace is None:
            return
        actor = User.objects.filter(id=actor_id).first() if actor_id else None
        try:
            run_integration(spec, workspace, actor=actor)
        except IntegrationError:
            # 失败快照已在 run_integration 里写好
            pass
        except Exception as exc:  # noqa: BLE001
            log_exception(exc)
    finally:
        release_sync_lock(spec, workspace_id, lock_token)
