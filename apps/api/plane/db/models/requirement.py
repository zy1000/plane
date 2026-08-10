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
    """需求条目的**交付进度**。不表达评审进度 —— 那是另一根轴，见
    Requirement.approval_state。

    整列只由系统写，写序列化器根本不收它：新建时置 draft，首次审批通过后置
    confirmed，此后再也回不到 draft（由 CheckConstraint
    req_draft_status_iff_never_approved 钉住）。

    它**不算内容**（见 utils/requirement.py 的 NON_CONTENT_BUILTIN_COLUMNS）：研发做
    完了推进一格，不该触发一轮内容评审，也不该被内容回滚倒推回去。

    implemented / obsolete 目前无人可写 —— 它们应当由关联任务派生出来（对齐禅道的
    「研发阶段」），派生规则落地之前先空着，而不是留一个手选下拉假装它是内容。
    """

    DRAFT = "draft", "草稿"
    CONFIRMED = "confirmed", "已确认"
    IMPLEMENTED = "implemented", "已实现"
    OBSOLETE = "obsolete", "已废弃"


class RequirementApprovalState(models.TextChoices):
    """需求的审批态。**不落库** —— 由 approved_version / approved_row_version /
    pending_change_item 三列派生。

    存成字符串就会多出第四个可以和这三列对不上的事实来源；派生则不可能不一致。
    """

    DRAFT = "draft", "草稿（从未通过审批）"
    IN_REVIEW = "in_review", "评审中"
    PENDING_DELETION = "pending_deletion", "删除待审批"
    APPROVED = "approved", "已通过（与批准内容一致）"
    MODIFIED = "modified", "已通过后又修改（待提交）"


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


class RequirementChangeType(models.TextChoices):
    CREATE = "create", "新增"
    UPDATE = "update", "更新"
    DELETE = "delete", "删除"


# 说明：结构性规则（作用域组合、N_OF_M 的通过人数）由 DB CheckConstraint 兜底，
# 是唯一硬保证；clean() 只保留 DB 表达不了的跨表/跨行规则，供 serializer 显式调用。
# save() 不再执行 full_clean，仅在 workspace_id 缺失时最小反填作用域字段。
#
# 审批的单位是**一条需求**，不是整个产品。
#
#   RequirementApprovalPolicy —— 一个产品（或项目）唯一一条，只回答「谁能批、
#                                要几个人批」。不持有状态，也不持有版本。
#   Requirement               —— 需求条目本身。它就是唯一的可变副本，人直接改它；
#                                「最后一次批准的内容」在 RequirementVersion 里。
#   RequirementVersion        —— 每条需求各自的版本链（v1, v2, ...）。
#   RequirementBaseline       —— 一组 (需求, 版本) 的不可变命名快照，语义等同
#                                git tag。不是变更单位，不参与审批。
#   RequirementLibrary        —— 需求标准库，库内的条目同样是 Requirement，但
#                                永不走审批。
#
# 没有影子表：审批不是「把工作副本物化回正式表」，而是「写一条版本行、改两个整数、
# 清一个指针」。驳回与撤回在行上完全相同 —— 都只是清指针，内容原样不动，因为从来
# 没有第二份副本。
#
# Requirement 一行要么属于某个产品，要么属于某个项目，要么属于某个标准库，三者
# 必居其一；但无论哪种归属，requirement_type 都必填。
#
# 字段分三类：
#   内置字段 —— 标题、描述、状态、优先级、负责人、开始日期、截止日期、父项。每个需求
#              类型都默认包含，不可删除不可编辑。它们不是 RequirementField，而是
#              Requirement 上的真实列。
#   标准字段 —— 用户自定义，产品需求与标准库都展示。
#   数据字段 —— 用户自定义，只有产品需求展示，标准库不展示。
# 后两类由 RequirementField.field_category 区分。
#
# 字段定义（RequirementField）只归需求类型所有，条目通过 requirement_type 外键
# 实时引用。**字段结构变更立即生效、不走审批**，失效的值由
# sync_requirement_type_fields 清理，同时写一条 RequirementTypeSchemaRevision ——
# 那条修订既是变更轨迹里的「字段结构变更」条目，也是历史版本的渲染依据（否则一年后
# 打开 v3 会拿今天的表头去渲染当年的值）。
#
# 「不追随删除」规则：任何需要活过需求删除的表，一律用裸 UUIDField 而不是外键。
# 本仓库的 soft_delete_related_objects 会把 PROTECT 当 CASCADE 处理，外键会连带
# 软删掉正要留档的历史。RequirementChangeItem.target_id、RequirementVersion.target_id
# 与 RequirementBaselineEntry.requirement_id 都遵守这条。


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
    # 与 IssueType.logo_props 同形状：{"icon": {"name", "color", "background_color"}}。
    # 沿用同一份结构，前端的选择器与渲染器两边可以共用。
    # blank=True 是必需的：不填图标是正常状态（默认就是 {}），而
    # RequirementTypeSerializer.create/update 会调 full_clean()，
    # 没有 blank=True 时 {} 会被判为「此字段不能为空」，创建类型直接 400。
    logo_props = models.JSONField(default=dict, blank=True, verbose_name="图标配置")
    # 存整数而不是外键：类型 -> 修订 -> 类型 的循环外键可以避免，就避免。
    # (requirement_type_id, current_schema_revision) 命中修订表的唯一索引。
    current_schema_revision = models.PositiveIntegerField(
        default=0,
        verbose_name="当前字段结构修订号（0 表示尚未产生修订）",
    )

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


