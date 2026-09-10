"""阶段评审：模板 → 裁剪 → 评审实例。

三层关系一句话说清：

1. **模板**（``StageReviewTemplate``）—— 工作区级的标准流程。一行 = 树上的一个节点：
   评审恒在顶层，评审活动既可以挂在某个评审下，也可以直接挂在阶段下（有些阶段没有
   汇总评审）。没有单独的「模板头」表，*阶段 + 这棵树* 就是模板。
2. **裁剪**（``ReviewTailoring`` + ``ReviewTailoringItem``）—— 项目级的二维勾选表：
   横轴产品、纵轴该阶段模板树的**全部节点**（评审与评审活动树形展开、逐个勾）。
   签批通过后生效，勾上的格子生成评审实例；改动走**原地修订**，同一张表在
   已生效与修订中之间往返，不复制新表。
3. **评审**（``StageReview``）—— 真正执行的那条记录，绑定项目 + 产品，有负责人、
   起止日期、状态与评审结论。评审活动同样落在这张表里（``kind`` 取 activity /
   o_stage_activity，配 ``parent``）。

命名上刻意不用裸 ``Review`` —— 本仓库「评审」已经有两个既有含义（需求变更评审、
QA 的用例评审 ``CaseReview``），这套是研发流程的阶段评审，一律带 ``StageReview`` 前缀。

两个和别处不一样的取舍：

- **阶段不新建表**，直接引用数据字典（``product_stage`` 字典，值形如 I 阶段 / O 阶段 /
  V 阶段）。``Product.stage`` 引用的就是它，新开一张 Stage 表会立刻出现两个「阶段」
  事实来源。若将来评审阶段要和产品阶段分家，只需新建一个 ``review_stage`` 字典 key，
  这里的外键指向不变。
- **「评审类型」是四值枚举**：评审 / 评审活动 / O阶段评审 / O阶段评审活动，与原始表一致。
  它同时编码了两件事 —— 层级（根 or 活动）与是否 O 阶段，所以判定层级一律走
  ``ROOT_KINDS`` / ``ACTIVITY_KINDS``，判定 O 阶段一律走 ``O_STAGE_KINDS``，
  别在业务代码里散着写 ``kind == "review"`` 这种单值比较，将来加 V 阶段类型会漏改。
  父子必须同族：评审下只能挂评审活动，O阶段评审下只能挂 O阶段评审活动
  （``ACTIVITY_KIND_BY_ROOT``）。
- ``kind`` 的 O 阶段属性与 ``stage`` 的一致性 DB 表达不了（字典值是用户自己填的文本），
  由 ``validate_kind_stage()`` 在 ``clean()`` 与序列化器里按**阶段名前缀**兜住：O 阶段类型
  只能落在 O 系列阶段（O阶段 / O-F1 / O-SV1…）上。阶段改名换前缀会让这条规则失效。
"""

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q

from plane.utils.html_processor import strip_tags

from .base import BaseModel
from .project import ProjectBaseModel

DEFAULT_SORT_ORDER = 65535
SORT_ORDER_STEP = 10000


class StageReviewKind(models.TextChoices):
    """评审类型。四个值 = 层级（根 / 活动）× 是否 O 阶段，与原始表一一对应。

    树最多两层：``*_REVIEW`` 恒在顶层；``*_ACTIVITY`` 挂在同族的 ``*_REVIEW`` 下，
    也允许没有父、直接挂在阶段下。
    """

    REVIEW = "review", "评审"
    ACTIVITY = "activity", "评审活动"
    O_STAGE_REVIEW = "o_stage_review", "O阶段评审"
    O_STAGE_ACTIVITY = "o_stage_activity", "O阶段评审活动"


# 层级判定统一走这两个集合，别在业务代码里写单值比较
ROOT_KINDS = (StageReviewKind.REVIEW, StageReviewKind.O_STAGE_REVIEW)
ACTIVITY_KINDS = (StageReviewKind.ACTIVITY, StageReviewKind.O_STAGE_ACTIVITY)
# 父子同族：根类型 → 它下面唯一合法的活动类型
ACTIVITY_KIND_BY_ROOT = {
    StageReviewKind.REVIEW: StageReviewKind.ACTIVITY,
    StageReviewKind.O_STAGE_REVIEW: StageReviewKind.O_STAGE_ACTIVITY,
}
# O 阶段专有字段的判定集合
O_STAGE_KINDS = (StageReviewKind.O_STAGE_REVIEW, StageReviewKind.O_STAGE_ACTIVITY)
# 「成品」分组的子属性，只在「O阶段评审」上有值（活动上没有）
FINISHED_GOODS_FIELDS = (
    "akf_code",
    "production_quantity",
    "product_config",
    "baseline_archive_code",
    "components",
)
# 「组件版本」分组的子属性，同样只在「O阶段评审」上有值。
# 落库列名 → 分组 json 里的 key（原始表里这一组的子属性就叫「版本」）
COMPONENT_VERSION_FIELDS = {"component_version": "version"}
# 生产方式 / 出货评估「O阶段评审」和「O阶段评审活动」都有
O_STAGE_ONLY_FIELDS = ("production_mode", "shipment_assessment")

