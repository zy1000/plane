"""集成公共层：错误、规格、统一执行入口、「上次同步」快照。"""

import logging
import time
from dataclasses import dataclass
from typing import Callable

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

from plane.utils.exception_logger import log_exception

logger = logging.getLogger("plane")

DIRECTION_PULL = "pull"
DIRECTION_PUSH = "push"

# 错误码 -> HTTP 状态。view 按它出状态码，前端按 code 取 i18n 文案
ERROR_HTTP_STATUS = {
    "INTEGRATION_NOT_CONFIGURED": 400,
    "INTEGRATION_SYNC_IN_PROGRESS": 409,
    "INTEGRATION_REMOTE_UNREACHABLE": 502,
    "INTEGRATION_REMOTE_UNAUTHORIZED": 502,
    "INTEGRATION_REMOTE_BAD_RESPONSE": 502,
    "INTEGRATION_TARGET_MISSING": 500,
    "INTEGRATION_INTERNAL_ERROR": 500,
}
ERROR_DETAIL_MAX_LENGTH = 500


class IntegrationError(Exception):
    """集成层可预期的失败。detail 只放状态码 / 摘要，绝不放请求 header 与 body（含 token）。"""

    def __init__(self, code, detail="", *, missing_settings=()):
        super().__init__(f"{code}: {detail}" if detail else code)
        self.code = code
        self.detail = (detail or "")[:ERROR_DETAIL_MAX_LENGTH]
        self.missing_settings = list(missing_settings)


@dataclass(frozen=True)
class IntegrationSpec:
    """一个集成的静态描述。`run(workspace, actor) -> summary dict`，失败抛 IntegrationError。"""

    key: str  # 进 URL 与 cache key，全局唯一
    name: str
    provider: str  # 如 jiandaoyun
    direction: str  # DIRECTION_PULL / DIRECTION_PUSH
    description: str
    # settings 属性名 == env 名：缺哪个，前端原样回显给运维
    required_settings: tuple
    run: Callable
    # 拉取型写入的数据字典 key；推送型 None
    target_dictionary_key: str | None = None
    # 懒读 settings，给前端展示远端表单 / 字段（只放标识符，不放密钥）
    remote_info: Callable[[], dict] | None = None

    def missing_settings(self):
        return [name for name in self.required_settings if not getattr(settings, name, "")]


# ---- 「上次同步」快照：放 Redis cache 不建表；Redis 丢了只是显示成「未同步过」 ----


def _last_sync_cache_key(workspace_id, key):
    return f"external_integration:last_sync:{workspace_id}:{key}"


def get_last_sync(workspace_id, key):
    return cache.get(_last_sync_cache_key(workspace_id, key))


def set_last_sync(workspace_id, key, snapshot):
    cache.set(_last_sync_cache_key(workspace_id, key), snapshot, timeout=None)


def _actor_snapshot(actor):
    # None = 定时任务触发
    if actor is None:
        return None
    return {"id": str(actor.id), "display_name": actor.display_name}


def _timing(started):
    return {
        "finished_at": timezone.now().isoformat(),
        "duration_ms": int((time.monotonic() - started) * 1000),
    }


def run_integration(spec, workspace, actor=None):
    """统一入口：配置检查 → 计时执行 → 成功 / 失败都写快照。view、Celery、shell 都走这里。

    未配置直接抛、不写快照（那不是一次「同步」）；其它异常记日志、写 failed 快照后原样抛出。
    """
    missing = spec.missing_settings()
    if missing:
        raise IntegrationError(
            "INTEGRATION_NOT_CONFIGURED",
            "missing settings: " + ", ".join(missing),
            missing_settings=missing,
        )
    started = time.monotonic()
    snapshot = {"triggered_by": _actor_snapshot(actor)}
    try:
        summary = spec.run(workspace, actor)
    except IntegrationError as exc:
        snapshot.update(_timing(started), status="failed", summary=None, error={"code": exc.code, "detail": exc.detail})
        set_last_sync(workspace.id, spec.key, snapshot)
        raise
    except Exception as exc:
        log_exception(exc)
        snapshot.update(
            _timing(started),
            status="failed",
            summary=None,
            error={"code": "INTEGRATION_INTERNAL_ERROR", "detail": str(exc)[:ERROR_DETAIL_MAX_LENGTH]},
        )
        set_last_sync(workspace.id, spec.key, snapshot)
        raise
    snapshot.update(_timing(started), status="success", summary=summary, error=None)
    set_last_sync(workspace.id, spec.key, snapshot)
    return snapshot
