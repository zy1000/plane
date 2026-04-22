import ssl

from django.utils import timezone
from ldap3 import Connection, SUBTREE, Server, Tls
from ldap3.core.exceptions import LDAPBindError, LDAPException
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from plane.db.models import LdapConfig, User, UserExtraInfo
from plane.license.utils.encryption import decrypt_data
from plane.utils.exception_logger import log_exception


def _search_ldap_user_profile(
    *,
    ldap_url,
    base_dn,
    user_filter,
    login,
    bind_dn,
    bind_password,
    start_tls=False,
    ca_certs_file=None,
    connect_timeout=5,
    receive_timeout=10,
):
    tls = None
    if ca_certs_file:
        tls = Tls(validate=ssl.CERT_REQUIRED, ca_certs_file=ca_certs_file)

    server = Server(ldap_url, tls=tls, connect_timeout=connect_timeout)

    try:
        admin_conn = Connection(
            server,
            user=bind_dn,
            password=bind_password,
            auto_bind=True,
            receive_timeout=receive_timeout,
        )
        if start_tls:
            admin_conn.start_tls()

        admin_conn.search(
            search_base=base_dn,
            search_filter=user_filter % {"user": login},
            search_scope=SUBTREE,
            attributes=[
                "mail",
                "givenName",
                "sn",
                "cn",
                "displayName",
                "department",
                "description",
                "employeeID",
            ],
            size_limit=1,
        )

        if not admin_conn.entries:
            return None

        entry = admin_conn.entries[0]

        def _get(attr):
            if hasattr(entry, attr) and entry[attr].value:
                return str(entry[attr].value).strip()
            return ""

        return {
            "display_name": _get("description"),
            "department": _get("department"),
            "employee_id": _get("employeeID"),
            "cn": _get("cn"),
        }
    except (LDAPBindError, LDAPException, ValueError):
        return None


class LdapUserSyncAPIView(APIView):
    """
    从 LDAP 同步已存在用户的 display_name 与 UserExtraInfo（department / employee_id / cn）。

    - 无需鉴权，无需参数
    - 只补齐缺失字段，不覆盖已手工维护的数据
    - 逻辑与迁移 0221_backfill_ldap_user_display_name_and_extra_info 保持一致
    """

    authentication_classes = []
    permission_classes = []

    def post(self, request):
        return self._run_sync()

    def get(self, request):
        return self._run_sync()

    def _run_sync(self):
        config = LdapConfig.objects.first()
        if not config:
            return Response(
                {
                    "status": "skipped",
                    "reason": "LDAP_NOT_CONFIGURED",
                    "message": "未找到 LDAP 配置",
                },
                status=status.HTTP_200_OK,
            )

        bind_password = (
            decrypt_data(config.bind_password) if config.bind_password else ""
        )
        if not all(
            [
                config.server_url,
                config.base_dn,
                config.bind_dn,
                bind_password,
                config.user_search_filter,
            ]
        ):
            return Response(
                {
                    "status": "skipped",
                    "reason": "LDAP_CONFIG_INCOMPLETE",
                    "message": "LDAP 配置不完整",
                },
                status=status.HTTP_200_OK,
            )

        total = 0
        matched = 0
        updated_users = 0
        updated_extra_info = 0
        failed = 0

        users = User.objects.filter(email__isnull=False).exclude(email="").iterator()

        for user in users:
            total += 1
            try:
                profile = _search_ldap_user_profile(
                    ldap_url=config.server_url,
                    base_dn=config.base_dn,
                    user_filter=config.user_search_filter,
                    login=user.email,
                    bind_dn=config.bind_dn,
                    bind_password=bind_password,
                )
                if not profile:
                    continue

                matched += 1

                update_user_fields = []
                current_display_name = (user.display_name or "").strip()
                desired_display_name = (profile.get("display_name") or "").strip()
                default_display_name = (
                    user.email.split("@")[0] if user.email and "@" in user.email else ""
                )

                if desired_display_name and (
                    not current_display_name
                    or current_display_name == default_display_name
                ):
                    user.display_name = desired_display_name
                    update_user_fields.append("display_name")

                if update_user_fields:
                    user.save(update_fields=update_user_fields)
                    updated_users += 1

                extra_info, _ = UserExtraInfo.objects.get_or_create(user_id=user.id)
                update_extra_fields = []

                department = (profile.get("department") or "").strip()
                employee_id = (profile.get("employee_id") or "").strip()
                cn = (profile.get("cn") or "").strip()

                if department and not (extra_info.department or "").strip():
                    extra_info.department = department
                    update_extra_fields.append("department")

                if employee_id and not (extra_info.employee_id or "").strip():
                    extra_info.employee_id = employee_id
                    update_extra_fields.append("employee_id")

                if cn and not (extra_info.cn or "").strip():
                    extra_info.cn = cn
                    update_extra_fields.append("cn")

                if update_extra_fields:
                    extra_info.save(update_fields=update_extra_fields)
                    updated_extra_info += 1
            except Exception as exc:
                failed += 1
                log_exception(exc)
                continue

        return Response(
            {
                "status": "ok",
                "timestamp": timezone.now().isoformat(),
                "total_users": total,
                "ldap_matched": matched,
                "updated_users": updated_users,
                "updated_extra_info": updated_extra_info,
                "failed": failed,
            },
            status=status.HTTP_200_OK,
        )