class RequirementTypeSchemaRevision(BaseModel):
    """需求类型字段结构的一次不可变修订。

    一份数据两个用途：

    1) 变更轨迹里的「字段结构变更」条目。一次类型编辑写**一行**，而不是给这个类型
       下成千上万条需求各写一行 —— 那会把刚从审批链路里拆掉的 O(N) 写入又请回来。
       每条需求在**读**轨迹时把本类型的修订并进来。
    2) 历史版本的渲染依据。字段结构立即生效、不走审批，所以 v3 的内容必须指得回 v3
       当时的字段树。

    append-only：只增不改不删。RequirementVersion 与 RequirementChangeItem 都以
    PROTECT 引用它。字段树没有实质变化时**不写行** —— 否则每保存一次类型配置页
    （哪怕只改了类型名）都会往上千条需求的轨迹里塞一条空变更。
    """

    requirement_type = models.ForeignKey(
        RequirementType,
        on_delete=models.CASCADE,
        related_name="schema_revisions",
        verbose_name="所属需求类型",
    )
    revision = models.PositiveIntegerField(verbose_name="类型内自增修订号")
    fields = models.JSONField(verbose_name="本次修订之后的完整字段树")
    # 相对上一修订的字段级差异，形状与原 diff_snapshots 的 SCHEMA 组一致：
    # [{"change_type", "field_id", "parent_field_id", "name", "before", "after"}, ...]
    diff = models.JSONField(default=list, blank=True, verbose_name="相对上一修订的差异")

    class Meta:
        db_table = "requirement_type_schema_revisions"
        ordering = ("-revision",)
        constraints = [
            models.UniqueConstraint(
                fields=["requirement_type", "revision"],
                condition=Q(deleted_at__isnull=True),
                name="req_schema_revision_unique_type_revision",
            )
        ]
        indexes = [
            models.Index(
                fields=["requirement_type", "created_at"],
                name="req_schema_revision_type_time",
            )
        ]

    def __str__(self):
        return f"{self.requirement_type_id} r{self.revision}"