# O 阶段类型只能落在 O 系列阶段上（O阶段、O-F1、O-SV1…）。阶段是数据字典的值、label 由
# 用户自己填，DB 里没有任何结构能表达「这是不是 O 阶段」，只能按名字前缀判定。
# 判定放宽到 strip + 大写；阶段改名成别的前缀时这条规则会失效 —— 属于已知代价。
O_STAGE_LABEL_PREFIX = "O"


def is_o_stage_label(label):
    return bool(label) and str(label).strip().upper().startswith(O_STAGE_LABEL_PREFIX)


def validate_kind_stage(node):
    """O 阶段类型不能挂到非 O 系列阶段上。

    模板与评审实例两张表同一口径。bulk_create / 迁移不走 clean()，预置数据不受影响
    （规格里只有「O阶段」用 O 阶段类型，本来就满足）。
    """
    if node.kind not in O_STAGE_KINDS:
        return
    stage = getattr(node, "stage", None)
    if stage is None or is_o_stage_label(stage.label):
        return
    raise ValidationError(
        {
            "kind": f"「{StageReviewKind(node.kind).label}」只能用在 O 系列阶段上，"
            f"「{stage.label}」不是。"
        }
    )


def validate_node_kind(node):
    """层级校验，模板与评审实例两张表口径完全一致，所以提出来共用。

    ``kind`` 编码了族（普通 / O 阶段）和层级两件事。**有父时**父子必须同族：评审下只能挂
    评审活动，O阶段评审下只能挂 O阶段评审活动。**无父时**两种层级都合法 —— 评审活动
    允许直接挂在阶段下。
    """
    if not node.parent_id:
        # 根类型无父天然合法；活动无父 = 直接挂在阶段下，也合法（有些阶段没有汇总评审）
        return
    if node.parent_id == node.id:
        raise ValidationError({"parent": "不能把自己作为父节点"})
    if node.kind not in ACTIVITY_KINDS:
        raise ValidationError({"kind": "挂在评审下的只能是评审活动"})
    if node.parent.kind not in ROOT_KINDS:
        # 仍然只有两层：活动下面不能再挂活动
        raise ValidationError({"parent": "评审活动只能挂在评审下，不能再往下嵌套"})
    expected = ACTIVITY_KIND_BY_ROOT[node.parent.kind]
    if node.kind != expected:
        raise ValidationError(
            {
                "kind": f"「{StageReviewKind(node.parent.kind).label}」下只能挂"
                f"「{StageReviewKind(expected).label}」"
            }
        )


class StageReviewStatus(models.TextChoices):
    """未评审 → 提交评审 → 评审人提交审核人审核 → 审核完成。"""

    NOT_STARTED = "not_started", "未评审"
    IN_REVIEW = "in_review", "评审中"
    IN_APPROVAL = "in_approval", "审核中"
    COMPLETED = "completed", "已评审"


class StageReviewResult(models.TextChoices):
    """评审结论。提交评审时必填，空串表示还没有结论。"""

    PASSED = "passed", "通过"
    REJECTED = "rejected", "不通过"
    WAIVED = "waived", "免审"
    CONDITIONAL = "conditional", "条件通过"


class ProductionMode(models.TextChoices):
    """生产方式，仅 O 阶段评审使用。"""

    NORMAL = "normal", "正常生产"
    RISK = "risk", "风险生产"


class ShipmentAssessment(models.TextChoices):
    """出货评估，仅 O 阶段评审使用。"""

    NORMAL = "normal", "正常出货"
    REFRESH = "refresh", "出货前刷新结论"
    RISK = "risk", "风险出货"


class ReviewTailoringStatus(models.TextChoices):
    """裁剪表的状态。四个值构成一个环，没有终态。

    草稿 ──提交签批──▶ 签批中 ──通过──▶ 已生效 ──开始修订──▶ 修订中 ──提交签批──▶ …

    驳回与撤回都回到**可编辑态**：从未生效过的回 ``draft``，生效过的回 ``revising``
    （判定走 ``approved_at`` 是否为空，见 ``utils/review_tailoring.py``）。没有
    ``rejected`` / ``cancelled`` 这种终态 —— 驳回不是结局，是让人改完再提。
    """

    DRAFT = "draft", "草稿"
    PENDING = "pending", "签批中"
    APPROVED = "approved", "已生效"
    REVISING = "revising", "修订中"


