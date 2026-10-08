"""阶段评审实例的接口契约。

三层输出：列表行（一个阶段的全部评审，扁平返回、由前端按产品分组并把评审活动缩进到
所属评审下）、详情（带描述、工作指引、O 阶段分组、附件与评论计数），以及活动与评论。
输入按动作拆成几个小序列化器，形状校验留在这里，跨表规则（父评审是否同产品、结论是否
齐备）在 ``utils/stage_review.py``。

**评审与评审活动共用同一套序列化器** —— 两者字段几乎一样，只有层级不同（产品决策）。
前端也共用同一个抽屉，所以这里刻意不按 kind 分叉。
"""

from rest_framework import serializers

from plane.app.serializers.project_stage import ProjectStageLiteSerializer
from plane.app.serializers.user import UserLiteSerializer
from plane.db.models import (
    ProjectMember,
    StageReview,
    StageReviewActivity,
    StageReviewComment,
    StageReviewComponentVersion,
    StageReviewFinishedGood,
    StageReviewKind,
    StageReviewResult,
    User,
)
from plane.db.models.stage_review import ProductionMode, ShipmentAssessment

from .base import BaseSerializer


class StageReviewProductSerializer(serializers.Serializer):
    """列表分组头要的四个字段。手写而不是复用 ProductSerializer：那个太重。"""

    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)
    code = serializers.CharField(read_only=True)
    identifier = serializers.CharField(read_only=True)


class StageReviewProjectSerializer(serializers.Serializer):
    """产品页按项目分组 / 项目列 / 抽屉面包屑要的字段。

    不复用 ProjectLiteSerializer：那个带 cover_image_url，会逐行触碰封面资产外键。
    """

    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)
    identifier = serializers.CharField(read_only=True)
    logo_props = serializers.JSONField(read_only=True)


