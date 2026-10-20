"""工作区级第三方集成：列表 + 手动同步 + 简道云数据推送的接收端。

业务在 plane/integrations，这里只做权限 / 签名、防重入锁与错误翻译。
"""

import hashlib
import hmac
import json
import logging

from django.conf import settings
from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.views import BaseAPIView
from plane.bgtasks.external_integration_sync_task import run_external_integration
from plane.db.models import Workspace
from plane.integrations import risk_sync
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

logger = logging.getLogger("plane")

# 同一条推送简道云失败会重发 5 次，按 DeliverId 去重；一天足够覆盖它的重试窗口
PUSH_DEDUPE_SECONDS = 24 * 60 * 60


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


class JiandaoyunRiskPushAPIView(APIView):
    """简道云「风险」表单的数据推送接收端（免登录，靠签名）。

    简道云：POST ?nonce=&timestamp=，头 X-JDY-Signature = sha1("{nonce}:{payload}:{secret}:{timestamp}")，
    payload 是原始请求体；X-JDY-DeliverId 每次推送唯一（失败重发时相同）。要在 2 秒内回 2xx，
    否则算失败、最多重发 5 次，连续失败 100 次推送会被简道云关掉 —— 所以认不出的事件也回 200。
    处理放在请求内（单条写入很快）；抛异常回 500 让简道云重发。
    """

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        secret = settings.JIANDAOYUN_RISK_PUSH_SECRET
        if not secret:
            return Response({"error": "INTEGRATION_NOT_CONFIGURED"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        payload = request.body.decode("utf-8")
        nonce = request.query_params.get("nonce", "")
        timestamp = request.query_params.get("timestamp", "")
        received = request.headers.get("X-JDY-Signature", "")
        expected = hashlib.sha1(f"{nonce}:{payload}:{secret}:{timestamp}".encode("utf-8")).hexdigest()
        if not hmac.compare_digest(expected, received):
            # 不记 secret；记到足够对照简道云那边的推送记录
            logger.warning(
                "jiandaoyun push rejected: bad signature nonce=%s timestamp=%s received=%s body_len=%s",
                nonce,
                timestamp,
                received[:16],
                len(payload),
            )
            return Response({"error": "INVALID_SIGNATURE"}, status=status.HTTP_401_UNAUTHORIZED)
        deliver_id = request.headers.get("X-JDY-DeliverId", "")
        dedupe_key = f"jiandaoyun:push:{deliver_id}"
        if deliver_id and not cache.add(dedupe_key, 1, timeout=PUSH_DEDUPE_SECONDS):
            return Response({"status": "ok", "result": "duplicate"}, status=status.HTTP_200_OK)
        try:
            body = json.loads(payload)
        except ValueError:
            return Response({"error": "INVALID_JSON"}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(body, dict):
            return Response({"error": "INVALID_JSON"}, status=status.HTTP_400_BAD_REQUEST)
        op = body.get("op")
        try:
            result = risk_sync.apply_push(op, body.get("data"))
        except Exception as exc:  # noqa: BLE001
            log_exception(exc)
            # 让简道云的重发能再处理一次（重发若沿用同一个 DeliverId，不清掉就会被当成重复丢掉）
            if deliver_id:
                cache.delete(dedupe_key)
            return Response({"error": "INTEGRATION_INTERNAL_ERROR"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        logger.info("jiandaoyun push: op=%s deliver_id=%s result=%s", op, deliver_id, result)
        return Response({"status": "ok", "result": result}, status=status.HTTP_200_OK)
