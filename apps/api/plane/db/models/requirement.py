# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from .base import BaseModel


DEFAULT_SORT_ORDER = 65535


class RequirementScope(models.TextChoices):
    """scope 不落库，仅作为 scope @property 的取值与外部筛选常量。"""

    WORKSPACE = "workspace", "工作区"
    PRODUCT = "product", "产品"
    PROJECT = "project", "项目"


class RequirementStatus(models.TextChoices):
    """需求状态描述「编辑状态」，不描述「内容可用性」。

    一旦发布过 v1，正式表就一直持有最后一次批准通过的内容 —— 即使因为正在
    编辑而回到 draft。判断「是否有已发布内容」要看 current_version，不能用
    status != draft。
    """

    DRAFT = "draft", "草稿"
    IN_REVIEW = "in_review", "评审中"
    PUBLISHED = "published", "已发布"


class RequirementFieldType(models.TextChoices):
    TEXT = "text", "文本"
    MEMBER = "member", "成员"
    SELECT = "select", "选择器"
    FORM = "form", "表单"
    RICH_TEXT = "rich_text", "富文本框"
    ATTACHMENT = "attachment", "附件"
    IMAGE = "image", "图片"
    BOOLEAN = "boolean", "布尔值"


class RequirementApprovalType(models.TextChoices):
    ANY = "any", "任一人通过"
    ALL = "all", "全部通过"
    N_OF_M = "n_of_m", "至少 N 人通过"


class RequirementApprovalAction(models.TextChoices):
    APPROVED = "approved", "通过"
    REJECTED = "rejected", "拒绝"


class RequirementChangeStatus(models.TextChoices):
    PENDING = "pending", "待审批"
    APPROVED = "approved", "已通过"
    REJECTED = "rejected", "已拒绝"
    CANCELLED = "cancelled", "已取消"


class RequirementChangeTargetKind(models.TextChoices):
    REQUIREMENT = "requirement", "基本信息"
    DETAIL_DATA = "detail_data", "明细数据"
    SCHEMA = "schema", "字段定义"


class RequirementChangeType(models.TextChoices):
    CREATE = "create", "新增"
    UPDATE = "update", "更新"
    DELETE = "delete", "删除"


class RequirementChangeRequestKind(models.TextChoices):
    """仅用于展示与统计，不参与状态流转判断。"""

    INITIAL_PUBLISH = "initial_publish", "首次发布"
    CHANGE = "change", "变更"


# 说明：结构性规则（作用域组合、N_OF_M 的通过人数）由 DB CheckConstraint 兜底，
# 是唯一硬保证；clean() 只保留 DB 表达不了的跨表/跨行规则，供 serializer 显式调用。
# save() 不再执行 full_clean，仅在 workspace_id 缺失时最小反填作用域字段。
#
# 需求模型自身承载字段定义（RequirementField）与明细数据（RequirementDetail）。
# 工作区模板即 is_template=True 且不归属任何产品/项目的需求；在产品/项目中创建
# 需求时可通过 template 引用某个模板并复制其字段定义与明细。


