"""阶段评审实例的接口契约。

三层输出：列表行（一个阶段的全部评审，扁平返回、由前端按产品分组并把评审活动缩进到
所属评审下）、详情（带描述、工作指引、O 阶段分组、附件与评论计数），以及活动与评论。
输入按动作拆成几个小序列化器，形状校验留在这里，跨表规则（父评审是否同产品、结论是否
齐备）在 ``utils/stage_review.py``。

**评审与评审活动共用同一套序列化器** —— 两者字段几乎一样，只有层级不同（产品决策）。
前端也共用同一个抽屉，所以这里刻意不按 kind 分叉。
"""

from rest_framework import serializers

from plane.app.serializers.data_dictionary import DataDictionaryItemLiteSerializer
from plane.app.serializers.user import UserLiteSerializer
from plane.db.models import (
    ProjectMember,
    StageReview,
    StageReviewActivity,
    StageReviewComment,
    StageReviewKind,
    StageReviewResult,
    User,
)
from plane.db.models.stage_review import (
    COMPONENT_VERSION_FIELDS,
    FINISHED_GOODS_FIELDS,
    ProductionMode,
    ShipmentAssessment,
)

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
    leader_detail = UserLiteSerializer(source="leader", read_only=True)
    auditor_detail = UserLiteSerializer(source="auditor", read_only=True)
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
            "leader_id",
            "leader_detail",
            "auditor_id",
            "auditor_detail",
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


class StageReviewDetailSerializer(StageReviewListSerializer):
    """抽屉里要的全部字段。

    成品与组件版本按分组吐 json（模型上的两个 property），只有「O阶段评审」有值；
    生产方式与出货评估两种 O 阶段类型都有。前端按 ``kind`` 决定渲不渲这两块。
    """

    stage_detail = DataDictionaryItemLiteSerializer(source="stage", read_only=True)
    # 评审活动的面包屑要带一级「所属评审」，只要标题，不展开整个父对象
    parent_title = serializers.CharField(
        source="parent.title", read_only=True, allow_null=True, default=None
    )
    finished_goods = serializers.DictField(read_only=True)
    component_versions = serializers.DictField(read_only=True)

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
    leader_id = serializers.UUIDField(required=False, allow_null=True)
    auditor_id = serializers.UUIDField(required=False, allow_null=True)
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)


class StageReviewUpdateSerializer(serializers.ModelSerializer):
    """详情页里能改的字段。

    **``status`` 与 ``result`` 不在其中** —— 状态只能由动作按顺序推进，结论只能在
    「提交审核」那一刻写入，开个 PATCH 口子等于把状态机架空。
    """

    class Meta:
        model = StageReview
        fields = [
            "title",
            "description_html",
            "work_instruction",
            "leader",
            "auditor",
            "start_date",
            "end_date",
            *FINISHED_GOODS_FIELDS,
            *COMPONENT_VERSION_FIELDS,
        ]


#: 批量改属性一次最多改多少条。列表一次取全，一个项目一两百条，留足余量
STAGE_REVIEW_BULK_LIMIT = 500

#: 批量能改的属性。只放「一批评审能共用同一个值」的字段 —— 标题、描述、O 阶段成品信息
#: 各条不同，状态与结论只能由本人推进（见 ``StageReviewUpdateSerializer``）
STAGE_REVIEW_BULK_FIELDS = ("leader", "auditor", "start_date", "end_date")


class StageReviewBulkUpdateSerializer(serializers.Serializer):
    """列表勾选后批量改属性。

    属性字段「出现即修改」，不出现就保持不变；``leader`` / ``auditor`` 传 null 表示清空。
    负责人 / 审核者必须是本项目的活跃成员（``context["project_id"]``）—— 单条抽屉里按产品
    角色筛候选，但一批评审的角色名各不相同，批量只能退到项目成员这一层。
    """

    review_ids = serializers.ListField(
        child=serializers.UUIDField(),
        allow_empty=False,
        max_length=STAGE_REVIEW_BULK_LIMIT,
    )
    leader = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True), required=False, allow_null=True
    )
    auditor = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True), required=False, allow_null=True
    )
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)

    def _validate_member(self, user):
        if user is None:
            return user
        if not ProjectMember.objects.filter(
            project_id=self.context.get("project_id"),
            member_id=user.id,
            is_active=True,
        ).exists():
            raise serializers.ValidationError("该成员不在本项目中")
        return user

    def validate_leader(self, value):
        return self._validate_member(value)

    def validate_auditor(self, value):
        return self._validate_member(value)

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
    """提交审核时的结论。必填与否按 kind 判，规则在 utils 里。"""

    result = serializers.ChoiceField(choices=StageReviewResult.choices)
    conditional_reason = serializers.CharField(
        required=False, allow_blank=True, default=""
    )
    production_mode = serializers.ChoiceField(
        choices=ProductionMode.choices, required=False, allow_blank=True, default=""
    )
    shipment_assessment = serializers.ChoiceField(
        choices=ShipmentAssessment.choices,
        required=False,
        allow_blank=True,
        default="",
    )