class ReviewTailoringApprovalType(models.TextChoices):
    """裁剪表的签批通过规则。

    刻意不复用 ``RequirementApprovalType`` —— 那个枚举带 ``none``（无需评审），
    裁剪表**必须**有人签批。借过来的话 DB 的 choices 会放行 none，只靠序列化器挡
    等于把规则写了一半。
    """

    ANY = "any", "任一通过"
    ALL = "all", "全部通过"
    N_OF_M = "n_of_m", "指定人数通过"


class ReviewTailoringApprovalAction(models.TextChoices):
    """签批动作。``action`` 为空表示这一轮里这个人还没表态。"""

    APPROVED = "approved", "通过"
    REJECTED = "rejected", "驳回"


class StageReviewTemplate(BaseModel):
    """模板节点：某阶段下的一个评审，或某评审下的一个评审活动。

    主导者 / 审核者存的是**角色名称文本**而不是人 —— 模板是工作区级的标准流程，落到
    具体项目 + 产品时才按产品成员配置解析成人（见 ``StageReview.leader/auditor``）。
    """

    workspace = models.ForeignKey(
        "db.Workspace",
        on_delete=models.CASCADE,
        related_name="stage_review_templates",
        verbose_name="所属工作区",
    )
    # 指向 product_stage 字典的值（I 阶段 / O 阶段 / V 阶段…）。RESTRICT 与 Product.stage 一致：
    # 还有模板挂着的阶段值不允许删。
    stage = models.ForeignKey(
        "db.DataDictionaryItem",
        on_delete=models.RESTRICT,
        related_name="stage_review_templates",
        verbose_name="阶段",
    )
    kind = models.CharField(
        max_length=20,
        choices=StageReviewKind.choices,
        default=StageReviewKind.REVIEW,
        db_index=True,
        verbose_name="类型",
    )
    # 评审活动指向它所属的评审；评审自身恒为空，活动也可以为空（直接挂在阶段下）。
    # 最多两层，见 Meta.constraints 与 clean()。
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
        verbose_name="所属评审",
    )
    title = models.CharField(max_length=255, verbose_name="标题")
    # 富文本。口径同 Requirement.description_html / Product.description_html：只存一列 HTML，
    # 不另存 json / stripped / binary —— 那三列是 Issue、Page 走协同编辑才需要的。
    description_html = models.TextField(blank=True, null=True, verbose_name="描述 HTML")
    initiator_role = models.CharField(
        max_length=255, blank=True, default="", verbose_name="发起者角色"
    )
    leader_role = models.CharField(
        max_length=255, blank=True, default="", verbose_name="主导者角色"
    )
    auditor_role = models.CharField(
        max_length=255, blank=True, default="", verbose_name="审核者角色"
    )
    # 停用只影响新裁剪单的可选项，已生成的评审实例不受影响（不删历史）。
    is_active = models.BooleanField(default=True, verbose_name="是否启用")
    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER, verbose_name="排序")

    class Meta:
        db_table = "stage_review_templates"
        ordering = ("sort_order", "created_at", "id")
        verbose_name = "Stage Review Template"
        verbose_name_plural = "Stage Review Templates"
        indexes = [
            models.Index(fields=["workspace", "stage"], name="srt_workspace_stage"),
        ]
        constraints = [
            # 同阶段下顶层节点标题不重（parent 为空这一支 —— 根评审，以及直接挂在
            # 阶段下的评审活动，它们互为兄弟）
            models.UniqueConstraint(
                fields=["workspace", "stage", "title"],
                condition=Q(parent__isnull=True, deleted_at__isnull=True),
                name="srt_unique_stage_title_active",
            ),
            # 同评审下活动标题不重
            models.UniqueConstraint(
                fields=["parent", "title"],
                condition=Q(parent__isnull=False, deleted_at__isnull=True),
                name="srt_unique_parent_title_active",
            ),
            # 评审（含 O阶段评审）恒无父；活动有父没父都行 —— 有些阶段没有汇总评审，
            # 活动就是该阶段的顶层节点。有父时父必须是同族的评审，那半条在 clean() 里。
            models.CheckConstraint(
                check=Q(kind__in=ROOT_KINDS, parent__isnull=True)
                | Q(kind__in=ACTIVITY_KINDS),
                name="srt_kind_parent_consistent",
            ),
        ]

    def clean(self):
        validate_node_kind(self)
        validate_kind_stage(self)

    def save(self, *args, **kwargs):
        # 阶段 / 工作区跟随父节点，避免活动与它所属的评审落在不同阶段
        if self.parent_id:
            self.stage_id = self.parent.stage_id
            self.workspace_id = self.parent.workspace_id
        if self._state.adding and self.sort_order == DEFAULT_SORT_ORDER:
            largest = StageReviewTemplate.objects.filter(
                workspace_id=self.workspace_id,
                stage_id=self.stage_id,
                parent_id=self.parent_id,
            ).aggregate(largest=models.Max("sort_order"))["largest"]
            if largest is not None:
                self.sort_order = largest + SORT_ORDER_STEP
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.title} [{self.kind}]"


