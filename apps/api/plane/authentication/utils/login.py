# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.contrib.auth import login
from django.conf import settings

# Module imports
from plane.authentication.adapter.error import (
    AUTHENTICATION_ERROR_CODES,
    AuthenticationException,
)
from plane.utils.host import base_host
from plane.utils.ip_address import get_client_ip
from plane.utils.network_zone import check_request_for_user, error_message


def user_login(request, user, is_app=False, is_admin=False, is_space=False):
    # 大网 / 小网：首次登录绑定来源环境，之后只能从绑定的环境登录
    zone_error = check_request_for_user(request, user)
    if zone_error:
        raise AuthenticationException(
            error_code=AUTHENTICATION_ERROR_CODES[zone_error],
            error_message=error_message(zone_error, user),
        )

    login(request=request, user=user)

    # If is admin cookie set the custom age
    if is_admin:
        request.session.set_expiry(settings.ADMIN_SESSION_COOKIE_AGE)

    device_info = {
        "user_agent": request.META.get("HTTP_USER_AGENT", ""),
        "ip_address": get_client_ip(request=request),
        "domain": base_host(request=request, is_app=is_app, is_admin=is_admin, is_space=is_space),
    }
    request.session["device_info"] = device_info
    request.session.save()
    return
