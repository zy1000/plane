# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from urllib.parse import parse_qs, urlparse

# Django imports
from django.http import HttpRequest, HttpResponseRedirect, JsonResponse


def wants_json(request: HttpRequest) -> bool:
    """后台提交会声明只要 JSON；浏览器原生表单提交的 Accept 里带 text/html"""
    accept = request.headers.get("Accept", "")
    return "application/json" in accept and "text/html" not in accept


def redirect_as_json(response: HttpResponseRedirect) -> JsonResponse:
    """把认证视图的重定向换成 JSON：地址里带 error_code 的是失败（400），否则是登录成功后的落地地址"""
    query = parse_qs(urlparse(response.url).query)
    if "error_code" in query:
        return JsonResponse({key: values[0] for key, values in query.items()}, status=400)
    return JsonResponse({"redirect_url": response.url})