class StageReview(ProjectBaseModel):
    """评审实例：一条真正要执行的评审（或评审活动），绑定项目 + 产品。

    由裁剪表勾选生成，也允许手工新建（``template`` 为空）。评审与评审活动在裁剪矩阵里
    各占一行、各自可勾，所以两者都可能被单独生成。

    **同一 (项目, 产品, 模板项) 允许存在多条**：同一阶段下可以有多张裁剪表，两张表
    各自勾中同一个格子就各生成一条评审（产品决策，2026-09-10）。所以生成时的去重只
    看「本格子的 ``stage_review`` 指针是否为空」，不靠唯一约束兜底。

    产品与项目必须已经通过 ``ProductProject`` 建立关联 —— 这条跨表规则 DB 表达不了
    （workspace 在各自父表上），由写入口校验，同 ``ProductProject`` 的注释。
    """

    # project / workspace 由 ProjectBaseModel 提供
    product = models.ForeignKey(
        "db.Product",
        on_delete=models.CASCADE,
        related_name="stage_reviews",
        verbose_name="所属产品",
    )
    stage = models.ForeignKey(
        "db.DataDictionaryItem",
        on_delete=models.RESTRICT,
        related_name="stage_reviews",
        verbose_name="评审阶段",
    )
    kind = models.CharField(
        max_length=20,
        choices=StageReviewKind.choices,
        default=StageReviewKind.REVIEW,
        db_index=True,
        verbose_name="评审类型",
    )
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
        verbose_name="所属评审",
    )
    # 来源模板节点。SET_NULL：模板节点被删掉，已生成的评审要留着。
    template = models.ForeignKey(
        StageReviewTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stage_reviews",
        verbose_name="来源模板项",
    )

    title = models.CharField(max_length=255, verbose_name="标题")
    # 富文本，同模板表
    description_html = models.TextField(blank=True, null=True, verbose_name="描述 HTML")

    # 角色名快照：模板改了不影响已生成的评审，回看历史时角色口径不变
    initiator_role = models.CharField(
        max_length=255, blank=True, default="", verbose_name="发起者角色"
    )
    leader_role = models.CharField(
        max_length=255, blank=True, default="", verbose_name="主导者角色"
    )
    auditor_role = models.CharField(
        max_length=255, blank=True, default="", verbose_name="审核者角色"
    )
    # 角色解析出来的实际人。leader 就是原始表里的「负责人」（按产品的角色配置筛选人员）。
    leader = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="led_stage_reviews",
        verbose_name="主导者",
    )
    auditor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audited_stage_reviews",
        verbose_name="审核者",
    )

    status = models.CharField(
        max_length=20,
        choices=StageReviewStatus.choices,
        default=StageReviewStatus.NOT_STARTED,
        db_index=True,
        verbose_name="状态",
    )
    result = models.CharField(
        max_length=20,
        choices=StageReviewResult.choices,
        blank=True,
        default="",
        verbose_name="评审结果",
    )
    conditional_reason = models.TextField(
        blank=True, default="", verbose_name="条件通过原因"
    )
    start_date = models.DateField(null=True, blank=True, verbose_name="开始日期")
    end_date = models.DateField(null=True, blank=True, verbose_name="结束日期")
    work_instruction = models.TextField(blank=True, default="", verbose_name="工作指引")

    # ↓ O 阶段专有（成品 / 组件版本只在 kind=o_stage_review 上，生产方式与出货评估两个
    #   O 阶段类型都有，见 clean()）。原始表里这是两个分组：成品（5 个子属性）和
    #   组件版本（1 个子属性「版本」），列平铺落库便于查询与筛选，对外由
    #   ``finished_goods`` / ``component_versions`` 两个 property 拼成分组 json。
    akf_code = models.CharField(
        max_length=255, blank=True, default="", verbose_name="AKF 编号"
    )
    production_quantity = models.PositiveIntegerField(
        null=True, blank=True, verbose_name="生产数量"
    )
    product_config = models.CharField(
        max_length=255, blank=True, default="", verbose_name="产品配置"
    )
    baseline_archive_code = models.CharField(
        max_length=255, blank=True, default="", verbose_name="数据基线归档编号"
    )
    # 成品含哪些模块，默认带出 基表硬件 / 基表软件 / 模块硬件 / 模块软件
    components = models.JSONField(default=list, blank=True, verbose_name="组件")
    # 「组件版本」分组下的唯一子属性，形如 "主板：板内V2.2，板边V2.4\n电源板：板内V2.2，板边V2.5"
    component_version = models.TextField(
        blank=True, default="", verbose_name="组件版本 - 版本"
    )
    production_mode = models.CharField(
        max_length=20,
        choices=ProductionMode.choices,
        blank=True,
        default="",
        verbose_name="生产方式",
    )
    shipment_assessment = models.CharField(
        max_length=30,
        choices=ShipmentAssessment.choices,
        blank=True,
        default="",
        verbose_name="出货评估",
    )

    sort_order = models.FloatField(default=DEFAULT_SORT_ORDER, verbose_name="排序")

    # 附件与评论不占本表的列，都是反查：
    # - 附件 → ``self.assets``（entity_type=STAGE_REVIEW_FILE 的 FileAsset，
    #   走两步预签名上传，同迭代 / 发布的附件）
    # - 评论 → ``self.comments``（``StageReviewComment``）

    class Meta:
        db_table = "stage_reviews"
        ordering = ("sort_order", "created_at", "id")
        verbose_name = "Stage Review"
        verbose_name_plural = "Stage Reviews"
        indexes = [
            models.Index(
                fields=["project", "product", "stage"], name="sr_project_product_stage"
            ),
            models.Index(fields=["project", "status"], name="sr_project_status"),
        ]
        constraints = [
            # 同 StageReviewTemplate：评审恒无父，活动有父没父都行
            models.CheckConstraint(
                check=Q(kind__in=ROOT_KINDS, parent__isnull=True)
                | Q(kind__in=ACTIVITY_KINDS),
                name="sr_kind_parent_consistent",
            ),
        ]

    def clean(self):
        validate_node_kind(self)
        validate_kind_stage(self)
        if self.result == StageReviewResult.CONDITIONAL and not self.conditional_reason:
            raise ValidationError({"conditional_reason": "条件通过必须填写原因"})
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValidationError({"end_date": "结束日期不能早于开始日期"})
        # O 阶段字段只能出现在对应类型上，否则数据一乱就分不清是历史遗留还是填错了
        if self.kind != StageReviewKind.O_STAGE_REVIEW:
            filled = [
                f
                for f in (*FINISHED_GOODS_FIELDS, *COMPONENT_VERSION_FIELDS)
                if getattr(self, f)
            ]
            if filled:
                raise ValidationError({filled[0]: "成品与组件版本只属于「O阶段评审」"})
        if self.kind not in O_STAGE_KINDS:
            filled = [f for f in O_STAGE_ONLY_FIELDS if getattr(self, f)]
            if filled:
                raise ValidationError(
                    {filled[0]: "生产方式 / 出货评估只属于 O 阶段的评审类型"}
                )

    def save(self, *args, **kwargs):
        # 活动跟随它所属的评审：项目、产品、阶段三者必须一致
        if self.parent_id:
            self.project_id = self.parent.project_id
            self.product_id = self.parent.product_id
            self.stage_id = self.parent.stage_id
        return super().save(*args, **kwargs)

    # ------------------------------------------------------------------ 分组 json
    #
    # 成品与组件版本在原始表里是两个分组，落库拆成列（可查询、可筛选、可建索引），
    # 对外按分组吐 json。两个 property 都可读可写，serializer 直接挂上去即可，
    # 写入口不用逐列拆装。

    @property
    def finished_goods(self) -> dict:
        """成品：AKF 编号 / 生产数量 / 产品配置 / 数据基线归档编号 / 组件。"""
        return {field: getattr(self, field) for field in FINISHED_GOODS_FIELDS}

    @property
    def component_versions(self) -> dict:
        """组件版本。这一组在原始表里只有「版本」一个子属性。"""
        return {
            key: getattr(self, field) for field, key in COMPONENT_VERSION_FIELDS.items()
        }

    def __str__(self):
        return f"{self.title} [{self.status}]"