class Requirement(BaseModel):
    workspace = models.ForeignKey(
        "db.WorkSpace",
        on_delete=models.CASCADE,
        related_name="requirements",
        verbose_name="所属工作区",
    )
    product = models.ForeignKey(
        "db.Product",
        on_delete=models.CASCADE,
        related_name="requirements",
        null=True,
        blank=True,
        verbose_name="所属产品",
    )
    project = models.ForeignKey(
        "db.Project",
        on_delete=models.CASCADE,
        related_name="requirements",
        null=True,
        blank=True,
        verbose_name="所属项目",
    )
    is_template = models.BooleanField(
        default=False, db_index=True, verbose_name="是否为工作区模板"
    )
    template = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        related_name="imported_copies",
        null=True,
        blank=True,
        verbose_name="来源工作区模板",
    )
    title = models.CharField(max_length=255, verbose_name="需求标题")
    description_html = models.TextField(
        blank=True, null=True, verbose_name="需求描述 HTML"
    )
    status = models.CharField(
        max_length=30,
        choices=RequirementStatus.choices,
        default=RequirementStatus.DRAFT,
        db_index=True,
        verbose_name="需求状态",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_requirements",
        verbose_name="负责人",
    )
    approval_type = models.CharField(
        max_length=10,
        choices=RequirementApprovalType.choices,
        default=RequirementApprovalType.ANY,
        verbose_name="审批通过规则",
    )
    required_count = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        verbose_name="最少通过人数（仅 N_OF_M 模式生效）",
    )
    current_version = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name="当前已发布版本号（null 表示从未发布）",
    )
    is_active = models.BooleanField(default=True, verbose_name="是否启用")
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER, verbose_name="排序")

    class Meta:
        db_table = "requirements"
        ordering = ("sort_order", "created_at", "id")
        constraints = [
            # 作用域：模板不归属产品/项目；非模板必须且只能归属一个产品或项目
            models.CheckConstraint(
                check=Q(
                    is_template=True,
                    product__isnull=True,
                    project__isnull=True,
                )
                | (
                    Q(is_template=False)
                    & (
                        Q(product__isnull=False, project__isnull=True)
                        | Q(product__isnull=True, project__isnull=False)
                    )
                ),
                name="requirement_scope_by_template",
            ),
            # 模板名称在工作区内唯一
            models.UniqueConstraint(
                fields=["workspace", "title"],
                condition=Q(is_template=True, deleted_at__isnull=True),
                name="requirement_unique_workspace_template_title_active",
            ),
            # 审批规则：N_OF_M 必须给 >=1 的通过人数，其余规则必须为空
            models.CheckConstraint(
                check=(
                    Q(approval_type=RequirementApprovalType.N_OF_M)
                    & Q(required_count__gte=1)
                )
                | (
                    ~Q(approval_type=RequirementApprovalType.N_OF_M)
                    & Q(required_count__isnull=True)
                ),
                name="requirement_required_count_consistent",
            ),
        ]

    def __str__(self):
        return self.title

    @property
    def scope(self):
        if self.is_template:
            return RequirementScope.WORKSPACE
        if self.product_id:
            return RequirementScope.PRODUCT
        return RequirementScope.PROJECT

    def clean(self):
        super().clean()
        # 仅保留 DB 无法表达的跨行规则：模板引用必须指向本工作区的工作区模板
        if self.template_id:
            if self.template_id == self.id:
                raise ValidationError({"template": "需求不能以自身作为模板。"})
            if self.is_template:
                raise ValidationError({"template": "工作区模板不能再引用其他模板。"})
            template = self.template
            if not template.is_template:
                raise ValidationError({"template": "来源必须是工作区模板。"})
            if self.workspace_id != template.workspace_id:
                raise ValidationError({"template": "只能导入当前工作区内的需求模板。"})

    def save(self, *args, **kwargs):
        if not self.workspace_id:
            if self.product_id:
                self.workspace_id = self.product.workspace_id
            elif self.project_id:
                self.workspace_id = self.project.workspace_id
        return super().save(*args, **kwargs)


