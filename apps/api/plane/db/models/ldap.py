# Django imports
from django.db import models

# Module imports
from .base import BaseModel


class LdapConfig(BaseModel):
    server_url = models.CharField(max_length=255)
    bind_dn = models.CharField(max_length=255)
    bind_password = models.CharField(max_length=255)  # Stored encrypted
    base_dn = models.CharField(max_length=255)
    user_search_filter = models.CharField(max_length=255, default="(mail=%(user)s)")
    is_active = models.BooleanField(default=False)

    class Meta:
        verbose_name = "LDAP Configuration"
        verbose_name_plural = "LDAP Configurations"
        db_table = "ldap_configs"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.server_url} - {self.bind_dn}"
