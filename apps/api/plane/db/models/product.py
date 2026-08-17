from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from plane.db.mixins import TimeAuditModel

from .base import BaseModel
from .project import ProjectBaseModel


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
    cover_image = models.TextField(blank=True, null=True)
    cover_image_asset = models.ForeignKey(
        "db.FileAsset",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="product_cover_image",
    )
    logo_props = models.JSONField(default=dict)

    @property
    def cover_image_url(self):
        # 上传的 asset 优先于外链文本，与 Project.cover_image_url 同序
        if self.cover_image_asset:
            return self.cover_image_asset.asset_url
        if self.cover_image:
            return self.cover_image
        return None

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


class ProductProject(ProjectBaseModel):
    """产品与项目的关联。项目通过它确定自己能引用哪些产品的需求。

    Product 本身是工作区级的、与 Project 没有外键关系（见 docs/domain-glossary.md
    的「已知的断链」）。这张表是唯一的桥，且**只表达引用关系** —— 产品不因此归属
    某个项目，项目也不因此获得产品的写权限。

    两端必须同工作区。这条跨表规则 DB 表达不了（workspace 在各自的父表上），由
    写入口校验，见 plane/utils/requirement_project.py::resolve_linkable_products
    与 resolve_linkable_projects。
    """

    product = models.ForeignKey(
        "db.Product",
        on_delete=models.CASCADE,
        related_name="product_projects",
        verbose_name="所属产品",
    )
    # project / workspace 由 ProjectBaseModel 提供

    class Meta:
        unique_together = ["product", "project", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "project"],
                condition=models.Q(deleted_at__isnull=True),
                name="product_project_unique_when_deleted_at_null",
            )
        ]
        verbose_name = "Product Project"
        verbose_name_plural = "Product Projects"
        db_table = "product_projects"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.product.name} <-> {self.project.name}"
