"""大网 / 小网隔离的判定规则（见 docs/network-zone/plan.md）。

规则集中在这里，视图 / 中间件 / 模型只调函数：
- 请求来源：按可信客户端 IP 落在哪个网段判大网 / 小网；服务间互调和未知网段返回 None
- 用户归属：``User.network_zone``，空 = 未绑定；首次从可识别网段过来时绑定，之后环境不符就拒绝
- 文件归属：新建按上传人（未知 → 小网，偏严），复制继承源文件，小网人改过内容就变小网
"""

# Python imports
import logging
from urllib.parse import urlparse

# Django imports
from django.conf import settings

# Third party imports
from crum import get_current_user

# Module imports
from plane.db.models.network_zone import NetworkZone
from plane.utils.ip_address import get_client_ip, ip_in_cidrs, is_internal_request

# 登录 / 请求校验失败的错误码名，对应 AUTHENTICATION_ERROR_CODES 里的 key
ERROR_ZONE_MISMATCH = "NETWORK_ZONE_MISMATCH"
ERROR_ZONE_UNKNOWN = "NETWORK_ZONE_UNKNOWN"

ZONE_LABELS = {NetworkZone.WAN: "大网", NetworkZone.LAN: "小网"}

logger = logging.getLogger("plane.api")


def is_enabled() -> bool:
    return bool(getattr(settings, "NETWORK_ZONE_ENABLED", False))


def zone_for_ip(ip) -> str | None:
    if ip_in_cidrs(ip, getattr(settings, "NETWORK_ZONE_LAN_CIDRS", "")):
        return NetworkZone.LAN
    if ip_in_cidrs(ip, getattr(settings, "NETWORK_ZONE_WAN_CIDRS", "")):
        return NetworkZone.WAN
    return None


def request_zone(request) -> str | None:
    """本次请求来自哪个环境；服务间互调或 IP 不在两个网段里返回 None。"""
    if is_internal_request(request):
        return None
    return zone_for_ip(get_client_ip(request))


def user_zone(user) -> str | None:
    if user is None or getattr(user, "is_anonymous", False):
        return None
    return getattr(user, "network_zone", None) or None


def check_request_for_user(request, user) -> str | None:
    """已登录（或正在登录）的请求是否允许从当前环境访问。

    返回 None = 放行；否则返回错误码名。用户未绑定且来源可识别时顺手绑定（首次登录）。
    开关关着、服务间互调一律放行。
    """
    if not is_enabled() or is_internal_request(request):
        return None
    ip = get_client_ip(request)
    zone = zone_for_ip(ip)
    if zone is None:
        _log_rejected(request, user, ip, zone, ERROR_ZONE_UNKNOWN)
        return ERROR_ZONE_UNKNOWN
    bound = user_zone(user)
    if bound is None:
        user.network_zone = zone
        user.save(update_fields=["network_zone"])
        return None
    if bound != zone:
        _log_rejected(request, user, ip, zone, ERROR_ZONE_MISMATCH)
        return ERROR_ZONE_MISMATCH
    return None


def _log_rejected(request, user, ip, zone, error):
    """拒绝时把判定依据打到日志，排查网段配置 / 代理头问题不用再加打印。"""
    meta = getattr(request, "META", {}) or {}
    logger.warning(
        "大网/小网拒绝 %s user=%s 归属=%s | 判定ip=%s zone=%s | REMOTE_ADDR=%s X-Real-IP=%s X-Forwarded-For=%s",
        error,
        getattr(user, "email", None) or getattr(user, "id", None),
        user_zone(user),
        ip,
        zone,
        meta.get("REMOTE_ADDR"),
        meta.get("HTTP_X_REAL_IP"),
        meta.get("HTTP_X_FORWARDED_FOR"),
    )


def error_message(error: str, user=None) -> str:
    if error == ERROR_ZONE_MISMATCH:
        label = ZONE_LABELS.get(user_zone(user), "")
        return f"该账号属于{label}，请在{label}环境登录"
    return "无法识别当前网络环境，不允许登录"


def set_user_zone(user, zone: str | None) -> None:
    """管理员改归属：写字段并踢掉此人全部会话，换环境后旧登录立即失效。"""
    from plane.db.models import Session

    user.network_zone = zone or None
    user.save(update_fields=["network_zone"])
    Session.objects.filter(user_id=str(user.id)).delete()


def zone_web_urls() -> tuple[str, str]:
    """大网 / 小网各自的站点地址 (wan, lan)。

    显式配了 NETWORK_ZONE_*_WEB_URL 就用配置；否则从 CORS_ALLOWED_ORIGINS 里按主机 IP 落在哪个网段认，
    各取第一个。域名看不出网段，认不出来的那边返回空串。
    """
    wan = (getattr(settings, "NETWORK_ZONE_WAN_WEB_URL", "") or "").rstrip("/")
    lan = (getattr(settings, "NETWORK_ZONE_LAN_WEB_URL", "") or "").rstrip("/")
    for origin in getattr(settings, "CORS_ALLOWED_ORIGINS", None) or []:
        zone = zone_for_ip(urlparse(origin).hostname)
        if zone == NetworkZone.WAN and not wan:
            wan = origin.rstrip("/")
        elif zone == NetworkZone.LAN and not lan:
            lan = origin.rstrip("/")
    return wan, lan


