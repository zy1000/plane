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

    PRODUCT = "product", "产品"
    PROJECT = "project", "项目"


class RequirementStatus(models.TextChoices):
    """基线状态描述「编辑状态」，不描述「内容可用性」。

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


class RequirementItemStatus(models.TextChoices):
    """需求条目自己的状态，与基线的 RequirementStatus 是两回事。

    基线的 status 描述「这份基线正处在编辑/评审/发布的哪一步」，是整份内容的
    编辑态；这里的 status 描述「这一条需求走到了哪」，是内容本身的属性。
    """

    DRAFT = "draft", "草稿"
    IN_REVIEW = "in_review", "评审中"
    CONFIRMED = "confirmed", "已确认"
    IMPLEMENTED = "implemented", "已实现"
    OBSOLETE = "obsolete", "已废弃"


class RequirementPriority(models.TextChoices):
    """取值与 Issue.PRIORITY_CHOICES 对齐，前端可以直接复用工作项的优先级下拉。"""

    URGENT = "urgent", "紧急"
    HIGH = "high", "高"
    MEDIUM = "medium", "中"
    LOW = "low", "低"
    NONE = "none", "无"


class RequirementFieldCategory(models.TextChoices):
    """自定义字段的分类，决定它在标准库里露不露面。

    内置字段不参与这个分类 —— 它们根本不是 RequirementField，而是条目表上的列。
    """

    STANDARD = "standard", "标准字段"
    DATA = "data", "数据字段"


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
    BASELINE = "baseline", "审批配置"
    SCHEMA = "schema", "字段定义"
    REQUIREMENT = "requirement", "需求条目"


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
# 三层结构：
#   RequirementBaseline —— 一个产品（或项目）唯一一条，持有审批配置、状态与版本链。
#   Requirement         —— 需求条目本身，一行就是一条需求。
#   RequirementLibrary  —— 需求标准库，库内的条目同样是 Requirement。
#
# Requirement 一行要么属于某个产品，要么属于某个项目，要么属于某个标准库，三者
# 必居其一；但无论哪种归属，requirement_type 都必填。
#
# 字段分三类：
#   内置字段 —— 标题、描述、状态、优先级、负责人、开始日期、截止日期、父项。每个需求
#              类型都默认包含，不可删除不可编辑。它们不是 RequirementField，而是
#              Requirement / RequirementDraftRow 上的真实列。
#   标准字段 —— 用户自定义，产品需求与标准库都展示。
#   数据字段 —— 用户自定义，只有产品需求展示，标准库不展示。
# 后两类由 RequirementField.field_category 区分。
#
# 字段定义（RequirementField）只归需求类型所有。产品需求与需求标准库都不拷贝字段，
# 而是通过条目上的 requirement_type 外键实时引用类型，因此类型改字段会立刻反映到
# 所有实时引用它的地方（失效的值由 sync_requirement_type_fields 清理）。
#
# 一个产品下可以同时存在多个需求类型的条目，前端按类型分视图展示 —— 这是「同一批
# 需求有不同形状」，不是容器。审批的单位是整条基线。
#
# 例外是「已发布」的基线：它按发版时冻结进 RequirementVersion.snapshot["fields"]
# 的字段快照渲染，类型此后的改动要等下一次编辑并通过审批才会生效（见
# plane.utils.requirement_change.build_change_snapshots）。


class RequirementType(BaseModel):
    """需求类型：工作区级的字段定义源，自己不持有任何条目数据。"""

    workspace = models.ForeignKey(
        "db.WorkSpace",
        on_delete=models.CASCADE,
        related_name="requirement_types",
        verbose_name="所属工作区",
    )
    name = models.CharField(max_length=255, verbose_name="需求类型名称")
    description = models.TextField(blank=True, default="", verbose_name="需求类型描述")
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_requirement_types",
        verbose_name="负责人",
    )
    is_active = models.BooleanField(default=True, verbose_name="是否启用")
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER, verbose_name="排序")

    class Meta:
        db_table = "requirement_types"
        ordering = ("sort_order", "created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=Q(deleted_at__isnull=True),
                name="requirement_type_unique_workspace_name_active",
            )
        ]

    def __str__(self):
        return self.name


class RequirementBaseline(BaseModel):
    """需求基线：一个产品（或项目）的全部需求作为一个整体的审批与版本单元。

    每个作用域只有一条，惰性创建 —— 第一次打开需求页或第一次写入时才落库。
    条目本身不带状态：能不能写、当前是第几版，全看所属基线。
    """

    workspace = models.ForeignKey(
        "db.WorkSpace",
        on_delete=models.CASCADE,
        related_name="requirement_baselines",
        verbose_name="所属工作区",
    )
    product = models.ForeignKey(
        "db.Product",
        on_delete=models.CASCADE,
        related_name="requirement_baselines",
        null=True,
        blank=True,
        verbose_name="所属产品",
    )
    project = models.ForeignKey(
        "db.Project",
        on_delete=models.CASCADE,
        related_name="requirement_baselines",
        null=True,
        blank=True,
        verbose_name="所属项目",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_requirement_baselines",
        verbose_name="负责人",
    )
    status = models.CharField(
        max_length=30,
        choices=RequirementStatus.choices,
        default=RequirementStatus.DRAFT,
        db_index=True,
        verbose_name="基线状态",
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

    class Meta:
        db_table = "requirement_baselines"
        ordering = ("-updated_at",)
        constraints = [
            # 作用域：必须且只能归属一个产品或一个项目
            models.CheckConstraint(
                check=Q(product__isnull=False, project__isnull=True)
                | Q(product__isnull=True, project__isnull=False),
                name="req_baseline_scope_exactly_one",
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
                name="req_baseline_required_count_consistent",
            ),
            # 每个作用域只允许一条有效基线
            models.UniqueConstraint(
                fields=["product"],
                condition=Q(product__isnull=False, deleted_at__isnull=True),
                name="req_baseline_unique_product_active",
            ),
            models.UniqueConstraint(
                fields=["project"],
                condition=Q(project__isnull=False, deleted_at__isnull=True),
                name="req_baseline_unique_project_active",
            ),
        ]

    def __str__(self):
        return f"baseline of {self.product_id or self.project_id}"

    @property
    def scope(self):
        if self.product_id:
            return RequirementScope.PRODUCT
        return RequirementScope.PROJECT

    def save(self, *args, **kwargs):
        if not self.workspace_id:
            if self.product_id:
                self.workspace_id = self.product.workspace_id
            elif self.project_id:
                self.workspace_id = self.project.workspace_id
        return super().save(*args, **kwargs)


class RequirementLibrary(BaseModel):
    """需求标准库：选定一个需求类型，库内的条目共用该类型的字段定义。

    字段是引用而非拷贝，所以同一个库里的条目永远保持同一套字段；类型改字段会立刻
    反映到库内所有条目上（失效的值由 sync_requirement_type_fields 清理）。

    标准库不走审批 —— 库内条目创建即生效，没有基线、没有工作副本。
    """

    workspace = models.ForeignKey(
        "db.WorkSpace",
        on_delete=models.CASCADE,
        related_name="requirement_libraries",
        verbose_name="所属工作区",
    )
    requirement_type = models.ForeignKey(
        RequirementType,
        on_delete=models.PROTECT,
        related_name="libraries",
        verbose_name="所选需求类型",
    )
    name = models.CharField(max_length=255, verbose_name="标准库名称")
    description = models.TextField(blank=True, default="", verbose_name="标准库描述")
    is_active = models.BooleanField(default=True, verbose_name="是否启用")
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER, verbose_name="排序")

    class Meta:
        db_table = "requirement_libraries"
        ordering = ("sort_order", "created_at", "id")
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=Q(deleted_at__isnull=True),
                name="requirement_library_unique_workspace_name_active",
            )
        ]

    def __str__(self):
        return self.name

    def clean(self):
        super().clean()
        # 跨表规则，DB 表达不了：来源必须是本工作区的需求类型
        if (
            self.requirement_type_id
            and self.workspace_id != self.requirement_type.workspace_id
        ):
            raise ValidationError(
                {"requirement_type": "只能选择当前工作区内的需求类型。"}
            )

    def save(self, *args, **kwargs):
        if not self.workspace_id and self.requirement_type_id:
            self.workspace_id = self.requirement_type.workspace_id
        return super().save(*args, **kwargs)


class RequirementField(BaseModel):
    requirement_type = models.ForeignKey(
        RequirementType,
        on_delete=models.CASCADE,
        related_name="fields",
        verbose_name="所属需求类型",
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
    field_category = models.CharField(
        max_length=20,
        choices=RequirementFieldCategory.choices,
        verbose_name="字段分类（标准字段 / 数据字段）",
    )

    class Meta:
        db_table = "requirement_fields"
        ordering = ("sort_order", "created_at", "id")

    def __str__(self):
        return f"{self.name} <{self.requirement_type_id}>"

    def clean(self):
        super().clean()
        # 表单一层嵌套规则属于跨行约束，DB 无法表达，保留在 clean()（供 serializer 调用）
        if self.parent_field_id:
            if self.parent_field_id == self.id:
                raise ValidationError({"parent_field": "字段不能以自身作为父字段。"})
            parent_field = self.parent_field
            if parent_field.requirement_type_id != self.requirement_type_id:
                raise ValidationError(
                    {"parent_field": "父字段必须属于同一个需求类型。"}
                )
            if parent_field.parent_field_id:
                raise ValidationError({"parent_field": "表单字段仅允许一层子字段。"})
            if parent_field.field_type != RequirementFieldType.FORM:
                raise ValidationError({"parent_field": "只有表单字段可以包含子字段。"})
            if self.field_type == RequirementFieldType.FORM:
                raise ValidationError(
                    {"field_type": "表单子字段不能继续使用表单类型。"}
                )
            # 子字段跟着所属表单走，不单独分类 —— 保存路径会强制继承，这里兜底
            if self.field_category != parent_field.field_category:
                raise ValidationError(
                    {"field_category": "表单子字段的分类必须与所属表单一致。"}
                )

        if (
            not self._state.adding
            and self.field_type != RequirementFieldType.FORM
            and self.sub_fields.exists()
        ):
            raise ValidationError(
                {"field_type": "包含子字段的字段必须保持为表单类型。"}
            )


class Requirement(BaseModel):
    """一条需求。要么归属产品/项目（受该作用域的基线管辖），要么归属某个标准库。

    三种归属共用同一张表，因为行结构与读写语义完全一致（内置列 / data / sort_order /
    version）。字段定义都来自 requirement_type —— 标准库的条目恒等于
    library.requirement_type，产品需求则每行各自绑定，从而让一个产品下可以容纳多个需求
    类型的条目。

    data 只装自定义字段，以字段 UUID 为 key，而字段 UUID 属于需求类型；所以只要两行
    引用同一个类型，data 就可以直接互相拷贝（标准库条目导入产品需求正是靠这一点，无需
    重映射）。八个内置字段各有自己的列，不进 data —— 它们要排序、筛选、建索引，还要
    靠外键保证负责人与父项不悬挂。
    """

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
    library = models.ForeignKey(
        RequirementLibrary,
        on_delete=models.CASCADE,
        related_name="items",
        null=True,
        blank=True,
        verbose_name="所属需求标准库",
    )
    requirement_type = models.ForeignKey(
        RequirementType,
        on_delete=models.PROTECT,
        related_name="requirements",
        verbose_name="所属需求类型",
    )
    title = models.CharField(max_length=255, blank=True, default="", verbose_name="需求标题")
    description_html = models.TextField(
        blank=True, null=True, verbose_name="需求描述 HTML"
    )
    status = models.CharField(
        max_length=30,
        choices=RequirementItemStatus.choices,
        default=RequirementItemStatus.DRAFT,
        db_index=True,
        verbose_name="需求状态",
    )
    priority = models.CharField(
        max_length=30,
        choices=RequirementPriority.choices,
        default=RequirementPriority.NONE,
        db_index=True,
        verbose_name="优先级",
    )
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="assigned_requirements",
        null=True,
        blank=True,
        verbose_name="负责人",
    )
    start_date = models.DateField(null=True, blank=True, verbose_name="开始日期")
    target_date = models.DateField(null=True, blank=True, verbose_name="截止日期")
    # SET_NULL 而不是 CASCADE：删掉父需求不该把子需求一并带走，只是解除层级
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        related_name="sub_requirements",
        null=True,
        blank=True,
        verbose_name="父项",
    )
    data = models.JSONField(default=dict, blank=True, verbose_name="自定义字段数据")
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER, verbose_name="排序")
    version = models.PositiveIntegerField(default=1, verbose_name="当前版本")
    last_changed_version = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name="最后一次发生变更的基线版本号（null 表示尚未随基线发布过）",
    )

    class Meta:
        db_table = "requirements"
        ordering = ("sort_order", "created_at", "id")
        indexes = [
            models.Index(fields=["product", "sort_order"], name="req_product_sort"),
            models.Index(fields=["project", "sort_order"], name="req_project_sort"),
            models.Index(fields=["library", "sort_order"], name="req_library_sort"),
            # 按需求类型切视图是服务端过滤（条目是游标分页的）
            models.Index(
                fields=["product", "requirement_type", "sort_order"],
                name="req_product_type_sort",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                check=Q(product__isnull=False, project__isnull=True, library__isnull=True)
                | Q(product__isnull=True, project__isnull=False, library__isnull=True)
                | Q(product__isnull=True, project__isnull=True, library__isnull=False),
                name="requirement_owner_exactly_one",
            )
        ]

    def __str__(self):
        return self.title or str(self.id)

    @property
    def scope(self):
        if self.product_id:
            return RequirementScope.PRODUCT
        if self.project_id:
            return RequirementScope.PROJECT
        return None

    def clean(self):
        super().clean()
        # 跨表规则，DB 表达不了
        if (
            self.library_id
            and self.requirement_type_id != self.library.requirement_type_id
        ):
            raise ValidationError(
                {"requirement_type": "标准库条目的需求类型必须与所属标准库一致。"}
            )

    def save(self, *args, **kwargs):
        if not self.workspace_id:
            if self.product_id:
                self.workspace_id = self.product.workspace_id
            elif self.project_id:
                self.workspace_id = self.project.workspace_id
            elif self.library_id:
                self.workspace_id = self.library.workspace_id
        return super().save(*args, **kwargs)


class RequirementDraft(BaseModel):
    """基线的工作副本：承载未发布的编辑内容，正式表在审批通过前不受影响。

    meta 与字段定义放在 snapshot（字段通常几十个以内，天然整体读写），需求条目
    拆到 RequirementDraftRow —— 千行量级下 JSON blob 会让每次单元格保存都
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
    baseline = models.OneToOneField(
        RequirementBaseline,
        on_delete=models.CASCADE,
        related_name="draft",
        verbose_name="所属基线",
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
        return f"draft of {self.baseline_id}"

    def save(self, *args, **kwargs):
        if not self.workspace_id and self.baseline_id:
            source = self.baseline
            self.workspace_id = source.workspace_id
            self.product_id = source.product_id
            self.project_id = source.project_id
        return super().save(*args, **kwargs)


class RequirementDraftRow(BaseModel):
    """草稿里的需求条目。结构与 Requirement 一致，归属外键换成草稿。

    物化时直接复用这里的 UUID 作为正式表主键，因此 data 里以字段 ID 为 key
    的结构、以及 parent 指向的行 ID，都不需要任何 remap。
    """

    draft = models.ForeignKey(
        RequirementDraft,
        on_delete=models.CASCADE,
        related_name="rows",
        verbose_name="所属草稿",
    )
    requirement_type = models.ForeignKey(
        RequirementType,
        on_delete=models.PROTECT,
        related_name="draft_rows",
        verbose_name="所属需求类型",
    )
    title = models.CharField(max_length=255, blank=True, default="", verbose_name="需求标题")
    description_html = models.TextField(
        blank=True, null=True, verbose_name="需求描述 HTML"
    )
    status = models.CharField(
        max_length=30,
        choices=RequirementItemStatus.choices,
        default=RequirementItemStatus.DRAFT,
        db_index=True,
        verbose_name="需求状态",
    )
    priority = models.CharField(
        max_length=30,
        choices=RequirementPriority.choices,
        default=RequirementPriority.NONE,
        db_index=True,
        verbose_name="优先级",
    )
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        related_name="assigned_requirement_draft_rows",
        null=True,
        blank=True,
        verbose_name="负责人",
    )
    start_date = models.DateField(null=True, blank=True, verbose_name="开始日期")
    target_date = models.DateField(null=True, blank=True, verbose_name="截止日期")
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        related_name="sub_draft_rows",
        null=True,
        blank=True,
        verbose_name="父项",
    )
    data = models.JSONField(default=dict, blank=True, verbose_name="自定义字段数据")
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER, verbose_name="排序")
    version = models.PositiveIntegerField(default=1, verbose_name="当前版本")
    last_changed_version = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name="最后一次发生变更的基线版本号",
    )

    class Meta:
        db_table = "requirement_draft_rows"
        ordering = ("sort_order", "created_at", "id")
        indexes = [
            models.Index(fields=["draft", "sort_order"], name="req_draft_row_sort"),
            models.Index(
                fields=["draft", "requirement_type", "sort_order"],
                name="req_draft_row_type_sort",
            ),
        ]

    def __str__(self):
        return f"{self.draft_id} / {self.id}"