class StageReviewComment(ProjectBaseModel):
    """评审下的评论。结构对齐 ``ReleaseComment`` / ``CycleComment``。

    评论里的内联图片是 ``STAGE_REVIEW_COMMENT_DESCRIPTION`` 资产，定位路径时走的是
    评论所属的评审（同 ``CYCLE_COMMENT_DESCRIPTION``），避免评论还没落库时定不出路径。
    """

    stage_review = models.ForeignKey(
        StageReview,
        on_delete=models.CASCADE,
        related_name="comments",
        verbose_name="所属评审",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="stage_review_comments",
        null=True,
        verbose_name="评论人",
    )
    comment_html = models.TextField(blank=True, default="<p></p>")
    comment_json = models.JSONField(blank=True, default=dict)
    comment_stripped = models.TextField(blank=True, default="")
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
        verbose_name="父评论",
    )
    edited_at = models.DateTimeField(null=True, blank=True, verbose_name="编辑时间")

    class Meta:
        db_table = "stage_review_comments"
        ordering = ("-created_at",)
        verbose_name = "Stage Review Comment"
        verbose_name_plural = "Stage Review Comments"
        indexes = [
            models.Index(
                fields=["stage_review", "-created_at"], name="src_review_created"
            ),
        ]

    def save(self, *args, **kwargs):
        self.comment_stripped = (
            strip_tags(self.comment_html) if self.comment_html else ""
        )
        if not self.project_id and self.stage_review_id:
            self.project_id = self.stage_review.project_id
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.stage_review_id} {self.actor_id}"


