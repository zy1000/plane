# Django imports
from django.core.management.base import BaseCommand
import os

# Module imports
from plane.db.models import LdapConfig
from plane.license.utils.encryption import encrypt_data


class Command(BaseCommand):
    help = "Migrate LDAP configuration from environment variables to database"

    def handle(self, *args, **options):
        if LdapConfig.objects.exists():
            self.stdout.write(self.style.WARNING("LDAP configuration already exists in database. Skipping migration."))
            return

        ldap_url = os.environ.get("LDAP_URL", "ldap://10.32.232.191:389")
        base_dn = os.environ.get("LDAP_BASE_DN", "dc=gwkf,dc=cn")
        bind_dn = os.environ.get("LDAP_BIND_DN", "cdsync1")
        bind_password = os.environ.get("LDAP_BIND_PASSWORD", "69kActpcc3C1ZkQ=")
        user_search_filter = os.environ.get("LDAP_USER_FILTER", "(mail=%(user)s)")

        if not all([ldap_url, base_dn, bind_dn, bind_password]):
            self.stdout.write(
                self.style.WARNING("LDAP environment variables are incomplete. Skipping LDAP configuration migration.")
            )
            return

        self.stdout.write("Migrating LDAP configuration...")

        LdapConfig.objects.create(
            server_url=ldap_url,
            bind_dn=bind_dn,
            bind_password=encrypt_data(bind_password),
            base_dn=base_dn,
            user_search_filter=user_search_filter,
            is_active=True,  # Activate by default if we are migrating
        )

        self.stdout.write(self.style.SUCCESS("Successfully migrated LDAP configuration to database."))