class StageReviewListSerializer(BaseSerializer):
    """列表行。附件数由 view 的 queryset annotate 出来，不在这里反查。

    ``is_manual`` 就是「模板为空」—— 手工新建的评审不进裁剪表，列表要能一眼认出来。
    ``project_detail`` 给产品页用（一个产品横跨多个项目）；queryset 都已 select_related project。
    """

    project_detail = StageReviewProjectSerializer(source="project", read_only=True)
    product_id = serializers.UUIDField(read_only=True)
    product_detail = StageReviewProductSerializer(source="product", read_only=True)
    stage_id = serializers.UUIDField(read_only=True)
    parent_id = serializers.UUIDField(read_only=True)
    template_id = serializers.UUIDField(read_only=True)
    # 来源裁剪表：同一产品的同一评审在多张表里都保留时会各生成一条，列表靠这个区分。
    # 反向关系，由 view annotate 出来，不在这里逐行反查；手工新建的评审为空。
    tailoring_id = serializers.UUIDField(read_only=True, default=None)
    tailoring_title = serializers.CharField(read_only=True, default=None)
    # 负责人 / 审核者都是名单；view 的 queryset 已预取（带头像），这里不再逐行查库
    leader_ids = serializers.SerializerMethodField()
    leader_details = UserLiteSerializer(source="leaders", many=True, read_only=True)
    auditor_ids = serializers.SerializerMethodField()
    auditor_details = UserLiteSerializer(source="auditors", many=True, read_only=True)
    attachment_count = serializers.IntegerField(read_only=True, default=0)
    comment_count = serializers.IntegerField(read_only=True, default=0)
    is_manual = serializers.SerializerMethodField()

    class Meta:
        model = StageReview
        fields = [
            "id",
            "project_id",
            "project_detail",
            "workspace_id",
            "product_id",
            "product_detail",
            "stage_id",
            "parent_id",
            "template_id",
            "tailoring_id",
            "tailoring_title",
            "kind",
            "title",
            "status",
            "result",
            "leader_ids",
            "leader_details",
            "auditor_ids",
            "auditor_details",
            "start_date",
            "end_date",
            "attachment_count",
            "comment_count",
            "is_manual",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_is_manual(self, obj) -> bool:
        return obj.template_id is None

    def get_leader_ids(self, obj):
        return [user.id for user in obj.leaders.all()]

    def get_auditor_ids(self, obj):
        return [user.id for user in obj.auditors.all()]


class StageReviewFinishedGoodSerializer(BaseSerializer):
    """成品表的一行。读写共用：新建 / 改格子时只校验形状，归属由 utils 负责。"""

    class Meta:
        model = StageReviewFinishedGood
        fields = [
            "id",
            "akf_code",
            "production_quantity",
            "product_config",
            "baseline_archive_code",
            "sort_order",
        ]
        read_only_fields = ["id", "sort_order"]


class StageReviewComponentVersionSerializer(BaseSerializer):
    """组件版本表的一行。"""

    class Meta:
        model = StageReviewComponentVersion
        fields = ["id", "component", "version", "sort_order"]
        read_only_fields = ["id", "sort_order"]


class StageReviewChildSerializer(BaseSerializer):
    """父评审详情里「评审活动」区块的一行：只读，只带这一行要画的字段。"""

    leader_ids = serializers.SerializerMethodField()
    leader_details = UserLiteSerializer(source="leaders", many=True, read_only=True)

    class Meta:
        model = StageReview
        fields = [
            "id",
            "kind",
            "title",
            "status",
            "result",
            "leader_ids",
            "leader_details",
            "end_date",
            "production_mode",
            "shipment_assessment",
            "sort_order",
        ]
        read_only_fields = fields

    def get_leader_ids(self, obj):
        return [user.id for user in obj.leaders.all()]


class StageReviewDetailSerializer(StageReviewListSerializer):
    """抽屉里要的全部字段。

    成品与组件版本是两张子表，按行吐出来，只有「O阶段评审」有值；
    生产方式与出货评估两种 O 阶段类型都有。前端按 ``kind`` 决定渲不渲这两块。
    """

    # 阶段是项目阶段（ProjectStage），父子皆可
    stage_detail = ProjectStageLiteSerializer(source="stage", read_only=True)
    # 评审活动的面包屑要带一级「所属评审」，只要标题，不展开整个父对象
    parent_title = serializers.CharField(
        source="parent.title", read_only=True, allow_null=True, default=None
    )
    finished_goods = StageReviewFinishedGoodSerializer(many=True, read_only=True)
    component_versions = StageReviewComponentVersionSerializer(
        many=True, read_only=True
    )
    # 挂在这条评审下的评审活动；评审活动自己没有下一层，恒为空。顺序由 view 的 prefetch 定
    children = StageReviewChildSerializer(many=True, read_only=True)

    class Meta(StageReviewListSerializer.Meta):
        fields = StageReviewListSerializer.Meta.fields + [
            "stage_detail",
            "parent_title",
            "description_html",
            "work_instruction",
            "conditional_reason",
            "initiator_role",
            "leader_role",
            "auditor_role",
            "production_mode",
            "shipment_assessment",
            "finished_goods",
            "component_versions",
            "children",
            "created_by",
        ]
        read_only_fields = fields


class StageReviewActivitySerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(source="actor", read_only=True)

    class Meta:
        model = StageReviewActivity
        fields = [
            "id",
            "stage_review",
            "actor",
            "actor_detail",
            "verb",
            "field",
            "old_value",
            "new_value",
            "comment",
            "stage_review_comment",
            "old_identifier",
            "new_identifier",
            "epoch",
            "extra",
            "created_at",
        ]
        read_only_fields = fields


class StageReviewCommentSerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(source="actor", read_only=True)

    class Meta:
        model = StageReviewComment
        fields = [
            "id",
            "workspace",
            "project",
            "stage_review",
            "actor",
            "actor_detail",
            "comment_stripped",
            "comment_json",
            "comment_html",
            "parent",
            "edited_at",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "workspace",
            "project",
            "stage_review",
            "actor",
            "comment_stripped",
            "edited_at",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


# --- 输入 -----------------------------------------------------------------


def _member_ids_field(source, queryset=None):
    """负责人 / 审核者名单的输入：一组用户 id，整份替换。

    默认不筛 ``is_active``：名单整份回传，里面已有的人后来被停用时不该让整次保存失败。
    """
    return serializers.PrimaryKeyRelatedField(
        source=source,
        many=True,
        required=False,
        queryset=User.objects.all() if queryset is None else queryset,
    )


def _unique_members(users):
    return list({user.id: user for user in users}.values())


class StageReviewCreateSerializer(serializers.Serializer):
    """手工新建。``template`` 恒为空，由 utils 负责，这里只校验形状。"""

    product_id = serializers.UUIDField()
    stage_id = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=StageReviewKind.choices)
    parent_id = serializers.UUIDField(required=False, allow_null=True)
    title = serializers.CharField(max_length=255)
    description_html = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default=""
    )
    work_instruction = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default=""
    )
    leader_ids = _member_ids_field("leaders")
    auditor_ids = _member_ids_field("auditors")
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)

    def validate_leader_ids(self, users):
        return _unique_members(users)

    def validate_auditor_ids(self, users):
        return _unique_members(users)


