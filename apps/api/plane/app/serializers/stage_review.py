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
    StageReview,
    StageReviewActivity,
    StageReviewComment,
    StageReviewKind,
    StageReviewResult,
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


class StageReviewListSerializer(BaseSerializer):
    """列表行。附件数由 view 的 queryset annotate 出来，不在这里反查。

    ``is_manual`` 就是「模板为空」—— 手工新建的评审不进裁剪表，列表要能一眼认出来。
    """

    product_id = serializers.UUIDField(read_only=True)
    product_detail = StageReviewProductSerializer(source="product", read_only=True)
    stage_id = serializers.UUIDField(read_only=True)
    parent_id = serializers.UUIDField(read_only=True)
    template_id = serializers.UUIDField(read_only=True)
    leader_detail = UserLiteSerializer(source="leader", read_only=True)
    auditor_detail = UserLiteSerializer(source="auditor", read_only=True)
    attachment_count = serializers.IntegerField(read_only=True, default=0)
    is_manual = serializers.SerializerMethodField()

    class Meta:
        model = StageReview
        fields = [
            "id",
            "project_id",
            "workspace_id",
            "product_id",
            "product_detail",
            "stage_id",
            "parent_id",
            "template_id",
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
            "is_manual",
            "sort_order",
            "created_at",
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
    finished_goods = serializers.DictField(read_only=True)
    component_versions = serializers.DictField(read_only=True)
    comment_count = serializers.IntegerField(read_only=True, default=0)

    class Meta(StageReviewListSerializer.Meta):
        fields = StageReviewListSerializer.Meta.fields + [
            "stage_detail",
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
            "comment_count",
            "created_by",
            "updated_at",
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