class RequirementApprovalPolicy(BaseModel):
    """一个产品（或项目）的需求审批配置。

    它只回答「谁能批、要几个人批」，不再持有任何状态或版本 —— 状态与版本现在长在
    每一条需求上。每个作用域只有一条，惰性创建。

    改配置立即生效、不走审批。在途的变更单不受影响：提交那一刻规则与名单就已经快照
    进变更单与 RequirementChangeApproval 行了。正因为配置不再受审批保护，能改它的人
    必须比能提交的人更窄（见 can_manage_product），否则任何人都能把审批人改成自己。
    """

    workspace = models.ForeignKey(
        "db.WorkSpace",
        on_delete=models.CASCADE,
        related_name="requirement_approval_policies",
        verbose_name="所属工作区",
    )
    product = models.ForeignKey(
        "db.Product",
        on_delete=models.CASCADE,
        related_name="requirement_approval_policies",
        null=True,
        blank=True,
        verbose_name="所属产品",
    )
    project = models.ForeignKey(
        "db.Project",
        on_delete=models.CASCADE,
        related_name="requirement_approval_policies",
        null=True,
        blank=True,
        verbose_name="所属项目",
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_requirement_approval_policies",
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

    class Meta:
        db_table = "requirement_approval_policies"
        ordering = ("-updated_at",)
        constraints = [
            # 作用域：必须且只能归属一个产品或一个项目
            models.CheckConstraint(
                check=Q(product__isnull=False, project__isnull=True)
                | Q(product__isnull=True, project__isnull=False),
                name="req_policy_scope_exactly_one",
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
                name="req_policy_required_count_consistent",
            ),
            # 每个作用域只允许一条有效配置
            models.UniqueConstraint(
                fields=["product"],
                condition=Q(product__isnull=False, deleted_at__isnull=True),
                name="req_policy_unique_product_active",
            ),
            models.UniqueConstraint(
                fields=["project"],
                condition=Q(project__isnull=False, deleted_at__isnull=True),
                name="req_policy_unique_project_active",
            ),
        ]

    def __str__(self):
        return f"approval policy of {self.product_id or self.project_id}"

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

    标准库不走审批 —— 库内条目创建即生效。这一点由 Requirement 上的
    req_library_item_never_approved 约束硬保证，不只是约定。
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
    identifier = models.CharField(
        max_length=12, db_index=True, verbose_name="标准库标识（条目编号前缀）"
    )
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
            ),
            # 标识是库内条目编号的前缀（SEC-12），也是导入后目标行溯源显示的前缀。
            # 带 deleted_at 条件：标识由用户手填，库删掉后应允许改嫁。
            models.UniqueConstraint(
                fields=["workspace", "identifier"],
                condition=Q(deleted_at__isnull=True),
                name="requirement_library_unique_workspace_identifier_active",
            ),
            models.CheckConstraint(
                check=~Q(identifier=""),
                name="requirement_library_identifier_not_blank",
            ),
        ]

    def __str__(self):
        return self.name

    def clean(self):
        # 归一化必须发生在任何唯一性判定之前。serializer 的 create/update 会调
        # full_clean()，而 full_clean 的顺序是 clean_fields → clean →
        # validate_unique → validate_constraints，save() 在这之后 ——
        # 只在 save() 里 upper() 的话，提交 "sec" 会被 validate_constraints 放行，
        # 然后在 INSERT 时撞上已有的 "SEC"，用户拿到 500 而不是 400。
        if self.identifier:
            self.identifier = self.identifier.strip().upper()
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
        if self.identifier:
            self.identifier = self.identifier.strip().upper()
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
    # 作用域内自增，与所属产品/项目/库的 identifier 拼成展示编号（ECOM-1）。
    # 刻意不给 default —— 无 default 的 PositiveIntegerField 让任何绕过
    # utils.requirement 那两个工厂的构造在 INSERT 时立刻炸，指向出问题的那行代码；
    # 给 default=1 会静默造出假编号，直到撞唯一约束才暴露，而那时现场已经跑偏了。
    sequence_id = models.PositiveIntegerField(verbose_name="作用域内自增序号")
    # 从标准库导入时记下出处，手工创建恒为 NULL。
    # 用裸 UUID 而不是外键：这是溯源记录，标准库被删之后「这条需求当年从 SEC 导入」
    # 这个事实不该跟着消失，也不该因此 PROTECT 住库的删除。
    # 前缀在读侧批量解析，见 utils.requirement.source_library_identifier_map。
    source_library_id = models.UUIDField(
        null=True, blank=True, db_index=True, verbose_name="来源标准库 ID"
    )
    source_sequence_id = models.PositiveIntegerField(
        null=True, blank=True, verbose_name="来源标准库条目序号"
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
    version = models.PositiveIntegerField(default=1, verbose_name="乐观锁计数（每次写入 +1）")
    approved_version = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name="最后一次通过审批的版本号（null 表示从未通过审批）",
    )
    # 「内容是否与已批准的那一版一致」不能靠比 JSON —— 千行网格每页都要这个标记。
    # 把通过审批那一刻的 version 记下来，version != approved_row_version 就是
    # 「批准后又改过」。
    approved_row_version = models.PositiveIntegerField(
        null=True,
        blank=True,
        verbose_name="通过审批那一刻的 version 值",
    )
    # 指向变更**项**而不是变更单：一列同时回答「在不在评审中」与「审的是不是删除」；
    # 又因为它是单值外键，「一条需求同时最多一张待审变更单」这个不变量由结构本身保证，
    # 既不需要额外唯一索引，也不需要在提交路径上做 EXISTS 查询。
    pending_change_item = models.ForeignKey(
        "db.RequirementChangeItem",
        on_delete=models.SET_NULL,
        related_name="+",
        null=True,
        blank=True,
        verbose_name="待审批的变更项（null 表示不在评审中）",
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
            models.Index(
                fields=["pending_change_item"],
                condition=Q(pending_change_item__isnull=False),
                name="req_pending_change_item",
            ),
        ]
        constraints = [
            models.CheckConstraint(
                check=Q(product__isnull=False, project__isnull=True, library__isnull=True)
                | Q(product__isnull=True, project__isnull=False, library__isnull=True)
                | Q(product__isnull=True, project__isnull=True, library__isnull=False),
                name="requirement_owner_exactly_one",
            ),
            # 两个版本列要么同时为空，要么同时有值
            models.CheckConstraint(
                check=Q(approved_version__isnull=True, approved_row_version__isnull=True)
                | Q(approved_version__isnull=False, approved_row_version__isnull=False),
                name="req_approved_version_pair_consistent",
            ),
            # draft ⟺ 从未通过审批。把「已确认的需求被打回 draft」变成写不进去的事，
            # 而不是靠代码自觉 —— 写入路径上有个默认值会悄悄干这件事，见
            # RequirementBuiltinWriteSerializer.status。
            models.CheckConstraint(
                check=Q(approved_version__isnull=True, status=RequirementItemStatus.DRAFT)
                | (
                    Q(approved_version__isnull=False)
                    & ~Q(status=RequirementItemStatus.DRAFT)
                ),
                name="req_draft_status_iff_never_approved",
            ),
            # 标准库条目永不走审批（见 RequirementLibrary 的文档字符串）
            models.CheckConstraint(
                check=Q(library__isnull=True)
                | Q(
                    library__isnull=False,
                    approved_version__isnull=True,
                    pending_change_item__isnull=True,
                    status=RequirementItemStatus.DRAFT,
                ),
                name="req_library_item_never_approved",
            ),
            # 编号在作用域内唯一，三个作用域各自独立编号
            # （靠 requirement_owner_exactly_one 保证一行只落进一个）。
            #
            # 条件里**故意不带** deleted_at__isnull=True：编号永不复用。
            # 软删的需求仍然占着自己的号 —— 它的编号已经写进版本快照、变更单快照和
            # 基线，也可能被别的行的 source_sequence_id 引用。复用会让历史里的
            # ECOM-7 指向两条不同的需求，那是审计链损坏，不是显示问题。
            # 取号侧必须对应地用 Requirement.all_objects，
            # 见 utils.requirement._sequence_allocator。
            models.UniqueConstraint(
                fields=["product", "sequence_id"],
                condition=Q(product__isnull=False),
                name="req_unique_product_sequence",
            ),
            models.UniqueConstraint(
                fields=["project", "sequence_id"],
                condition=Q(project__isnull=False),
                name="req_unique_project_sequence",
            ),
            models.UniqueConstraint(
                fields=["library", "sequence_id"],
                condition=Q(library__isnull=False),
                name="req_unique_library_sequence",
            ),
            # 来源两列同生同死
            models.CheckConstraint(
                check=Q(source_library_id__isnull=True, source_sequence_id__isnull=True)
                | Q(
                    source_library_id__isnull=False,
                    source_sequence_id__isnull=False,
                ),
                name="req_source_pair_consistent",
            ),
            # 标准库条目是导入的源头，不可能有来源。把 _new_library_item 里
            # 「无条件丢弃 source」这个约定变成写不进去的事。
            models.CheckConstraint(
                check=Q(library__isnull=True) | Q(source_library_id__isnull=True),
                name="req_library_item_has_no_source",
            ),
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

    @property
    def approval_state(self):
        """审批态。列表入口应先 annotate(pending_change_type=...)，避免每行一次
        取变更项 —— 那会把两份完整行快照拖进查询。"""
        if self.pending_change_item_id:
            change_type = getattr(self, "pending_change_type", None)
            if change_type is None:
                change_type = self.pending_change_item.change_type
            if change_type == RequirementChangeType.DELETE:
                return RequirementApprovalState.PENDING_DELETION
            return RequirementApprovalState.IN_REVIEW
        if self.approved_version is None:
            return RequirementApprovalState.DRAFT
        if self.version != self.approved_row_version:
            return RequirementApprovalState.MODIFIED
        return RequirementApprovalState.APPROVED

    @property
    def is_locked(self):
        """在评审中的行内容只读。删除待审同样锁住 —— 否则批准删除时落库的内容
        与审批人看到的已经不是同一份。"""
        return self.pending_change_item_id is not None

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


class RequirementApprover(BaseModel):
    """审批配置的审批人名单（谁可以审批），与审批规则（approval_type/required_count）配套。

    随配置存在：发起变更请求时按此名单快照为 RequirementChangeApproval 记录，所以
    在途的变更单不会因为名单被改而受影响。当前仅支持指定成员。
    """

    policy = models.ForeignKey(
        RequirementApprovalPolicy,
        on_delete=models.CASCADE,
        related_name="approvers",
        verbose_name="所属审批配置",
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
                fields=["policy", "approver"],
                condition=Q(deleted_at__isnull=True),
                name="req_approver_unique_policy_approver_active",
            )
        ]

    def __str__(self):
        return f"{self.approver_id} @ {self.policy_id}"


