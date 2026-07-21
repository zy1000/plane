from django.conf import settings
from django.db import models

from plane.db.mixins import TimeAuditModel

from .base import BaseModel


class Product(BaseModel):
    NETWORK_CHOICES = ((0, "Secret"), (2, "Public"))

    name = models.CharField(max_length=255)
    description_html = models.TextField(
        verbose_name="Product Description HTML", blank=True, null=True
    )
    network = models.PositiveSmallIntegerField(default=2, choices=NETWORK_CHOICES)

    workspace = models.ForeignKey(
        "db.WorkSpace", on_delete=models.CASCADE, related_name="products"
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_products",
    )
    reviewers = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        related_name="reviewed_products",
        blank=True,
        verbose_name="评审人",
    )

    class Meta:
        db_table = "products"
        ordering = ("-created_at",)

        constraints = [
            models.UniqueConstraint(
                fields=["name", "workspace"],
                condition=models.Q(deleted_at__isnull=True),
                name="product_unique_name_workspace_deleted_at__isnull",
            )
        ]


class ProductMember(TimeAuditModel):
    id = models.IntegerField(primary_key=True)
    product = models.ForeignKey(
        "db.Product", on_delete=models.CASCADE, related_name="member_product"
    )
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="member_product",
    )

    class Meta:
        db_table = "product_members"
        constraints = [
            models.UniqueConstraint(
                fields=["product", "member"],
                name="product_member_unique",
            )
        ]
        ordering = ("-created_at",)

    def __str__(self):
        """Return members of the project"""
        return f"{self.member.email} <{self.product.name}>"


class ProductRole(TimeAuditModel):
    id = models.IntegerField(primary_key=True)
    name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True, null=True)
    permissions = models.JSONField(default=dict)

    class Meta:
        db_table = "product_roles"
        ordering = ("-created_at",)
