# Python imports
import os

# Module imports
from plane.authentication.adapter.credential import CredentialAdapter
from plane.authentication.adapter.error import (
    AUTHENTICATION_ERROR_CODES,
    AuthenticationException,
)
from plane.license.utils.instance_value import get_configuration_value
from plane.authentication.utils.ldap import ldap_verify_and_get_user, ldap_user_exists


class LdapProvider(CredentialAdapter):
    provider = "ldap"

    def __init__(self, request, key=None, code=None, is_signup=False, callback=None):
        super().__init__(request=request, provider=self.provider, callback=callback)
        self.key = key
        self.code = code
        self.is_signup = is_signup

        (ENABLE_LDAP,) = get_configuration_value(
            [{"key": "ENABLE_LDAP", "default": os.environ.get("ENABLE_LDAP", "1")}]
        )
        # Note: We don't raise exception here for check_exists to work safely
        self.is_enabled = ENABLE_LDAP == "1"
        
        if not self.is_enabled and code:
             # Only raise if trying to authenticate with password
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["PASSWORD_LOGIN_DISABLED"], 
                error_message="LDAP_AUTHENTICATION_DISABLED",
            )

    def _get_config(self):
        # Try fetching from DB first
        from plane.db.models import LdapConfig
        from plane.license.utils.encryption import decrypt_data

        config = LdapConfig.objects.first()
        if config:
            return (
                config.server_url,
                config.base_dn,
                config.user_search_filter,
                config.bind_dn,
                decrypt_data(config.bind_password),
                "0",  # STARTTLS not supported in DB config yet
                None, # CA Cert not supported in DB config yet
            )
        raise AuthenticationException(
            error_code=AUTHENTICATION_ERROR_CODES["INSTANCE_NOT_CONFIGURED"],
            error_message="LDAP_NOT_CONFIGURED",
        )

    def set_user_data(self):
        (
            LDAP_URL,
            LDAP_BASE_DN,
            LDAP_USER_FILTER,
            LDAP_BIND_DN,
            LDAP_BIND_PASSWORD,
            LDAP_STARTTLS,
            LDAP_CA_CERT_FILE,
        ) = self._get_config()

        if not all([LDAP_URL, LDAP_BASE_DN, LDAP_BIND_DN, LDAP_BIND_PASSWORD]):
             raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["INSTANCE_NOT_CONFIGURED"],
                error_message="LDAP_NOT_CONFIGURED",
            )

        try:
            info = ldap_verify_and_get_user(
                ldap_url=LDAP_URL,
                base_dn=LDAP_BASE_DN,
                user_filter=LDAP_USER_FILTER,
                login=self.key,
                password=self.code,
                bind_dn=LDAP_BIND_DN,
                bind_password=LDAP_BIND_PASSWORD,
                start_tls=(LDAP_STARTTLS == "1"),
                ca_certs_file=LDAP_CA_CERT_FILE or None,
            )
        except Exception as e:
            # Any LDAP error (bind failed, user not found, connection error)
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES["AUTHENTICATION_FAILED_SIGN_IN"],
                error_message="AUTHENTICATION_FAILED_SIGN_IN",
                payload={"email": str(self.key), "details": str(e)},
            )

        # Set user data for complete_login_or_signup
        # Note: is_password_autoset=True ensures we don't save the LDAP password locally
        super().set_user_data(
            {
                "email": info.email,
                "user": {
                    "avatar": "",
                    "first_name": info.first_name,
                    "last_name": info.last_name,
                    "provider_id": info.dn,
                    "is_password_autoset": True,
                },
            }
        )

    def check_exists(self):
        if not self.is_enabled:
            return False

        (
            LDAP_URL,
            LDAP_BASE_DN,
            LDAP_USER_FILTER,
            LDAP_BIND_DN,
            LDAP_BIND_PASSWORD,
            LDAP_STARTTLS,
            LDAP_CA_CERT_FILE,
        ) = self._get_config()

        if not all([LDAP_URL, LDAP_BASE_DN, LDAP_BIND_DN, LDAP_BIND_PASSWORD]):
            return False

        return ldap_user_exists(
            ldap_url=LDAP_URL,
            base_dn=LDAP_BASE_DN,
            user_filter=LDAP_USER_FILTER,
            login=self.key,
            bind_dn=LDAP_BIND_DN,
            bind_password=LDAP_BIND_PASSWORD,
            start_tls=(LDAP_STARTTLS == "1"),
            ca_certs_file=LDAP_CA_CERT_FILE or None,
        )
