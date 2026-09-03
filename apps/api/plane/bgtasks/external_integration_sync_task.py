"""每天把「拉取型」第三方集成对所有活跃工作区跑一遍。beat 计划在 plane/celery.py。"""

import logging

from celery import shared_task

from plane.db.models import Workspace
from plane.integrations.base import DIRECTION_PULL, IntegrationError, run_integration
from plane.integrations.registry import INTEGRATIONS
from plane.utils.exception_logger import log_exception

logger = logging.getLogger("plane")


@shared_task
def sync_external_integrations():
    specs = [spec for spec in INTEGRATIONS if spec.direction == DIRECTION_PULL]
    if not specs:
        return
    for workspace in Workspace.objects.filter(deleted_at__isnull=True).iterator():
        for spec in specs:
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
