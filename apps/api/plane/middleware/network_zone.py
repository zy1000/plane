# Django imports
from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin

# Module imports
from plane.authentication.adapter.error import AUTHENTICATION_ERROR_CODES
from plane.utils.network_zone import (
    check_request_for_user,
    error_message,
    is_enabled,
)


class NetworkZoneMiddleware(MiddlewareMixin):
    """大网 / 小网隔离：每个带会话的请求都校验「本次来源环境 = 本人归属」。

    不符就作废会话并返回 401，前端收到 401 会跳回登录页，登录时再给出明确提示。
    API Token 请求不经过会话，在 APIKeyAuthentication 里单独校验。
    """

    def process_request(self, request):
        if not is_enabled():
            return None
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            return None
        error = check_request_for_user(request, user)
        if error is None:
            return None
        try:
            request.session.flush()
        except Exception:
            pass
        return JsonResponse(
            {
                "error": error_message(error, user),
                "error_code": AUTHENTICATION_ERROR_CODES[error],
            },
            status=401,
        )
