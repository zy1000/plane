# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import logging
from functools import lru_cache
from ipaddress import ip_address, ip_network

# Django imports
from django.conf import settings

logger = logging.getLogger("plane.api")


@lru_cache(maxsize=16)
def _networks(spec: str):
    networks = []
    for part in (spec or "").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            networks.append(ip_network(part, strict=False))
        except ValueError:
            # 配错一段就整段失效，静默跳过会很难排查，记一条警告（lru_cache 保证只记一次）
            logger.warning("忽略非法网段配置 %r（来自 %r）", part, spec)
    return tuple(networks)


def ip_in_cidrs(ip, spec: str) -> bool:
    """``ip`` 是否落在逗号分隔的 CIDR 列表 ``spec`` 里；非法输入一律 False。"""
    try:
        addr = ip_address((ip or "").strip())
    except ValueError:
        return False
    # 双栈监听时 IPv4 会以 ::ffff:10.1.2.3 的形式出现，按 IPv4 比
    if addr.version == 6 and addr.ipv4_mapped is not None:
        addr = addr.ipv4_mapped
    return any(addr in network for network in _networks(spec))


def is_trusted_proxy(ip) -> bool:
    return ip_in_cidrs(ip, getattr(settings, "TRUSTED_PROXY_CIDRS", ""))


def _forwarded_ip(request):
    """可信代理写进来的客户端地址：X-Real-IP（nginx 每次覆盖），
    否则 X-Forwarded-For 的最后一段（代理自己追加的那段，前面的都可能是客户端伪造）。"""
    real_ip = (request.META.get("HTTP_X_REAL_IP") or "").strip()
    if real_ip:
        return real_ip
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR") or ""
    if forwarded.strip():
        return forwarded.rsplit(",", 1)[-1].strip()
    return ""


def get_client_ip(request):
    """返回可信的客户端 IP。

    只有连接本身来自可信代理（TRUSTED_PROXY_CIDRS：nginx 容器网段 / 本机）时才看代理写的头；
    其余情况一律用连接地址 REMOTE_ADDR，客户端自己塞的 X-Forwarded-For 不看。
    """
    remote_addr = request.META.get("REMOTE_ADDR") or ""
    if not is_trusted_proxy(remote_addr):
        return remote_addr
    return _forwarded_ip(request) or remote_addr


def is_internal_request(request) -> bool:
    """来自可信网段且没有任何转发头：服务间互调（如 live 替用户调接口），不是浏览器请求。"""
    remote_addr = request.META.get("REMOTE_ADDR") or ""
    return is_trusted_proxy(remote_addr) and not _forwarded_ip(request)