class RequirementApprover(BaseModel):
    """基线的审批人名单（谁可以审批），与审批规则（approval_type/required_count）配套。

    随基线存在：发起变更请求时按此名单快照为 RequirementChangeApproval 记录。
    当前仅支持指定成员。
    """

    baseline = models.ForeignKey(
        RequirementBaseline,
        on_delete=models.CASCADE,
        related_name="approvers",
        verbose_name="所属基线",
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
                fields=["baseline", "approver"],
                condition=Q(deleted_at__isnull=True),
                name="req_approver_unique_baseline_approver_active",
            )
        ]

    def __str__(self):
        return f"{self.approver_id} @ {self.baseline_id}"


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
    baseline = models.ForeignKey(
        RequirementBaseline,
        on_delete=models.CASCADE,
        related_name="change_requests",
        verbose_name="目标基线",
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
        default=1, verbose_name="基线内自增序号（用于展示 CR-001）"
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
    # 字段现在实时取自需求类型，而类型不走审批、随时可改。不在提交时冻结的话，审批人
    # 看到的字段结构与通过后真正落库的可能不是同一份。
    proposed_fields = models.JSONField(
        default=list,
        blank=True,
        verbose_name="提交时冻结的字段树",
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
    completed_at = models.DateTimeField(null=True, blank=True, verbose_name="完成时间")

    class Meta:
        db_table = "requirement_change_requests"
        ordering = ("-created_at",)
        indexes = [
            models.Index(
                fields=["baseline", "-created_at"],
                name="req_change_baseline_created",
            )
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["baseline", "sequence_id"],
                condition=Q(deleted_at__isnull=True),
                name="req_change_unique_baseline_sequence_active",
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

    def save(self, *args, **kwargs):
        # 作用域优先由目标基线派生（product/project 未定时）；
        # 调用方也可直接给定 product/project，此时仅在缺 workspace_id 时反填。
        if not self.product_id and not self.project_id and self.baseline_id:
            source = self.baseline
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
        default=RequirementChangeTargetKind.REQUIREMENT,
        verbose_name="变更目标类型",
    )
    change_type = models.CharField(
        max_length=10,
        choices=RequirementChangeType.choices,
        verbose_name="变更类型",
    )
    target_id = models.UUIDField(null=True, blank=True, verbose_name="目标记录 ID")
    before_snapshot = models.JSONField(null=True, blank=True, verbose_name="变更前快照")
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
    baseline = models.ForeignKey(
        RequirementBaseline,
        on_delete=models.SET_NULL,
        related_name="versions",
        null=True,
        blank=True,
        verbose_name="所属基线",
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
        # 版本都归属具体基线（baseline 为 SET_NULL，故只能在写入时校验，
        # 不能做成 DB 约束）
        if not self.baseline_id:
            raise ValidationError({"baseline": "需求版本必须关联所属基线。"})
        # 来源变更项必须属于来源变更请求
        if (
            self.change_request_id
            and self.change_item_id
            and self.change_item.change_request_id != self.change_request_id
        ):
            raise ValidationError({"change_item": "变更项必须属于当前来源变更请求。"})

    def save(self, *args, **kwargs):
        # 作用域优先由所属基线/来源变更请求派生（product/project 未定时）；
        # 调用方也可直接给定 product/project，此时仅在缺 workspace_id 时反填。
        if not self.product_id and not self.project_id:
            source = self.baseline or self.change_request
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
