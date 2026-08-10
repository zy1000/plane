from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from plane.db.mixins import TimeAuditModel

from .base import BaseModel


class Product(BaseModel):
    NETWORK_CHOICES = ((0, "Secret"), (2, "Public"))

    name = models.CharField(max_length=255)
    identifier = models.CharField(
        max_length=12, db_index=True, verbose_name="产品标识（需求编号前缀）"
    )
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

    def save(self, *args, **kwargs):
        # 最后一道防线 —— 真正的归一化在 ProductSerializer.validate_identifier，
        # 那里必须先归一化再查重，否则 "ecom" 会绕过查重直接撞 DB 约束。
        if self.identifier:
            self.identifier = self.identifier.strip().upper()
        return super().save(*args, **kwargs)

    class Meta:
        db_table = "products"
        ordering = ("-created_at",)

        constraints = [
            models.UniqueConstraint(
                fields=["name", "workspace"],
                condition=models.Q(deleted_at__isnull=True),
                name="product_unique_name_workspace_deleted_at__isnull",
            ),
            # 标识是需求编号的前缀（ECOM-1）。带 deleted_at 条件是刻意的：
            # 标识由用户手填，产品删掉之后应该允许改嫁给新产品。
            # 需求行上的 sequence_id 则相反，见 Requirement.Meta.constraints。
            models.UniqueConstraint(
                fields=["identifier", "workspace"],
                condition=models.Q(deleted_at__isnull=True),
                name="product_unique_identifier_workspace_active",
            ),
            # 空标识撑不起 ECOM-1。没有它，第一个漏填的产品会静默拿到 ''，
            # 直到同工作区第二个漏填的产品才报唯一约束 —— 那时排查现场已经不在了。
            models.CheckConstraint(
                check=~models.Q(identifier=""),
                name="product_identifier_not_blank",
            ),
        ]


class ProductMember(TimeAuditModel):
    id = models.AutoField(primary_key=True)
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
    custom_roles = models.ManyToManyField(
        "db.ProductRole",
        through="ProductMemberRole",
        blank=True,
        related_name="role_members",
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
    id = models.AutoField(primary_key=True)
    product = models.ForeignKey(
        "db.Product", on_delete=models.CASCADE, related_name="roles"
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    permissions = models.JSONField(default=dict)

    class Meta:
        db_table = "product_roles"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["product", "name"],
                name="product_role_unique_name_product",
            )
        ]


class ProductMemberRole(TimeAuditModel):
    """ProductMember ↔ ProductRole M2M through model."""

    id = models.AutoField(primary_key=True)
    member = models.ForeignKey(
        ProductMember,
        on_delete=models.CASCADE,
        related_name="member_roles",
    )
    role = models.ForeignKey(
        ProductRole,
        on_delete=models.CASCADE,
        related_name="role_member_entries",
    )

    def clean(self):
        if (
            self.member_id
            and self.role_id
            and self.member.product_id != self.role.product_id
        ):
            raise ValidationError(
                {"role": "Role must belong to the same product as the member."}
            )

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)

    class Meta:
        db_table = "product_member_roles"
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["member", "role"],
                name="product_member_role_unique_member_role",
            )
        ]

    def __str__(self):
        return f"{self.member} -> {self.role.name}"
