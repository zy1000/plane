from django.core.validators import RegexValidator
from django.db import models

from .base import BaseModel


class Permission(BaseModel):
    class Scope(models.TextChoices):
        WORKSPACE = "workspace", "工作区"
        PROJECT = "project", "项目"

    key = models.CharField(
        max_length=255,
        unique=True,
        db_index=True,
        validators=[
            RegexValidator(
                regex=r"^[a-z0-9_]+(\.[a-z0-9_]+){2,}$",
                message="Permission key must use dot notation, e.g. workspace.role.view",
            )
        ],
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    scope = models.CharField(
        max_length=20,
        choices=Scope.choices,
        default=Scope.WORKSPACE
    )
    module = models.CharField(max_length=100, blank=True, null=True)
    action = models.CharField(max_length=100, blank=True, null=True)
    category = models.CharField(max_length=100, blank=True, null=True)
    sort_order = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = "permissions"
        ordering = ("scope", "module", "sort_order", "key")
        verbose_name = "Permission"
        verbose_name_plural = "Permissions"

    def __str__(self):
        return self.key
