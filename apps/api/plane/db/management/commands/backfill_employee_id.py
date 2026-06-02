# Django imports
from django.core.management.base import BaseCommand

# Third party imports
from ldap3 import Connection, Server, SUBTREE
from ldap3.core.exceptions import LDAPBindError, LDAPException

# Module imports
from plane.db.models import LdapConfig, User, UserExtraInfo
from plane.license.utils.encryption import decrypt_data


class Command(BaseCommand):
    help = "从 LDAP 补充完整所有用户的工号（employee_id）"

    def add_arguments(self, parser):
        parser.add_argument(
            "--overwrite",
            action="store_true",
            help="覆盖已存在的工号（默认只补充缺失的工号）",
        )

    def handle(self, *args, **options):
        overwrite = options.get("overwrite", False)

        config = LdapConfig.objects.first()
        if not config:
            self.stdout.write(self.style.WARNING("未找到 LDAP 配置，跳过"))
            return

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
            self.stdout.write(self.style.WARNING("LDAP 配置不完整，跳过"))
            return

        # 复用单个管理员连接，避免每个用户都重新绑定
        server = Server(config.server_url, connect_timeout=5)
        try:
            admin_conn = Connection(
                server,
                user=config.bind_dn,
                password=bind_password,
                auto_bind=True,
                receive_timeout=10,
            )
        except (LDAPBindError, LDAPException) as e:
            self.stdout.write(self.style.ERROR(f"LDAP 绑定失败: {e}"))
            return

        total = 0
        updated = 0
        skipped = 0

        users = User.objects.filter(email__isnull=False).exclude(email="").iterator()
        for user in users:
            total += 1

            extra_info, _ = UserExtraInfo.objects.get_or_create(user_id=user.id)

            # 默认只补充缺失的工号，已有工号的用户跳过
            if not overwrite and (extra_info.employee_id or "").strip():
                skipped += 1
                continue

            employee_id = self._fetch_employee_id(
                admin_conn=admin_conn,
                base_dn=config.base_dn,
                user_filter=config.user_search_filter,
                login=user.email,
            )

            # 当前用户取不到工号则直接跳过
            if not employee_id:
                print(1)
                skipped += 1
                continue

            extra_info.employee_id = employee_id
            extra_info.save(update_fields=["employee_id"])
            updated += 1
            self.stdout.write(f"  {user.email} -> {employee_id}")

        admin_conn.unbind()

        self.stdout.write(
            self.style.SUCCESS(
                f"完成：共处理 {total} 个用户，更新 {updated} 个工号，跳过 {skipped} 个"
            )
        )

    def _fetch_employee_id(self, *, admin_conn, base_dn, user_filter, login):
        try:
            admin_conn.search(
                search_base=base_dn,
                search_filter=user_filter % {"user": login},
                search_scope=SUBTREE,
                attributes=["employeeID"],
                size_limit=1,
            )
            if not admin_conn.entries:
                return ""

            entry = admin_conn.entries[0]
            print(entry)
            if hasattr(entry, "employeeID") and entry.employeeID.value:
                return str(entry.employeeID.value).strip()
            return ""
        except (LDAPBindError, LDAPException, ValueError):
            return ""
