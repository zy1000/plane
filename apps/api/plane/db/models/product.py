from django.db import models
from django.conf import settings
from django.db.models import Q

from .base import BaseModel


class Product(BaseModel):
    NETWORK_CHOICES = ((0, "Secret"), (2, "Public"))
    name = models.CharField(max_length=255, verbose_name="Product Name")
    description_html = models.JSONField(verbose_name="Product Description HTML", blank=True, null=True)
    network = models.PositiveSmallIntegerField(default=2, choices=NETWORK_CHOICES)

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="product_owner",
        verbose_name="Owner",
        null=True,
        blank=True,
    )
    workspace = models.ForeignKey("db.WorkSpace", on_delete=models.CASCADE, related_name="workspace_product")

    class Meta:
        unique_together = [["name", "workspace", "deleted_at"]]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "workspace"],
                condition=Q(deleted_at__isnull=True),
                name="product_unique_name_workspace_when_deleted_at_null",
            )
        ]
        verbose_name = "Product"
        verbose_name_plural = "Products"
        db_table = "products"
        ordering = ("-created_at",)

    def __str__(self):
        return self.name


class ProductMember(BaseModel):
    product = models.ForeignKey(
        Product,
        on_delete=models.CASCADE,
    )
    member = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="member_product",
    )

    class Meta:
        unique_together = ["product", "member", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "member"],
                condition=Q(deleted_at__isnull=True),
                name="product_member_unique_product_member_when_deleted_at_null",
            )
        ]
        verbose_name = "Product Member"
        verbose_name_plural = "Product Members"
        db_table = "product_members"
        ordering = ("-created_at",)
