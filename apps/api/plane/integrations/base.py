"""集成公共层：错误、规格、统一执行入口、「上次同步」快照。"""

import logging
import time
from dataclasses import dataclass
from typing import Callable
from uuid import uuid4

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
    # 目标不是数据字典时自己描述：`describe_target(workspace) -> dict`，要带 kind
    describe_target: Callable | None = None
    # False = 不进每日 beat，只能在设置页手动触发
    scheduled: bool = True
    # 每日 beat 只跑返回 True 的工作区；None = 所有工作区
    schedule_filter: Callable | None = None
    # True = 设置页「立即同步」投 Celery 后台执行（跑得久、超过请求与锁的时限），前端轮询 is_running
    run_async: bool = False

    def missing_settings(self):
        return [name for name in self.required_settings if not getattr(settings, name, "")]


# ---- 防重入锁：同一工作区同一集成同时只跑一个。手动接口、后台任务、每日 beat 共用 ----

SYNC_LOCK_TIMEOUT_SECONDS = 120
# 后台执行的集成跑得久；锁也是前端「同步中」的依据，worker 没起来时最多挂这么久
ASYNC_SYNC_LOCK_TIMEOUT_SECONDS = 30 * 60


def _sync_lock_cache_key(workspace_id, key):
    return f"external_integration:lock:{workspace_id}:{key}"


def _sync_lock_timeout(spec):
    return ASYNC_SYNC_LOCK_TIMEOUT_SECONDS if spec.run_async else SYNC_LOCK_TIMEOUT_SECONDS


def acquire_sync_lock(spec, workspace_id):
    """拿到锁返回令牌，拿不到返回 None。释放要凭令牌，免得删掉锁过期后别人重新拿到的那把。"""
    token = uuid4().hex
    if cache.add(_sync_lock_cache_key(workspace_id, spec.key), token, timeout=_sync_lock_timeout(spec)):
        return token
    return None


def claim_sync_lock(spec, workspace_id, token):
    """后台任务开跑前确认锁还归自己：任务排队期间锁可能已过期，甚至已被下一次点击拿走。

    仍是自己的就续期；过期了没人拿就重新拿上；被别人拿走返回 False，这次任务不该再跑。
    """
    key = _sync_lock_cache_key(workspace_id, spec.key)
    current = cache.get(key)
    if current == token:
        cache.set(key, token, timeout=_sync_lock_timeout(spec))
        return True
    if current is None:
        return cache.add(key, token, timeout=_sync_lock_timeout(spec))
    return False


def release_sync_lock(spec, workspace_id, token):
    # 先读后删不是原子的；两步之间恰好过期又被别人拿走的窗口可以忽略（锁时限远长于一次同步）
    key = _sync_lock_cache_key(workspace_id, spec.key)
    if cache.get(key) == token:
        cache.delete(key)


def is_sync_running(spec, workspace_id):
    return cache.get(_sync_lock_cache_key(workspace_id, spec.key)) is not None


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


def ensure_configured(spec):
    missing = spec.missing_settings()
    if missing:
        raise IntegrationError(
            "INTEGRATION_NOT_CONFIGURED",
            "missing settings: " + ", ".join(missing),
            missing_settings=missing,
        )


def run_integration(spec, workspace, actor=None):
    """统一入口：配置检查 → 计时执行 → 成功 / 失败都写快照。view、Celery、shell 都走这里。

    未配置直接抛、不写快照（那不是一次「同步」）；其它异常记日志、写 failed 快照后原样抛出。
    """
    ensure_configured(spec)
    started = time.monotonic()
    snapshot = {"triggered_by": _actor_snapshot(actor)}
    try:
        summary = spec.run(workspace, actor)
    except IntegrationError as exc:
        snapshot.update(_timing(started), status="failed", summary=None, error={"code": exc.code, "detail": exc.detail})
        set_last_sync(workspace.id, spec.key, snapshot)
        logger.warning(
            "external integration failed: workspace=%s integration=%s code=%s detail=%s",
            workspace.slug,
            spec.key,
            exc.code,
            exc.detail,
        )
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
    logger.info(
        "external integration synced: workspace=%s integration=%s duration_ms=%s summary=%s",
        workspace.slug,
        spec.key,
        snapshot["duration_ms"],
        summary,
    )
    return snapshot