class RequirementField(BaseModel):
    requirement = models.ForeignKey(
        Requirement,
        on_delete=models.CASCADE,
        related_name="fields",
        verbose_name="所属需求",
    )
    parent_field = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        related_name="sub_fields",
        null=True,
        blank=True,
        verbose_name="父级表单字段",
    )
    name = models.CharField(max_length=255, verbose_name="字段名称")
    field_type = models.CharField(
        max_length=20,
        choices=RequirementFieldType.choices,
        default=RequirementFieldType.TEXT,
        verbose_name="字段类型",
    )
    is_required = models.BooleanField(default=False, verbose_name="是否必填")
    is_active = models.BooleanField(default=True, verbose_name="是否启用")
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER, verbose_name="排序")
    config = models.JSONField(default=dict, blank=True, verbose_name="字段配置")
    default_value = models.JSONField(null=True, blank=True, verbose_name="默认值")

    class Meta:
        db_table = "requirement_fields"
        ordering = ("sort_order", "created_at", "id")

    def __str__(self):
        return f"{self.name} <{self.requirement_id}>"

    def clean(self):
        super().clean()
        # 表单一层嵌套规则属于跨行约束，DB 无法表达，保留在 clean()（供 serializer 调用）
        if self.parent_field_id:
            if self.parent_field_id == self.id:
                raise ValidationError({"parent_field": "字段不能以自身作为父字段。"})
            parent_field = self.parent_field
            if parent_field.requirement_id != self.requirement_id:
                raise ValidationError(
                    {"parent_field": "父字段必须属于同一个需求。"}
                )
            if parent_field.parent_field_id:
                raise ValidationError({"parent_field": "表单字段仅允许一层子字段。"})
            if parent_field.field_type != RequirementFieldType.FORM:
                raise ValidationError({"parent_field": "只有表单字段可以包含子字段。"})
            if self.field_type == RequirementFieldType.FORM:
                raise ValidationError(
                    {"field_type": "表单子字段不能继续使用表单类型。"}
                )

        if (
            not self._state.adding
            and self.field_type != RequirementFieldType.FORM
            and self.sub_fields.exists()
        ):
            raise ValidationError(
                {"field_type": "包含子字段的字段必须保持为表单类型。"}
            )


class RequirementDetail(BaseModel):
    requirement = models.ForeignKey(
        Requirement,
        on_delete=models.CASCADE,
        related_name="details",
        verbose_name="所属需求",
    )
    data = models.JSONField(default=dict, blank=True, verbose_name="明细数据")
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER, verbose_name="排序")
    version = models.PositiveIntegerField(default=1, verbose_name="当前版本")

    class Meta:
        db_table = "requirement_details"
        ordering = ("sort_order", "created_at", "id")
        indexes = [
            models.Index(
                fields=["requirement", "sort_order"],
                name="req_detail_requirement_sort",
            )
        ]

    def __str__(self):
        return f"{self.requirement_id} / {self.id}"


class RequirementDraft(BaseModel):
    """需求的工作副本：承载未发布的编辑内容，正式表在审批通过前不受影响。

    meta 与字段定义放在 snapshot（字段通常几十个以内，天然整体读写），明细行
    拆到 RequirementDraftDetail —— 千行量级下 JSON blob 会让每次单元格保存都
    重写整份文档，且无法用数据库分页/筛选，行级乐观锁也会退化。
    """

    workspace = models.ForeignKey(
        "db.WorkSpace",
        on_delete=models.CASCADE,
        related_name="requirement_drafts",
        verbose_name="所属工作区",
    )
    product = models.ForeignKey(
        "db.Product",
        on_delete=models.CASCADE,
        related_name="requirement_drafts",
        null=True,
        blank=True,
        verbose_name="所属产品",
    )
    project = models.ForeignKey(
        "db.Project",
        on_delete=models.CASCADE,
        related_name="requirement_drafts",
        null=True,
        blank=True,
        verbose_name="所属项目",
    )
    requirement = models.OneToOneField(
        Requirement,
        on_delete=models.CASCADE,
        related_name="draft",
        verbose_name="所属需求",
    )
    base_version = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name="基准版本号（null 表示首次发布草稿）",
    )
    snapshot = models.JSONField(
        default=dict, blank=True, verbose_name="草稿快照（meta + 字段定义）"
    )

    class Meta:
        db_table = "requirement_drafts"
        ordering = ("-updated_at",)

    def __str__(self):
        return f"draft of {self.requirement_id}"

    def save(self, *args, **kwargs):
        if not self.workspace_id and self.requirement_id:
            source = self.requirement
            self.workspace_id = source.workspace_id
            self.product_id = source.product_id
            self.project_id = source.project_id
        return super().save(*args, **kwargs)


