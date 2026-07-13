from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from .base import BaseModel


class RequirementModule(BaseModel):
    product = models.ForeignKey(
        "db.Product",
        on_delete=models.CASCADE,
        related_name="requirement_modules",
        verbose_name="Product",
    )
    name = models.CharField(max_length=255, verbose_name="Requirement Module Name")

    class Meta:
        unique_together = ["product", "name", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "name"],
                condition=Q(deleted_at__isnull=True),
                name="requirement_module_unique_name_product_when_not_deleted",
            )
        ]
        verbose_name = "Requirement Module"
        verbose_name_plural = "Requirement Modules"
        db_table = "requirement_modules"
        ordering = ("-created_at",)

    def __str__(self):
        return self.name


class Requirement(BaseModel):
    class RequirementType(models.TextChoices):
        DEVELOPMENT = "development", "研发需求"
        USER = "user", "用户需求"

    PRIORITY_CHOICES = (
        ("urgent", "Urgent"),
        ("high", "High"),
        ("medium", "Medium"),
        ("low", "Low"),
        ("none", "None"),
    )

    product = models.ForeignKey(
        "db.Product",
        on_delete=models.CASCADE,
        related_name="requirements",
        verbose_name="Product",
    )
    module = models.ForeignKey(
        RequirementModule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="requirements",
        verbose_name="Requirement Module",
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="sub_requirements",
        verbose_name="Parent Requirement",
    )
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="assigned_requirements",
        verbose_name="Assignee",
    )
    reviewers = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="review_requirements",
        verbose_name="Reviewers",
    )
    name = models.CharField(max_length=255, verbose_name="Requirement Name")
    type = models.CharField(
        max_length=20,
        choices=RequirementType.choices,
        default=RequirementType.DEVELOPMENT,
        verbose_name="Requirement Type",
    )
    priority = models.CharField(
        max_length=30,
        choices=PRIORITY_CHOICES,
        default="none",
        verbose_name="Requirement Priority",
    )
    description_html = models.JSONField(
        blank=True,
        null=True,
        verbose_name="Requirement Description HTML",
    )
    acceptance_criteria_html = models.JSONField(
        blank=True,
        null=True,
        verbose_name="Requirement Acceptance Criteria HTML",
    )
    attachments = models.ManyToManyField(
        "db.FileAsset",
        through="RequirementAttachment",
        through_fields=("requirement", "asset"),
        blank=True,
        related_name="requirements",
        verbose_name="Attachments",
    )

    class Meta:
        verbose_name = "Requirement"
        verbose_name_plural = "Requirements"
        db_table = "requirements"
        ordering = ("-created_at",)

    def __str__(self):
        return self.name

    def clean(self):
        super().clean()

        if self.module_id and self.module.product_id != self.product_id:
            raise ValidationError(
                {"module": "需求模块必须属于当前需求的产品。"}
            )

        if self.parent_id:
            if self.pk and self.parent_id == self.pk:
                raise ValidationError({"parent": "需求不能将自身设为父需求。"})
            if self.parent.product_id != self.product_id:
                raise ValidationError(
                    {"parent": "父需求必须属于当前需求的产品。"}
                )

            visited = {self.pk} if self.pk else set()
            ancestor = self.parent
            while ancestor is not None:
                if ancestor.pk in visited:
                    raise ValidationError({"parent": "父需求关系不能形成循环。"})
                visited.add(ancestor.pk)
                ancestor = ancestor.parent

    def save(self, *args, **kwargs):
        self.full_clean(exclude=["created_by", "updated_by"])
        return super().save(*args, **kwargs)


class RequirementAttachment(BaseModel):
    requirement = models.ForeignKey(
        Requirement,
        on_delete=models.CASCADE,
        related_name="requirement_attachments",
        verbose_name="Requirement",
    )
    asset = models.ForeignKey(
        "db.FileAsset",
        on_delete=models.CASCADE,
        related_name="requirement_attachments",
        verbose_name="File Asset",
    )

    class Meta:
        unique_together = ["requirement", "asset", "deleted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["requirement", "asset"],
                condition=Q(deleted_at__isnull=True),
                name="requirement_attachment_unique_when_not_deleted",
            )
        ]
        verbose_name = "Requirement Attachment"
        verbose_name_plural = "Requirement Attachments"
        db_table = "requirement_attachments"
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.requirement.name} - {self.asset}"

    def clean(self):
        super().clean()

        if (
            self.asset_id
            and self.asset.workspace_id
            and self.asset.workspace_id != self.requirement.product.workspace_id
        ):
            raise ValidationError(
                {"asset": "附件必须属于需求产品所在的工作空间。"}
            )

        if self.asset_id and self.asset.product_id != self.requirement.product_id:
            raise ValidationError({"asset": "附件必须属于当前需求的产品。"})

        if (
            self.asset_id
            and self.asset.entity_type
            != self.asset.EntityTypeContext.REQUIREMENT_ATTACHMENT
        ):
            raise ValidationError({"asset": "附件类型不是需求附件。"})

        if self.asset_id and not self.asset.is_uploaded:
            raise ValidationError({"asset": "附件尚未上传完成。"})

    def save(self, *args, **kwargs):
        self.full_clean(exclude=["created_by", "updated_by"])
        return super().save(*args, **kwargs)