class ReviewTailoring(ProjectBaseModel):
    """一张裁剪表：某项目某阶段下，「哪些产品要做哪些评审」的二维勾选表。

    **原地修订**：已生效的表点「开始修订」进入 ``revising``，在同一张表上改勾选与
    裁剪原因，再走一轮签批；通过时按差异新增 / 删除评审实例。不复制新表 —— 复制会
    让「当前生效的是哪一张」变成需要推算的事实，而矩阵本身就是可以就地改的。
    ``revision`` 只是**生效次数**（0 = 从未生效），不再是版本号。

    **同一 (项目, 阶段) 允许多张表**（产品决策 2026-09-10）：按标题区分，各自签批、
    各自生效，同一格子被两张表勾中就生成两条评审。所以这里没有任何跨表唯一约束。

    签批人名单与通过规则落在 ``approval_type`` / ``required_count`` 与
    ``ReviewTailoringApproval`` 行上，**按轮次（``round``）记账**：每提交一次
    ``round += 1`` 并新建一批签批行，历史轮次原样留着当审计线索。
    """

    # project / workspace 由 ProjectBaseModel 提供
    stage = models.ForeignKey(
        "db.DataDictionaryItem",
        on_delete=models.RESTRICT,
        related_name="review_tailorings",
        verbose_name="裁剪阶段",
    )
    title = models.CharField(max_length=255, verbose_name="标题")
    # 富文本。口径同 StageReviewTemplate.description_html：只存一列 HTML。
    description_html = models.TextField(blank=True, null=True, verbose_name="描述 HTML")
    # 生效次数：0 = 从未生效。与 approved_at 互为冗余，由 CheckConstraint 钉住。
    revision = models.PositiveIntegerField(default=0, verbose_name="生效次数")
    status = models.CharField(
        max_length=20,
        choices=ReviewTailoringStatus.choices,
        default=ReviewTailoringStatus.DRAFT,
        db_index=True,
        verbose_name="状态",
    )
    # ↓ 签批：规则挂在表头，只保留**最近一轮**；历史轮次的规则在提交活动的 extra 里。
    # 草稿态还没配规则，所以允许空串（CheckConstraint 的第二支）。
    approval_type = models.CharField(
        max_length=10,
        choices=ReviewTailoringApprovalType.choices,
        blank=True,
        default="",
        verbose_name="签批通过规则",
    )
    required_count = models.PositiveSmallIntegerField(
        null=True, blank=True, verbose_name="最少通过人数"
    )
    round = models.PositiveIntegerField(default=0, verbose_name="签批轮次")
    # 撤回要判「是不是你提交的」，而修订的提交人未必是建表的人，所以不能用 created_by。
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="submitted_review_tailorings",
        verbose_name="本轮提交人",
    )
    submitted_at = models.DateTimeField(
        null=True, blank=True, verbose_name="提交签批时间"
    )
    approved_at = models.DateTimeField(
        null=True, blank=True, verbose_name="最近一次生效时间"
    )
    # 生效那一刻每个格子的 {selected, reason, stage_review_id}，供「取消修订」原样回滚。
    # 修订期间不碰评审实例，所以这份快照足够还原，不需要另存历史明细表。
    effective_snapshot = models.JSONField(
        null=True, blank=True, verbose_name="生效快照"
    )

    class Meta:
        db_table = "review_tailorings"
        ordering = ("-created_at",)
        verbose_name = "Review Tailoring"
        verbose_name_plural = "Review Tailorings"
        indexes = [
            models.Index(fields=["project", "stage"], name="rt_project_stage"),
            models.Index(fields=["project", "status"], name="rt_project_status"),
        ]
        constraints = [
            # 人数只对 n_of_m 有意义，口径同 req_change_required_count_consistent
            models.CheckConstraint(
                check=(
                    Q(approval_type=ReviewTailoringApprovalType.N_OF_M)
                    & Q(required_count__gte=1)
                )
                | (
                    ~Q(approval_type=ReviewTailoringApprovalType.N_OF_M)
                    & Q(required_count__isnull=True)
                ),
                name="rt_required_count_consistent",
            ),
            # revision 是 approved_at 的冗余计数，两者不允许对不上
            models.CheckConstraint(
                check=Q(approved_at__isnull=True, revision=0)
                | Q(approved_at__isnull=False, revision__gte=1),
                name="rt_revision_effective_consistent",
            ),
        ]

    def __str__(self):
        return f"{self.title} [{self.status}]"


