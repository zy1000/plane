"""工作区级第三方集成：列表 + 手动同步。业务在 plane/integrations，这里只做权限、防重入锁与错误翻译。"""

from django.core.cache import cache
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.views import BaseAPIView
from plane.db.models import Workspace
from plane.integrations.base import ERROR_HTTP_STATUS, IntegrationError, run_integration
from plane.integrations.registry import INTEGRATIONS, describe_integration, get_integration

SYNC_LOCK_TIMEOUT_SECONDS = 120


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
        lock_key = f"external_integration:lock:{workspace.id}:{spec.key}"
        if not cache.add(lock_key, 1, timeout=SYNC_LOCK_TIMEOUT_SECONDS):
            return Response(
                {"error": "INTEGRATION_SYNC_IN_PROGRESS", "integration": describe_integration(spec, workspace)},
                status=status.HTTP_409_CONFLICT,
            )
        try:
            result = run_integration(spec, workspace, actor=request.user)
        except IntegrationError as exc:
            # requests 的异常若逃到 handle_exception 会变成裸 500；失败快照已在 run_integration 里写好，
            # 一并把 integration 带回去，前端就地更新卡片
            return Response(
                {
                    "error": exc.code,
                    "detail": exc.detail,
                    "missing_settings": exc.missing_settings,
                    "integration": describe_integration(spec, workspace),
                },
                status=ERROR_HTTP_STATUS.get(exc.code, status.HTTP_502_BAD_GATEWAY),
            )
        finally:
            cache.delete(lock_key)
        return Response(
            {"integration": describe_integration(spec, workspace), "result": result},
            status=status.HTTP_200_OK,
        )
