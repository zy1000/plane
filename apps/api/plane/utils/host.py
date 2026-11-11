# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.http import HttpRequest

# Third party imports
from rest_framework.request import Request

# Module imports
from plane.utils.ip_address import get_client_ip


def request_origin(request: Request | HttpRequest) -> str | None:
    """用户实际访问的站点地址（scheme://host），只认 CORS_ALLOWED_ORIGINS 里登记过的。

    单入口代理挂多个对外地址（大网 / 小网各一个 IP）时，跳转要回到用户来的那个地址；
    不在名单里（直连 api、Host 被改）返回 None，由调用方回落到 WEB_URL。
    """
    raw = getattr(request, "_request", request)
    try:
        origin = f"{raw.scheme}://{raw.get_host()}"
    except Exception:
        return None
    allowed = {o.rstrip("/") for o in (getattr(settings, "CORS_ALLOWED_ORIGINS", None) or [])}
    return origin if origin in allowed else None


def base_host(
    request: Request | HttpRequest,
    is_admin: bool = False,
    is_space: bool = False,
    is_app: bool = False,
) -> str:
    """Utility function to return host / origin from the request"""
    # Calculate the base origin from request
    origin = request_origin(request)
    base_origin = origin or settings.WEB_URL or settings.APP_BASE_URL

    if not base_origin:
        raise ImproperlyConfigured("APP_BASE_URL or WEB_URL is not set")

    # Admin redirection
    if is_admin:
        admin_base_path = getattr(settings, "ADMIN_BASE_PATH", None)
        if not isinstance(admin_base_path, str):
            admin_base_path = "/god-mode/"
        if not admin_base_path.startswith("/"):
            admin_base_path = "/" + admin_base_path
        if not admin_base_path.endswith("/"):
            admin_base_path += "/"

        if settings.ADMIN_BASE_URL and not origin:
            return settings.ADMIN_BASE_URL + admin_base_path
        else:
            return base_origin + admin_base_path

    # Space redirection
    if is_space:
        space_base_path = getattr(settings, "SPACE_BASE_PATH", None)
        if not isinstance(space_base_path, str):
            space_base_path = "/spaces/"
        if not space_base_path.startswith("/"):
            space_base_path = "/" + space_base_path
        if not space_base_path.endswith("/"):
            space_base_path += "/"

        if settings.SPACE_BASE_URL and not origin:
            return settings.SPACE_BASE_URL + space_base_path
        else:
            return base_origin + space_base_path

    # App Redirection
    if is_app:
        if settings.APP_BASE_URL and not origin:
            return settings.APP_BASE_URL
        else:
            return base_origin

    return base_origin


def user_ip(request: Request | HttpRequest) -> str:
    return get_client_ip(request=request)