class ReviewTailoringItem(BaseModel):
    """裁剪矩阵里的一个格子：(产品 × 模板节点) 是否需要做。

    纵轴是树：评审与它下面的评审活动各占一行，都能单独勾。「勾了父不勾子」/「勾了子
    不勾父」分别生成什么，是生效编排要定的产品语义，本模型不做限制。

    ``stage_review`` 记的是这个格子当前对应的评审实例：生效时勾上且指针为空就新建一条
    并回填，取消勾选就软删那条评审并把指针置空。**修订是原地改**，所以一个格子在任一
    时刻最多指向一条评审，不存在两个版本共用一条的情况。
    """

    tailoring = models.ForeignKey(
        ReviewTailoring,
        on_delete=models.CASCADE,
        related_name="items",
        verbose_name="所属裁剪单",
    )
    # 横轴
    product = models.ForeignKey(
        "db.Product",
        on_delete=models.CASCADE,
        related_name="review_tailoring_items",
        verbose_name="产品",
    )
    # 纵轴，模板树上的任意节点（评审或评审活动都能单独勾）。PROTECT：被引用过就不许删，
    # 否则历史裁剪单会变成一张读不懂的表。
    template = models.ForeignKey(
        StageReviewTemplate,
        on_delete=models.PROTECT,
        related_name="tailoring_items",
        verbose_name="模板评审",
    )
    # 标题快照，模板改名后历史单仍显示当时的口径
    title = models.CharField(max_length=255, verbose_name="评审标题（快照）")
    selected = models.BooleanField(default=False, verbose_name="是否需要")
    # 「裁剪原因」：**未勾选**时必填（提交签批时校验，草稿态允许空）。勾上的格子这里恒为空。
    reason = models.TextField(blank=True, default="", verbose_name="裁剪原因")
    stage_review = models.ForeignKey(
        StageReview,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tailoring_items",
        verbose_name="生成的评审",
    )

    class Meta:
        db_table = "review_tailoring_items"
        ordering = ("template__sort_order", "product__name", "id")
        verbose_name = "Review Tailoring Item"
        verbose_name_plural = "Review Tailoring Items"
        indexes = [
            models.Index(fields=["tailoring", "product"], name="rti_tailoring_product"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["tailoring", "product", "template"],
                condition=Q(deleted_at__isnull=True),
                name="rti_unique_tailoring_product_template_active",
            ),
        ]

    def clean(self):
        # 裁剪矩阵树形展开、评审与评审活动逐个勾，所以纵轴不再限制 kind，
        # 只留「格子的模板节点必须属于本裁剪单的阶段」这一条。
        if self.tailoring.stage_id != self.template.stage_id:
            raise ValidationError({"template": "模板评审的阶段与裁剪单的阶段不一致"})

    def save(self, *args, **kwargs):
        if not self.title and self.template_id:
            self.title = self.template.title
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.product_id} x {self.title} = {self.selected}"