class RequirementDraftDetail(BaseModel):
    """草稿明细行。结构与 RequirementDetail 一致，外键换成草稿。

    物化时直接复用这里的 UUID 作为正式表主键，因此明细 data 里以字段 ID 为 key
    的结构不需要任何 remap。
    """

    draft = models.ForeignKey(
        RequirementDraft,
        on_delete=models.CASCADE,
        related_name="details",
        verbose_name="所属草稿",
    )
    data = models.JSONField(default=dict, blank=True, verbose_name="明细数据")
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER, verbose_name="排序")
    version = models.PositiveIntegerField(default=1, verbose_name="当前版本")

    class Meta:
        db_table = "requirement_draft_details"
        ordering = ("sort_order", "created_at", "id")
        indexes = [
            models.Index(
                fields=["draft", "sort_order"],
                name="req_draft_detail_draft_sort",
            )
        ]

    def __str__(self):
        return f"{self.draft_id} / {self.id}"


class RequirementApprover(BaseModel):
    """需求的审批人名单（谁可以审批），与审批规则（approval_type/required_count）配套。

    随需求/模板存在：模板预定义审批人，导入时一并拷贝；发起变更请求时按此名单
    快照为 RequirementChangeApproval 记录。当前仅支持指定成员。
    """

    requirement = models.ForeignKey(
        Requirement,
        on_delete=models.CASCADE,
        related_name="approvers",
        verbose_name="所属需求",
    )
    approver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="requirement_approvers",
        verbose_name="审批人",
    )
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER, verbose_name="排序")

    class Meta:
        db_table = "requirement_approvers"
        ordering = ("sort_order", "created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=["requirement", "approver"],
                condition=Q(deleted_at__isnull=True),
                name="req_approver_unique_requirement_approver_active",
            )
        ]

    def __str__(self):
        return f"{self.approver_id} @ {self.requirement_id}"


class RequirementChangeRequest(BaseModel):
    workspace = models.ForeignKey(
        "db.WorkSpace",
        on_delete=models.CASCADE,
        related_name="requirement_change_requests",
        verbose_name="所属工作区",
    )
    product = models.ForeignKey(
        "db.Product",
        on_delete=models.CASCADE,
        related_name="requirement_change_requests",
        null=True,
        blank=True,
        verbose_name="所属产品",
    )
    project = models.ForeignKey(
        "db.Project",
        on_delete=models.CASCADE,
        related_name="requirement_change_requests",
        null=True,
        blank=True,
        verbose_name="所属项目",
    )
    requirement = models.ForeignKey(
        Requirement,
        on_delete=models.CASCADE,
        related_name="change_requests",
        verbose_name="目标需求",
    )
    target_kind = models.CharField(
        max_length=20,
        choices=RequirementChangeTargetKind.choices,
        verbose_name="变更目标类型",
    )
    request_kind = models.CharField(
        max_length=20,
        choices=RequirementChangeRequestKind.choices,
        default=RequirementChangeRequestKind.CHANGE,
        verbose_name="变更单类型（仅用于展示与统计）",
    )
    sequence_id = models.PositiveIntegerField(
        default=1, verbose_name="需求内自增序号（用于展示 CR-001）"
    )
    base_version = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name="基准版本号（null 表示首次发布）",
    )
    created_count = models.PositiveIntegerField(default=0, verbose_name="新增项数")
    updated_count = models.PositiveIntegerField(default=0, verbose_name="修改项数")
    deleted_count = models.PositiveIntegerField(default=0, verbose_name="删除项数")
    changed_field_ids = models.JSONField(
        default=list,
        blank=True,
        verbose_name="本次变更涉及的字段 ID（供「仅显示变化列」使用）",
    )
    approval_type = models.CharField(
        max_length=10,
        choices=RequirementApprovalType.choices,
        default=RequirementApprovalType.ANY,
        verbose_name="审批通过规则快照",
    )
    required_count = models.PositiveSmallIntegerField(
        null=True, blank=True, verbose_name="最少通过人数快照"
    )
    status = models.CharField(
        max_length=20,
        choices=RequirementChangeStatus.choices,
        default=RequirementChangeStatus.PENDING,
        db_index=True,
        verbose_name="审批状态",
    )
    reason = models.TextField(blank=True, default="", verbose_name="变更原因")
    completed_at = models.DateTimeField(
        null=True, blank=True, verbose_name="完成时间"
    )

    class Meta:
        db_table = "requirement_change_requests"
        ordering = ("-created_at",)
        indexes = [
            models.Index(
                fields=["requirement", "-created_at"],
                name="req_change_requirement_created",
            )
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["requirement", "sequence_id"],
                condition=Q(deleted_at__isnull=True),
                name="req_change_unique_requirement_sequence_active",
            ),
            models.CheckConstraint(
                check=Q(product__isnull=False, project__isnull=True)
                | Q(product__isnull=True, project__isnull=False),
                name="req_change_scope_exactly_one",
            ),
            models.CheckConstraint(
                check=(
                    Q(approval_type=RequirementApprovalType.N_OF_M)
                    & Q(required_count__gte=1)
                )
                | (
                    ~Q(approval_type=RequirementApprovalType.N_OF_M)
                    & Q(required_count__isnull=True)
                ),
                name="req_change_required_count_consistent",
            ),
        ]

    def __str__(self):
        return f"{self.target_kind} / {self.id} [{self.status}]"

    def clean(self):
        super().clean()
        # 跨表规则：工作区模板不通过变更审批流程修改
        if self.requirement_id and self.requirement.is_template:
            raise ValidationError(
                {"requirement": "工作区模板不通过变更审批流程修改。"}
            )

    def save(self, *args, **kwargs):
        # 作用域优先由目标需求派生（product/project 未定时）；
        # 调用方也可直接给定 product/project，此时仅在缺 workspace_id 时反填。
        if not self.product_id and not self.project_id and self.requirement_id:
            source = self.requirement
            self.workspace_id = source.workspace_id
            self.product_id = source.product_id
            self.project_id = source.project_id
        elif not self.workspace_id:
            if self.product_id:
                self.workspace_id = self.product.workspace_id
            elif self.project_id:
                self.workspace_id = self.project.workspace_id
        return super().save(*args, **kwargs)


