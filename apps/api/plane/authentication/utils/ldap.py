from dataclasses import dataclass
import ssl

from ldap3 import Server, Connection, SUBTREE, Tls
from ldap3.core.exceptions import LDAPBindError, LDAPException


@dataclass(frozen=True)
class LdapUserInfo:
    dn: str
    email: str
    first_name: str
    last_name: str
    display_name: str


def ldap_verify_and_get_user(
    *,
    ldap_url: str,
    base_dn: str,
    user_filter: str,
    login: str,
    password: str,
    bind_dn: str | None = None,
    bind_password: str | None = None,
    start_tls: bool = False,
    ca_certs_file: str | None = None,
    connect_timeout: int = 5,
    receive_timeout: int = 10,
) -> LdapUserInfo:
    tls = None
    if ca_certs_file:
        tls = Tls(validate=ssl.CERT_REQUIRED, ca_certs_file=ca_certs_file)

    server = Server(ldap_url, tls=tls, connect_timeout=connect_timeout)

    try:
        # 1. Bind with service account (if provided) or try direct bind later
        if bind_dn:
            admin_conn = Connection(
                server,
                user=bind_dn,
                password=bind_password,
                auto_bind=True,
                receive_timeout=receive_timeout,
            )
            if start_tls:
                admin_conn.start_tls()

            # Search for the user DN
            admin_conn.search(
                search_base=base_dn,
                search_filter=user_filter % {"user": login},
                search_scope=SUBTREE,
                attributes=["mail", "givenName", "sn", "cn", "displayName"],
                size_limit=1,
            )
            if not admin_conn.entries:
                raise LDAPBindError("USER_NOT_FOUND")

            entry = admin_conn.entries[0]
            user_dn = entry.entry_dn
        else:
            # If no bind_dn provided, assume the login itself is the DN or constructed via filter (less common for AD)
            # But usually for search-based auth, bind_dn is needed.
            # If the user_filter implies direct DN construction (e.g. uid=%s,ou=users...), 
            # we might need different logic, but standard practice is search-then-bind.
            # For simplicity, we assume bind_dn is provided or we can't search easily.
            # Let's support a simple template case if bind_dn is missing? 
            # Actually, standard practice:
            # If no bind_dn, we can't search first. We have to guess the DN.
            # Let's assume bind_dn is configured for now as it's most robust.
            raise ValueError("LDAP_BIND_DN is required for search-based login")

        # 2. Bind with the found User DN and provided password
        user_conn = Connection(
            server,
            user=user_dn,
            password=password,
            auto_bind=True,
            receive_timeout=receive_timeout,
        )
        if start_tls:
            user_conn.start_tls()

        # 3. Retrieve user attributes (re-read from user_conn or use admin_conn's result)
        # It's safer to use the admin_conn's result for attributes as the user might not have read permissions on themselves
        # But we already have 'entry' from admin_conn.
        
        def _get(attr: str) -> str:
            if hasattr(entry, attr) and entry[attr].value:
                return str(entry[attr].value)
            return ""

        # Note: LDAP attribute names are case-insensitive, ldap3 handles this usually
        email = _get("mail") or login
        given = _get("givenName")
        sn = _get("sn")
        cn = _get("cn")
        display = _get("displayName") or cn or email.split("@")[0]

        return LdapUserInfo(
            dn=user_dn,
            email=email.strip().lower(), # Force lowercase email as requested
            first_name=given,
            last_name=sn,
            display_name=display,
        )
    except (LDAPBindError, LDAPException) as e:
        # Re-raise as LDAPBindError to be caught upstream
        raise LDAPBindError(str(e)) from e


def ldap_user_exists(
    *,
    ldap_url: str,
    base_dn: str,
    user_filter: str,
    login: str,
    bind_dn: str | None = None,
    bind_password: str | None = None,
    start_tls: bool = False,
    ca_certs_file: str | None = None,
    connect_timeout: int = 5,
    receive_timeout: int = 10,
) -> bool:
    tls = None
    if ca_certs_file:
        tls = Tls(validate=ssl.CERT_REQUIRED, ca_certs_file=ca_certs_file)

    server = Server(ldap_url, tls=tls, connect_timeout=connect_timeout)

    try:
        if bind_dn:
            admin_conn = Connection(
                server,
                user=bind_dn,
                password=bind_password,
                auto_bind=True,
                receive_timeout=receive_timeout,
            )
            if start_tls:
                admin_conn.start_tls()

            # Search for the user
            admin_conn.search(
                search_base=base_dn,
                search_filter=user_filter % {"user": login},
                search_scope=SUBTREE,
                attributes=["mail"],
                size_limit=1,
            )
            return bool(admin_conn.entries)
        else:
            # Without bind_dn, we can't search easily.
            return False
            
    except (LDAPBindError, LDAPException):
        return False


def ldap_test_connection(
    *,
    ldap_url: str,
    bind_dn: str,
    bind_password: str,
    start_tls: bool = False,
    ca_certs_file: str | None = None,
    connect_timeout: int = 5,
    receive_timeout: int = 10,
) -> bool:
    tls = None
    if ca_certs_file:
        tls = Tls(validate=ssl.CERT_REQUIRED, ca_certs_file=ca_certs_file)

    server = Server(ldap_url, tls=tls, connect_timeout=connect_timeout)
    
    try:
        conn = Connection(
            server,
            user=bind_dn,
            password=bind_password,
            auto_bind=True,
            receive_timeout=receive_timeout,
        )
        if start_tls:
            conn.start_tls()
        return True
    except (LDAPBindError, LDAPException) as e:
        raise e
