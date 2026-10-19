"""工作区级第三方集成：列表 + 手动同步。业务在 plane/integrations，这里只做权限、防重入锁与错误翻译。"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.views import BaseAPIView
from plane.bgtasks.external_integration_sync_task import run_external_integration
from plane.db.models import Workspace
from plane.integrations.base import (
    ERROR_HTTP_STATUS,
    IntegrationError,
    acquire_sync_lock,
    ensure_configured,
    release_sync_lock,
    run_integration,
)
from plane.integrations.registry import INTEGRATIONS, describe_integration, get_integration
from plane.utils.exception_logger import log_exception


def _get_workspace(slug):
    return Workspace.objects.filter(slug=slug).first()


class ExternalIntegrationListAPIView(BaseAPIView):
    @allow_fine_permission(PermissionKey.WORKSPACE_SETTINGS_VIEW, level="WORKSPACE")
    def get(self, request, slug):
        workspace = _get_workspace(slug)
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            [describe_integration(spec, workspace) for spec in INTEGRATIONS],
            status=status.HTTP_200_OK,
        )


class ExternalIntegrationSyncAPIView(BaseAPIView):
    @allow_fine_permission(PermissionKey.WORKSPACE_SETTINGS_EDIT, level="WORKSPACE")
    def post(self, request, slug, key):
        workspace = _get_workspace(slug)
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)
        spec = get_integration(key)
        if spec is None:
            return Response({"error": "INTEGRATION_NOT_FOUND"}, status=status.HTTP_404_NOT_FOUND)

        # 同一工作区同一集成同时只跑一个：远端拉取要几秒到几十秒，连点两次没必要打两次网关
        lock_token = acquire_sync_lock(spec, workspace.id)
        if lock_token is None:
            return Response(
                {"error": "INTEGRATION_SYNC_IN_PROGRESS", "integration": describe_integration(spec, workspace)},
                status=status.HTTP_409_CONFLICT,
            )
        if spec.run_async:
            return self._enqueue(request, spec, workspace, lock_token)
        try:
            result = run_integration(spec, workspace, actor=request.user)
        except IntegrationError as exc:
            # requests 的异常若逃到 handle_exception 会变成裸 500；失败快照已在 run_integration 里写好，
            # 一并把 integration 带回去，前端就地更新卡片
            return self._error_response(exc, spec, workspace)
        finally:
            release_sync_lock(spec, workspace.id, lock_token)
        return Response(
            {"integration": describe_integration(spec, workspace), "result": result},
            status=status.HTTP_200_OK,
        )

    def _enqueue(self, request, spec, workspace, lock_token):
        """后台执行：锁连同令牌交给 Celery 任务，跑完由任务释放；202 带回 is_running=True 的 integration，前端轮询。"""
        try:
            # 未配置当场报错，别让任务进队列才失败
            ensure_configured(spec)
            run_external_integration.delay(str(workspace.id), spec.key, str(request.user.id), lock_token)
        except IntegrationError as exc:
            release_sync_lock(spec, workspace.id, lock_token)
            return self._error_response(exc, spec, workspace)
        except Exception as exc:  # noqa: BLE001
            # broker 不通：锁不放的话卡片会一直「同步中」
            release_sync_lock(spec, workspace.id, lock_token)
            log_exception(exc)
            return self._error_response(
                IntegrationError("INTEGRATION_INTERNAL_ERROR", "failed to enqueue sync task"), spec, workspace
            )
        return Response(
            {"integration": describe_integration(spec, workspace), "result": None},
            status=status.HTTP_202_ACCEPTED,
        )

    def _error_response(self, exc, spec, workspace):
        return Response(
            {
                "error": exc.code,
                "detail": exc.detail,
                "missing_settings": exc.missing_settings,
                "integration": describe_integration(spec, workspace),
            },
            status=ERROR_HTTP_STATUS.get(exc.code, status.HTTP_502_BAD_GATEWAY),
        )
