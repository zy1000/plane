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

    class Status(models.TextChoices):
        IN_REVIEW = "in_review", "评审中"
        ACTIVE = "active", "激活"
        REJECTED = "rejected", "拒绝"

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
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.IN_REVIEW,
        db_index=True,
        verbose_name="Requirement Status",
    )
    current_version = models.PositiveIntegerField(
        default=0,
        verbose_name="Current Requirement Version",
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
            raise ValidationError({"module": "需求模块必须属于当前需求的产品。"})

        if self.parent_id:
            if self.pk and self.parent_id == self.pk:
                raise ValidationError({"parent": "需求不能将自身设为父需求。"})
            if self.parent.product_id != self.product_id:
                raise ValidationError({"parent": "父需求必须属于当前需求的产品。"})
            if self.type == self.RequirementType.USER and self.parent.type != self.RequirementType.USER:
                raise ValidationError({"parent": "用户需求只能选择用户需求作为父需求。"})

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
            raise ValidationError({"asset": "附件必须属于需求产品所在的工作空间。"})

        if self.asset_id and self.asset.product_id != self.requirement.product_id:
            raise ValidationError({"asset": "附件必须属于当前需求的产品。"})

        if self.asset_id and self.asset.entity_type != self.asset.EntityTypeContext.REQUIREMENT_ATTACHMENT:
            raise ValidationError({"asset": "附件类型不是需求附件。"})

        if self.asset_id and not self.asset.is_uploaded:
            raise ValidationError({"asset": "附件尚未上传完成。"})

    def save(self, *args, **kwargs):
        self.full_clean(exclude=["created_by", "updated_by"])
        return super().save(*args, **kwargs)


class RequirementChangeStatus(models.TextChoices):
    PENDING = "pending", "待评审"
    APPROVED = "approved", "已通过"
    REJECTED = "rejected", "已拒绝"
    SUPERSEDED = "superseded", "已替代"


class RequirementChangeKind(models.TextChoices):
    INITIAL = "initial", "初始创建"
    CHANGE = "change", "需求变更"
    SYSTEM_RESET = "system_reset", "系统重置"


class RequirementReviewOpinion(models.TextChoices):
    APPROVED = "approved", "通过"
    REJECTED = "rejected", "拒绝"
    NEEDS_CLARIFICATION = "needs_clarification", "有待明确"


class RequirementVersion(BaseModel):
    requirement = models.ForeignKey(
        Requirement,
        on_delete=models.CASCADE,
        related_name="versions",
        verbose_name="Requirement",
    )
    version = models.PositiveIntegerField(verbose_name="Version Number")
    source_change = models.OneToOneField(
        "db.RequirementChange",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="published_version",
        verbose_name="Approved Requirement Change",
    )
    snapshot = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="Requirement Snapshot",
    )
    source = models.CharField(
        max_length=30,
        default="review",
        verbose_name="Version Source",
    )
    attachments = models.ManyToManyField(
        "db.FileAsset",
        through="RequirementVersionAttachment",
        through_fields=("version", "asset"),
        blank=True,
        related_name="requirement_versions",
        verbose_name="Version Attachments",
    )

    class Meta:
        verbose_name = "Requirement Version"
        verbose_name_plural = "Requirement Versions"
        db_table = "requirement_versions"
        ordering = ("-version",)
        constraints = [
            models.UniqueConstraint(
                fields=["requirement", "version"],
                condition=Q(deleted_at__isnull=True),
                name="requirement_version_unique_when_not_deleted",
            )
        ]

    def __str__(self):
        return f"{self.requirement_id} - V{self.version}"


class RequirementChange(BaseModel):
    requirement = models.ForeignKey(
        Requirement,
        on_delete=models.CASCADE,
        related_name="changes",
        verbose_name="Requirement",
    )
    sequence = models.PositiveIntegerField(verbose_name="Change Sequence")
    kind = models.CharField(
        max_length=20,
        choices=RequirementChangeKind.choices,
        default=RequirementChangeKind.CHANGE,
        verbose_name="Change Kind",
    )
    status = models.CharField(
        max_length=20,
        choices=RequirementChangeStatus.choices,
        default=RequirementChangeStatus.PENDING,
        db_index=True,
        verbose_name="Change Status",
    )
    base_version = models.ForeignKey(
        RequirementVersion,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="based_changes",
        verbose_name="Base Version",
    )
    base_snapshot = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="Base Snapshot",
    )
    proposal_snapshot = models.JSONField(
        default=dict,
        blank=True,
        verbose_name="Proposal Snapshot",
    )
    name = models.CharField(max_length=255, verbose_name="Proposed Requirement Name")
    priority = models.CharField(
        max_length=30,
        choices=Requirement.PRIORITY_CHOICES,
        default="none",
        verbose_name="Proposed Requirement Priority",
    )
    module = models.ForeignKey(
        RequirementModule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="proposed_requirement_changes",
        verbose_name="Proposed Requirement Module",
    )
    parent = models.ForeignKey(
        Requirement,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="proposed_child_changes",
        verbose_name="Proposed Parent Requirement",
    )
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="proposed_requirement_changes",
        verbose_name="Proposed Assignee",
    )
    proposed_reviewers = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        blank=True,
        related_name="proposed_review_requirement_changes",
        verbose_name="Proposed Reviewers",
    )
    description_html = models.JSONField(
        blank=True,
        null=True,
        verbose_name="Proposed Requirement Description HTML",
    )
    acceptance_criteria_html = models.JSONField(
        blank=True,
        null=True,
        verbose_name="Proposed Requirement Acceptance Criteria HTML",
    )
    attachments = models.ManyToManyField(
        "db.FileAsset",
        through="RequirementChangeAttachment",
        through_fields=("change", "asset"),
        blank=True,
        related_name="requirement_changes",
        verbose_name="Proposed Attachments",
    )
    completed_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Completed At",
    )

    class Meta:
        verbose_name = "Requirement Change"
        verbose_name_plural = "Requirement Changes"
        db_table = "requirement_changes"
        ordering = ("-sequence",)
        indexes = [
            models.Index(
                fields=["requirement", "status"],
                name="idx_requirement_change_status",
            )
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["requirement", "sequence"],
                condition=Q(deleted_at__isnull=True),
                name="requirement_change_unique_sequence_when_not_deleted",
            ),
            models.UniqueConstraint(
                fields=["requirement"],
                condition=Q(
                    status=RequirementChangeStatus.PENDING,
                    deleted_at__isnull=True,
                ),
                name="requirement_change_unique_pending_when_not_deleted",
            ),
        ]

    def __str__(self):
        return f"{self.requirement_id} - Change {self.sequence} [{self.status}]"

    def clean(self):
        super().clean()
        product_id = self.requirement.product_id if self.requirement_id else None
        if self.module_id and self.module.product_id != product_id:
            raise ValidationError({"module": "需求模块必须属于当前需求的产品。"})
        if self.parent_id:
            if self.parent_id == self.requirement_id:
                raise ValidationError({"parent": "需求不能将自身设为父需求。"})
            if self.parent.product_id != product_id:
                raise ValidationError({"parent": "父需求必须属于当前需求的产品。"})
            if (
                self.requirement.type == Requirement.RequirementType.USER
                and self.parent.type != Requirement.RequirementType.USER
            ):
                raise ValidationError({"parent": "用户需求只能选择用户需求作为父需求。"})

    def save(self, *args, **kwargs):
        self.full_clean(exclude=["created_by", "updated_by"])
        return super().save(*args, **kwargs)