class RequirementChangeItem(BaseModel):
    change_request = models.ForeignKey(
        RequirementChangeRequest,
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="所属变更请求",
    )
    target_kind = models.CharField(
        max_length=20,
        choices=RequirementChangeTargetKind.choices,
        default=RequirementChangeTargetKind.DETAIL_DATA,
        verbose_name="变更目标类型",
    )
    change_type = models.CharField(
        max_length=10,
        choices=RequirementChangeType.choices,
        verbose_name="变更类型",
    )
    target_id = models.UUIDField(null=True, blank=True, verbose_name="目标记录 ID")
    before_snapshot = models.JSONField(
        null=True, blank=True, verbose_name="变更前快照"
    )
    proposed_snapshot = models.JSONField(
        null=True, blank=True, verbose_name="拟变更快照"
    )
    base_version = models.PositiveIntegerField(
        null=True, blank=True, verbose_name="基准版本"
    )
    proposed_sort_order = models.FloatField(
        null=True, blank=True, verbose_name="拟排序值"
    )

    class Meta:
        db_table = "requirement_change_items"
        ordering = ("proposed_sort_order", "created_at", "id")
        indexes = [
            models.Index(
                fields=["change_request", "target_kind", "proposed_sort_order"],
                name="req_change_item_request_kind",
            )
        ]

    def __str__(self):
        return f"{self.target_kind} / {self.change_type} / {self.target_id or 'new'}"


class RequirementChangeApproval(BaseModel):
    change_request = models.ForeignKey(
        RequirementChangeRequest,
        on_delete=models.CASCADE,
        related_name="approvals",
        verbose_name="所属变更请求",
    )
    approver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="requirement_change_approvals",
        verbose_name="审批人",
    )
    action = models.CharField(
        max_length=20,
        choices=RequirementApprovalAction.choices,
        null=True,
        blank=True,
        verbose_name="审批操作（null 表示尚未操作）",
    )
    comment = models.TextField(blank=True, null=True, verbose_name="审批意见")
    acted_at = models.DateTimeField(null=True, blank=True, verbose_name="审批时间")

    class Meta:
        db_table = "requirement_change_approvals"
        ordering = ("change_request", "created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["change_request", "approver"],
                condition=Q(deleted_at__isnull=True),
                name="req_change_approval_unique_request_approver_active",
            )
        ]

    def __str__(self):
        return f"{self.approver_id} [{self.action or '待审批'}] on {self.change_request_id}"