class ReviewTailoringApproval(BaseModel):
    """一轮签批里某个人的表态。结构对齐 ``RequirementChangeApproval``。

    **按轮次记账**：每次提交签批 ``ReviewTailoring.round`` 加一并新建一批行，判定
    「谁还没表态」一律 ``filter(round=tailoring.round)``。历史轮次的行留着当审计线索，
    不删也不复用 —— 驳回后改一改再提是常态，复用行会把两次表态搅成一次。
    """

    tailoring = models.ForeignKey(
        ReviewTailoring,
        on_delete=models.CASCADE,
        related_name="approvals",
        verbose_name="所属裁剪表",
    )
    approver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="review_tailoring_approvals",
        verbose_name="签批人",
    )
    round = models.PositiveIntegerField(default=1, verbose_name="第几轮签批")
    action = models.CharField(
        max_length=20,
        choices=ReviewTailoringApprovalAction.choices,
        null=True,
        blank=True,
        verbose_name="签批动作（null 表示尚未表态）",
    )
    comment = models.TextField(blank=True, default="", verbose_name="签批意见")
    acted_at = models.DateTimeField(null=True, blank=True, verbose_name="表态时间")

    class Meta:
        db_table = "review_tailoring_approvals"
        ordering = ("tailoring", "round", "created_at")
        verbose_name = "Review Tailoring Approval"
        verbose_name_plural = "Review Tailoring Approvals"
        indexes = [
            models.Index(fields=["tailoring", "round"], name="rta_tailoring_round"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["tailoring", "round", "approver"],
                condition=Q(deleted_at__isnull=True),
                name="rta_unique_tailoring_round_approver_active",
            ),
        ]

    def __str__(self):
        return f"r{self.round} {self.approver_id} [{self.action or '待签批'}]"


class ReviewTailoringActivity(ProjectBaseModel):
    """裁剪表的变更历史。字段形状对齐 ``ReleaseActivity`` / ``IssueActivity``。

    **同步写入**，与产生它的动作在同一个事务里 —— 与 release / cycle / issue 的活动
    不同，那几套挂在通用写路径上、量大且与主流程无关，所以走 Celery；这里的事件全部
    由裁剪表自己的几个动作产生，异步化换不来什么，却会带来「生效了但历史丢了」。
    """

    tailoring = models.ForeignKey(
        ReviewTailoring,
        on_delete=models.CASCADE,
        related_name="activities",
        verbose_name="所属裁剪表",
    )
    verb = models.CharField(max_length=255, default="created", verbose_name="动作")
    field = models.CharField(
        max_length=255, blank=True, null=True, verbose_name="字段名"
    )
    old_value = models.TextField(blank=True, null=True, verbose_name="旧值")
    new_value = models.TextField(blank=True, null=True, verbose_name="新值")
    comment = models.TextField(blank=True, default="", verbose_name="说明")
    tailoring_comment = models.ForeignKey(
        "db.ReviewTailoringComment",
        on_delete=models.SET_NULL,
        related_name="comment_activities",
        null=True,
        blank=True,
        verbose_name="关联评论",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="review_tailoring_activities",
        verbose_name="操作人",
    )
    old_identifier = models.UUIDField(null=True)
    new_identifier = models.UUIDField(null=True)
    epoch = models.FloatField(null=True)
    # 格子级变更把 product_id / template_id 放这里，前端才能把「XX 产品的 XX 评审」拼出来
    extra = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "review_tailoring_activities"
        ordering = ("created_at",)
        verbose_name = "Review Tailoring Activity"
        verbose_name_plural = "Review Tailoring Activities"
        indexes = [
            models.Index(
                fields=["tailoring", "created_at"], name="rtact_tailoring_created"
            ),
        ]

    def __str__(self):
        return f"{self.tailoring_id} {self.field} {self.verb}"


class ReviewTailoringComment(ProjectBaseModel):
    """裁剪表下的评论。结构对齐 ``StageReviewComment`` / ``ReleaseComment``。

    评论里的内联图片走 ``PROJECT_DESCRIPTION`` 资产（同发布单详情的富文本），不另开
    entity_type —— 再开一个要连带改 ``FileAsset`` 的外键、``file_path`` 的解析分支和
    资产目录树三处，评论图片撑不起这个成本。
    """

    tailoring = models.ForeignKey(
        ReviewTailoring,
        on_delete=models.CASCADE,
        related_name="comments",
        verbose_name="所属裁剪表",
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="review_tailoring_comments",
        null=True,
        verbose_name="评论人",
    )
    comment_html = models.TextField(blank=True, default="<p></p>")
    comment_json = models.JSONField(blank=True, default=dict)
    comment_stripped = models.TextField(blank=True, default="")
    parent = models.ForeignKey(
        "self",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="children",
        verbose_name="父评论",
    )
    edited_at = models.DateTimeField(null=True, blank=True, verbose_name="编辑时间")

    class Meta:
        db_table = "review_tailoring_comments"
        ordering = ("-created_at",)
        verbose_name = "Review Tailoring Comment"
        verbose_name_plural = "Review Tailoring Comments"
        indexes = [
            models.Index(
                fields=["tailoring", "-created_at"], name="rtc_tailoring_created"
            ),
        ]

    def save(self, *args, **kwargs):
        self.comment_stripped = (
            strip_tags(self.comment_html) if self.comment_html else ""
        )
        if not self.project_id and self.tailoring_id:
            self.project_id = self.tailoring.project_id
        return super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.tailoring_id} {self.actor_id}"