class StageReviewUpdateSerializer(serializers.ModelSerializer):
    """详情页里能改的字段。

    **``status`` 与 ``result`` 不在其中** —— 状态只能由动作按顺序推进，结论只能在
    「提交审核」那一刻写入，开个 PATCH 口子等于把状态机架空。

    ``stage_id`` 只给手工评审挪阶段用（视图解析成模式阶段后交给 ``update_review``）。

    ``leader_ids`` / ``auditor_ids`` 是整份名单，传空数组表示清空。这里**不校验项目成员**：
    候选人按产品角色 → 工作区角色 → 项目成员三级回退，前两档的人不一定在项目里。

    ``production_mode`` / ``shipment_assessment`` 只有 O 阶段的两种类型能填，类型不符由模型
    ``clean()`` 挡下。两者是提交审核的必填项，所以**不收空串**：能改成别的值，不能清空。
    """

    stage_id = serializers.UUIDField(required=False, write_only=True)
    leader_ids = _member_ids_field("leaders")
    auditor_ids = _member_ids_field("auditors")
    production_mode = serializers.ChoiceField(choices=ProductionMode.choices, required=False)
    shipment_assessment = serializers.ChoiceField(
        choices=ShipmentAssessment.choices, required=False
    )

    class Meta:
        model = StageReview
        fields = [
            "stage_id",
            "title",
            "description_html",
            "work_instruction",
            "leader_ids",
            "auditor_ids",
            "start_date",
            "end_date",
            "production_mode",
            "shipment_assessment",
        ]

    def validate_leader_ids(self, users):
        return _unique_members(users)

    def validate_auditor_ids(self, users):
        return _unique_members(users)


#: 批量改属性一次最多改多少条。列表一次取全，一个项目一两百条，留足余量
STAGE_REVIEW_BULK_LIMIT = 500

#: 批量能改的属性。只放「一批评审能共用同一个值」的字段 —— 标题、描述、O 阶段的成品表
#: 各条不同，状态与结论只能由本人推进（见 ``StageReviewUpdateSerializer``）。
#: 生产方式 / 出货评估只落到其中 O 阶段的那几条（见 ``bulk_update_reviews``）。
#: 这里是校验后的键（source 名），不是请求里的字段名
STAGE_REVIEW_BULK_FIELDS = (
    "leaders",
    "auditors",
    "start_date",
    "end_date",
    "production_mode",
    "shipment_assessment",
)


class StageReviewBulkUpdateSerializer(serializers.Serializer):
    """列表勾选后批量改属性。

    属性字段「出现即修改」，不出现就保持不变；``leader_ids`` / ``auditor_ids`` 是整份名单
    （替换而不是追加），传空数组表示清空。
    负责人 / 审核者必须是本项目的活跃成员（``context["project_id"]``）—— 单条抽屉里按产品
    角色筛候选，但一批评审的角色名各不相同，批量只能退到项目成员这一层。
    """

    review_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False,
        max_length=STAGE_REVIEW_BULK_LIMIT,
    )
    leader_ids = _member_ids_field("leaders", User.objects.filter(is_active=True))
    auditor_ids = _member_ids_field("auditors", User.objects.filter(is_active=True))
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)
    # 必填项不收空串，同单条修改
    production_mode = serializers.ChoiceField(choices=ProductionMode.choices, required=False)
    shipment_assessment = serializers.ChoiceField(
        choices=ShipmentAssessment.choices, required=False
    )

    def _validate_members(self, users):
        users = _unique_members(users)
        if not users:
            return users
        member_ids = set(
            ProjectMember.objects.filter(
                project_id=self.context.get("project_id"),
                member_id__in=[user.id for user in users],
                is_active=True,
            ).values_list("member_id", flat=True)
        )
        outsiders = [user.display_name for user in users if user.id not in member_ids]
        if outsiders:
            raise serializers.ValidationError(
                f"{'、'.join(outsiders)} 不在本项目中"
            )
        return users

    def validate_leader_ids(self, value):
        return self._validate_members(value)

    def validate_auditor_ids(self, value):
        return self._validate_members(value)

    def validate(self, attrs):
        if not any(field in attrs for field in STAGE_REVIEW_BULK_FIELDS):
            raise serializers.ValidationError("没有要修改的属性")
        start, end = attrs.get("start_date"), attrs.get("end_date")
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "结束日期不能早于开始日期"})
        return attrs


class StageReviewRollbackSerializer(serializers.Serializer):
    """退回上一步时的理由。非空判断同样下沉到 utils，这里只管类型。"""

    reason = serializers.CharField(allow_blank=True, default="")


class StageReviewApproveSerializer(serializers.Serializer):
    """审核通过时的审核意见，选填。只进轨迹的 extra，不落评审字段。"""

    approval_comment = serializers.CharField(
        required=False, allow_blank=True, default=""
    )


class StageReviewSubmitSerializer(serializers.Serializer):
    """提交审核时的结论。说明必填与否按结论判，规则在 utils 里。"""

    result = serializers.ChoiceField(choices=StageReviewResult.choices)
    conditional_reason = serializers.CharField(
        required=False, allow_blank=True, default=""
    )