class RequirementVersion(BaseModel):
    workspace = models.ForeignKey(
        "db.WorkSpace",
        on_delete=models.CASCADE,
        related_name="requirement_versions",
        verbose_name="所属工作区",
    )
    product = models.ForeignKey(
        "db.Product",
        on_delete=models.CASCADE,
        related_name="requirement_versions",
        null=True,
        blank=True,
        verbose_name="所属产品",
    )
    project = models.ForeignKey(
        "db.Project",
        on_delete=models.CASCADE,
        related_name="requirement_versions",
        null=True,
        blank=True,
        verbose_name="所属项目",
    )
    requirement = models.ForeignKey(
        Requirement,
        on_delete=models.SET_NULL,
        related_name="versions",
        null=True,
        blank=True,
        verbose_name="所属需求",
    )
    target_kind = models.CharField(
        max_length=20,
        choices=RequirementChangeTargetKind.choices,
        verbose_name="版本目标类型",
    )
    target_id = models.UUIDField(verbose_name="目标记录 ID")
    version = models.PositiveIntegerField(verbose_name="版本号")
    change_type = models.CharField(
        max_length=10,
        choices=RequirementChangeType.choices,
        verbose_name="变更类型",
    )
    snapshot = models.JSONField(verbose_name="版本快照")
    sort_order = models.FloatField(null=True, blank=True, verbose_name="排序值")
    change_request = models.ForeignKey(
        RequirementChangeRequest,
        on_delete=models.SET_NULL,
        related_name="versions",
        null=True,
        blank=True,
        verbose_name="来源变更请求",
    )
    change_item = models.ForeignKey(
        RequirementChangeItem,
        on_delete=models.SET_NULL,
        related_name="versions",
        null=True,
        blank=True,
        verbose_name="来源变更项",
    )
    approved_by = models.JSONField(
        default=list, blank=True, verbose_name="审批人 ID 列表"
    )

    class Meta:
        db_table = "requirement_versions"
        ordering = ("-version", "-created_at")
        constraints = [
            models.CheckConstraint(
                check=Q(product__isnull=False, project__isnull=True)
                | Q(product__isnull=True, project__isnull=False),
                name="req_version_scope_exactly_one",
            ),
            models.UniqueConstraint(
                fields=["target_kind", "target_id", "version"],
                condition=Q(deleted_at__isnull=True),
                name="req_version_unique_target_version_active",
            ),
        ]

    def __str__(self):
        return f"{self.target_kind} / {self.target_id} / v{self.version}"

    def clean(self):
        super().clean()
        # 明细数据与字段定义版本都归属具体需求（requirement 为 SET_NULL，
        # 故只能在写入时校验，不能做成 DB 约束）
        if not self.requirement_id:
            raise ValidationError({"requirement": "需求版本必须关联所属需求。"})
        # 来源变更项必须属于来源变更请求
        if (
            self.change_request_id
            and self.change_item_id
            and self.change_item.change_request_id != self.change_request_id
        ):
            raise ValidationError({"change_item": "变更项必须属于当前来源变更请求。"})

    def save(self, *args, **kwargs):
        # 作用域优先由所属需求/来源变更请求派生（product/project 未定时）；
        # 调用方也可直接给定 product/project，此时仅在缺 workspace_id 时反填。
        if not self.product_id and not self.project_id:
            source = self.requirement or self.change_request
            if source is not None:
                self.workspace_id = source.workspace_id
                self.product_id = source.product_id
                self.project_id = source.project_id
        elif not self.workspace_id:
            if self.product_id:
                self.workspace_id = self.product.workspace_id
            elif self.project_id:
                self.workspace_id = self.project.workspace_id
        return super().save(*args, **kwargs)