class RequirementChangeReviewer(BaseModel):
    change = models.ForeignKey(
        RequirementChange,
        on_delete=models.CASCADE,
        related_name="reviewer_assignments",
        verbose_name="Requirement Change",
    )
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="requirement_review_assignments",
        verbose_name="Reviewer",
    )
    latest_opinion = models.CharField(
        max_length=30,
        choices=RequirementReviewOpinion.choices,
        null=True,
        blank=True,
        db_index=True,
        verbose_name="Latest Review Opinion",
    )
    latest_reason = models.TextField(blank=True, default="", verbose_name="Latest Review Reason")
    reviewed_at = models.DateTimeField(null=True, blank=True, verbose_name="Reviewed At")

    class Meta:
        verbose_name = "Requirement Change Reviewer"
        verbose_name_plural = "Requirement Change Reviewers"
        db_table = "requirement_change_reviewers"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["change", "reviewer"],
                condition=Q(deleted_at__isnull=True),
                name="requirement_change_reviewer_unique_when_not_deleted",
            )
        ]

    def __str__(self):
        return f"{self.reviewer_id} on {self.change_id}"


class RequirementReviewRecord(BaseModel):
    assignment = models.ForeignKey(
        RequirementChangeReviewer,
        on_delete=models.CASCADE,
        related_name="records",
        verbose_name="Reviewer Assignment",
    )
    opinion = models.CharField(
        max_length=30,
        choices=RequirementReviewOpinion.choices,
        verbose_name="Review Opinion",
    )
    reason = models.TextField(blank=True, default="", verbose_name="Review Reason")

    class Meta:
        verbose_name = "Requirement Review Record"
        verbose_name_plural = "Requirement Review Records"
        db_table = "requirement_review_records"
        ordering = ("created_at",)
        indexes = [
            models.Index(
                fields=["assignment", "created_at"],
                name="idx_requirement_review_history",
            )
        ]

    def __str__(self):
        return f"{self.assignment_id} - {self.opinion}"

    def clean(self):
        super().clean()
        self.reason = str(self.reason or "").strip()
        if self.opinion == RequirementReviewOpinion.REJECTED and not self.reason:
            raise ValidationError({"reason": "拒绝需求时必须填写评审原因。"})

    def save(self, *args, **kwargs):
        self.full_clean(exclude=["created_by", "updated_by"])
        return super().save(*args, **kwargs)


class RequirementChangeAttachment(BaseModel):
    change = models.ForeignKey(
        RequirementChange,
        on_delete=models.CASCADE,
        related_name="change_attachments",
        verbose_name="Requirement Change",
    )
    asset = models.ForeignKey(
        "db.FileAsset",
        on_delete=models.CASCADE,
        related_name="requirement_change_attachments",
        verbose_name="File Asset",
    )

    class Meta:
        verbose_name = "Requirement Change Attachment"
        verbose_name_plural = "Requirement Change Attachments"
        db_table = "requirement_change_attachments"
        constraints = [
            models.UniqueConstraint(
                fields=["change", "asset"],
                condition=Q(deleted_at__isnull=True),
                name="requirement_change_attachment_unique_when_not_deleted",
            )
        ]


class RequirementVersionAttachment(BaseModel):
    version = models.ForeignKey(
        RequirementVersion,
        on_delete=models.CASCADE,
        related_name="version_attachments",
        verbose_name="Requirement Version",
    )
    asset = models.ForeignKey(
        "db.FileAsset",
        on_delete=models.CASCADE,
        related_name="requirement_version_attachments",
        verbose_name="File Asset",
    )

    class Meta:
        verbose_name = "Requirement Version Attachment"
        verbose_name_plural = "Requirement Version Attachments"
        db_table = "requirement_version_attachments"
        constraints = [
            models.UniqueConstraint(
                fields=["version", "asset"],
                condition=Q(deleted_at__isnull=True),
                name="requirement_version_attachment_unique_when_not_deleted",
            )
        ]