def link_base_for_user(user, fallback: str | None) -> str | None:
    """邮件里链接用的站点地址：按收件人所属网段选大网 / 小网地址。

    没绑定的按最近登录 IP 推断，还判断不了（含查无此人）就用大网地址；
    哪边地址都认不出来时原样返回 fallback，即发起操作时的访问地址。
    """
    wan, lan = zone_web_urls()
    if not wan and not lan:
        return fallback
    zone = user_zone(user) or zone_for_ip(getattr(user, "last_login_ip", None))
    if zone == NetworkZone.LAN:
        return lan or fallback
    return wan or fallback


def link_base_for_email(email, fallback: str | None) -> str | None:
    """同 link_base_for_user，收件人只知道邮箱时用（邀请可能发给还没注册的人）。"""
    from plane.db.models import User

    user = User.objects.filter(email__iexact=(email or "").strip()).first() if email else None
    return link_base_for_user(user, fallback)


def upload_zone_for_user(user) -> str:
    """新上传文件的归属：只有已绑定大网的用户上传才算大网，其余一律小网。"""
    return NetworkZone.WAN if user_zone(user) == NetworkZone.WAN else NetworkZone.LAN


def upload_zone_for_current_user() -> str:
    return upload_zone_for_user(get_current_user())


def tighten_zone_for_operator(asset, user) -> bool:
    """小网用户替换了文件内容（传新版本 / 在线编辑保存）→ 文件变小网。返回是否改了值。"""
    if user_zone(user) != NetworkZone.LAN or asset.network_zone == NetworkZone.LAN:
        return False
    asset.network_zone = NetworkZone.LAN
    return True


# ---- 下载 / 查看拦截（批次 3） ----

ZONE_DOWNLOAD_DENIED = "大网环境不能下载小网上传的文件"
ZONE_VIEW_DENIED = "大网环境不能查看小网上传的文件"
# 打包下载跳过了受限文件时，响应头里带跳过数量
ZONE_SKIPPED_HEADER = "X-Zone-Skipped"


def is_image_asset(asset) -> bool:
    attrs = asset.attributes if isinstance(asset.attributes, dict) else {}
    return str(attrs.get("type") or "").lower().startswith("image/")


def requester_zone(request, user=None) -> str | None:
    """请求方的环境：已绑定用户看归属，匿名（公开页）看来源 IP。"""
    if user is None:
        user = getattr(request, "user", None)
    return user_zone(user) or request_zone(request)


def requester_restricted(request) -> bool:
    """开关开 + 请求方属大网：这种请求方拿不到小网文件。"""
    return is_enabled() and requester_zone(request) == NetworkZone.WAN


def zone_downloadable(asset_zone: str | None, restricted: bool) -> bool:
    """只知道文件归属时的判断（如需求附件引用 JSON 里存的归属）。"""
    return not restricted or asset_zone == NetworkZone.WAN


def asset_restricted(request, asset) -> bool:
    """开关开 + 请求方属大网 + 文件不属大网（小网或存量）。"""
    return requester_restricted(request) and asset.network_zone != NetworkZone.WAN


def can_view_asset(request, asset) -> bool:
    """页面内显示：受限时只有图片能看。"""
    return not asset_restricted(request, asset) or is_image_asset(asset)


def can_download_asset(request, asset) -> bool:
    return not asset_restricted(request, asset)


def split_downloadable(request, assets):
    """打包下载：分成 (可下载, 被跳过) 两组。"""
    allowed, skipped = [], []
    for asset in assets:
        (allowed if can_download_asset(request, asset) else skipped).append(asset)
    return allowed, skipped


def legacy_file_restricted(request) -> bool:
    """旧 File 表没有归属字段，一律按小网处理。"""
    return is_enabled() and requester_zone(request) == NetworkZone.WAN


def asset_zone_map(asset_ids) -> dict[str, str]:
    """一批资产 id → 归属，给只存了引用 JSON 的地方（需求附件）按批算 can_download。"""
    from plane.db.models import FileAsset

    ids = {str(item) for item in asset_ids if item}
    if not ids:
        return {}
    return {
        str(asset_id): zone
        for asset_id, zone in FileAsset.objects.filter(id__in=ids).values_list(
            "id", "network_zone"
        )
    }


def download_disposition(request, asset) -> str | None:
    """取址 / 下载接口共用：前端预览图片也走这些接口，受限图片给 inline 让页面能看；
    受限非图片返回 None（调用方 403）；不受限照常 attachment。"""
    if not asset_restricted(request, asset):
        return "attachment"
    return "inline" if is_image_asset(asset) else None