class RequirementChangeRequest(BaseModel):
    """一次变更申请，覆盖 1..N 条需求（默认 1）。

    审批单位是变更单而不是条目 —— 一张单里的 N 条需求同批通过、同批驳回。做单条部分
    通过会让「一条需求最多在一张待审单里」这个不变量无从记账，也会把审批记录变成
    逐项矩阵。

    「一条需求同时最多只能在一张待审变更单里」由 Requirement.pending_change_item
    这个单值外键保证，不需要额外的唯一索引。

    序号按作用域（产品或项目）自增，不再按基线 —— 基线已经不是变更单位了。
    """

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
    sequence_id = models.PositiveIntegerField(
        default=1, verbose_name="作用域内自增序号（用于展示 CR-001）"
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
    completed_at = models.DateTimeField(null=True, blank=True, verbose_name="完成时间")

    class Meta:
        db_table = "requirement_change_requests"
        ordering = ("-created_at",)
        indexes = [
            models.Index(
                fields=["product", "-created_at"],
                name="req_change_product_created",
            ),
            models.Index(
                fields=["project", "-created_at"],
                name="req_change_project_created",
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["product", "sequence_id"],
                condition=Q(product__isnull=False, deleted_at__isnull=True),
                name="req_change_unique_product_sequence_active",
            ),
            models.UniqueConstraint(
                fields=["project", "sequence_id"],
                condition=Q(project__isnull=False, deleted_at__isnull=True),
                name="req_change_unique_project_sequence_active",
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
        return f"CR-{self.sequence_id} [{self.status}]"

    def save(self, *args, **kwargs):
        if not self.workspace_id:
            if self.product_id:
                self.workspace_id = self.product.workspace_id
            elif self.project_id:
                self.workspace_id = self.project.workspace_id
        return super().save(*args, **kwargs)


class RequirementChangeItem(BaseModel):
    """变更单里的一条需求。一条需求在一张单里只出现一次。"""

    change_request = models.ForeignKey(
        RequirementChangeRequest,
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="所属变更请求",
    )
    change_type = models.CharField(
        max_length=10,
        choices=RequirementChangeType.choices,
        verbose_name="变更类型",
    )
    # 刻意不是外键（见文件顶部的「不追随删除」规则）。恒不为空 —— 新增的行提交前就
    # 已经在正式表里存在了（草稿态），不再有「尚未落库的提案行」。
    target_id = models.UUIDField(db_index=True, verbose_name="目标需求 ID")
    # 类型提上来当列：按需求类型分组不再需要在 JSON key 上做聚合
    requirement_type = models.ForeignKey(
        RequirementType,
        on_delete=models.PROTECT,
        related_name="change_items",
        verbose_name="所属需求类型",
    )
    # 提交那一刻的字段结构。字段结构立即生效不走审批，不冻结的话审批人看到的表头与他
    # 点「通过」时真正落库的可能已经不是同一份。用引用而不是内嵌：同一棵树内嵌会在每条
    # 需求的每个版本里各复制一份。
    schema_revision = models.ForeignKey(
        RequirementTypeSchemaRevision,
        on_delete=models.PROTECT,
        related_name="change_items",
        verbose_name="提交时的字段结构修订",
    )
    before_snapshot = models.JSONField(null=True, blank=True, verbose_name="变更前快照")
    proposed_snapshot = models.JSONField(
        null=True, blank=True, verbose_name="拟变更快照"
    )
    base_version = models.PositiveIntegerField(
        null=True, blank=True, verbose_name="提交时的 approved_version（新增时为空）"
    )
    base_row_version = models.PositiveIntegerField(
        verbose_name="提交时的 version 乐观锁值"
    )
    proposed_sort_order = models.FloatField(
        null=True, blank=True, verbose_name="拟排序值"
    )

    class Meta:
        db_table = "requirement_change_items"
        ordering = ("proposed_sort_order", "created_at", "id")
        indexes = [
            models.Index(
                fields=["change_request", "proposed_sort_order"],
                name="req_change_item_request_sort",
            ),
            # 变更轨迹按 target_id 横切所有变更单
            models.Index(
                fields=["target_id", "-created_at"],
                name="req_change_item_target_time",
            ),
            models.Index(
                fields=["change_request", "requirement_type"],
                name="req_change_item_request_type",
            ),
        ]

    def __str__(self):
        return f"{self.change_type} / {self.target_id}"


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
    """一条需求通过审批后的不可变存档。

    版本按需求自增（v1, v2, ...），不再按基线。target_kind 没了 —— 版本只属于需求
    条目；审批配置与字段结构都不走审批，各有自己的记录方式。

    删除通过审批时也写一条（change_type=delete，snapshot 取 before），这样基线快照
    引用的版本在需求被删之后依然解得开。
    """

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
    # 刻意不是外键（见文件顶部的「不追随删除」规则）
    target_id = models.UUIDField(db_index=True, verbose_name="需求 ID")
    requirement_type = models.ForeignKey(
        RequirementType,
        on_delete=models.PROTECT,
        related_name="versions",
        verbose_name="所属需求类型",
    )
    # 「这一版当时长什么样」必须能在一年后原样渲染出来。字段结构立即生效、不走审批，
    # 所以版本必须锁定当时的字段树 —— 用引用而不是内嵌：修订表 append-only、永不删除，
    # PROTECT 保证引用一定解得开。
    schema_revision = models.ForeignKey(
        RequirementTypeSchemaRevision,
        on_delete=models.PROTECT,
        related_name="versions",
        verbose_name="本版对应的字段结构修订",
    )
    version = models.PositiveIntegerField(verbose_name="版本号")
    change_type = models.CharField(
        max_length=10,
        choices=RequirementChangeType.choices,
        verbose_name="变更类型",
    )
    snapshot = models.JSONField(verbose_name="行内容快照")
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
        indexes = [
            models.Index(fields=["target_id", "-version"], name="req_version_target_version")
        ]
        constraints = [
            models.CheckConstraint(
                check=Q(product__isnull=False, project__isnull=True)
                | Q(product__isnull=True, project__isnull=False),
                name="req_version_scope_exactly_one",
            ),
            models.UniqueConstraint(
                fields=["target_id", "version"],
                condition=Q(deleted_at__isnull=True),
                name="req_version_unique_target_version_active",
            ),
        ]

    def __str__(self):
        return f"{self.target_id} / v{self.version}"

    def clean(self):
        super().clean()
        # 来源变更项必须属于来源变更请求
        if (
            self.change_request_id
            and self.change_item_id
            and self.change_item.change_request_id != self.change_request_id
        ):
            raise ValidationError({"change_item": "变更项必须属于当前来源变更请求。"})

    def save(self, *args, **kwargs):
        # 作用域优先由来源变更请求派生（product/project 未定时）；
        # 调用方也可直接给定 product/project，此时仅在缺 workspace_id 时反填。
        if not self.product_id and not self.project_id and self.change_request_id:
            source = self.change_request
            self.workspace_id = source.workspace_id
            self.product_id = source.product_id
            self.project_id = source.project_id
        elif not self.workspace_id:
            if self.product_id:
                self.workspace_id = self.product.workspace_id
            elif self.project_id:
                self.workspace_id = self.project.workspace_id
        return super().save(*args, **kwargs)


class RequirementBaseline(BaseModel):
    """需求基线：一组 (需求, 版本) 的不可变命名快照，语义等同 git tag。

    它**不是**变更单位 —— 没有状态、不参与审批、内容创建后不可改（只有名称与说明能改）。
    它只回答「在某个时刻，这批需求各自停在第几版」，用于发版留痕、对外交付，以及两个
    基线之间的差异对比。

    只收录 approved_version 不为空的需求。评审中的需求按它**上一个已通过**的版本收录 ——
    评审结果还不存在，不能进基线；从未通过审批的草稿则完全不收录。
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
    name = models.CharField(max_length=255, verbose_name="基线名称")
    description = models.TextField(blank=True, default="", verbose_name="基线说明")
    entry_count = models.PositiveIntegerField(default=0, verbose_name="收录条目数")

    class Meta:
        db_table = "requirement_baselines"
        ordering = ("-created_at",)
        constraints = [
            models.CheckConstraint(
                check=Q(product__isnull=False, project__isnull=True)
                | Q(product__isnull=True, project__isnull=False),
                name="req_baseline_scope_exactly_one",
            ),
            models.UniqueConstraint(
                fields=["product", "name"],
                condition=Q(product__isnull=False, deleted_at__isnull=True),
                name="req_baseline_unique_product_name_active",
            ),
            models.UniqueConstraint(
                fields=["project", "name"],
                condition=Q(project__isnull=False, deleted_at__isnull=True),
                name="req_baseline_unique_project_name_active",
            ),
        ]

    def __str__(self):
        return self.name

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


class RequirementBaselineEntry(BaseModel):
    """基线里的一条 (需求, 版本) 记录。"""

    baseline = models.ForeignKey(
        RequirementBaseline,
        on_delete=models.CASCADE,
        related_name="entries",
        verbose_name="所属基线",
    )
    # 刻意不是外键（见文件顶部的「不追随删除」规则）：需求被删掉之后基线仍然要能渲染，
    # 那正是打基线的意义所在。
    requirement_id = models.UUIDField(db_index=True, verbose_name="需求 ID")
    version = models.ForeignKey(
        RequirementVersion,
        on_delete=models.PROTECT,
        related_name="baseline_entries",
        verbose_name="收录的版本",
    )
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER, verbose_name="排序")

    class Meta:
        db_table = "requirement_baseline_entries"
        ordering = ("sort_order", "id")
        constraints = [
            models.UniqueConstraint(
                fields=["baseline", "requirement_id"],
                condition=Q(deleted_at__isnull=True),
                name="req_baseline_entry_unique_baseline_requirement",
            )
        ]

    def __str__(self):
        return f"{self.requirement_id} @ {self.baseline_id}"
