"""评审裁剪的接口契约。

三层输出：列表行（不带格子，靠 annotate 出计数）、详情（带产品列、格子、本轮签批）、
以及活动与评论。输入按动作拆成几个小序列化器，形状校验都留在这里，需要查库的规则
（产品是否关联、签批人是否本项目成员）在 ``utils/review_tailoring.py``。
"""

from rest_framework import serializers

from plane.app.serializers.data_dictionary import DataDictionaryItemLiteSerializer
from plane.app.serializers.user import UserLiteSerializer
from plane.db.models import (
    DataDictionaryItem,
    ReviewTailoring,
    ReviewTailoringActivity,
    ReviewTailoringApproval,
    ReviewTailoringApprovalAction,
    ReviewTailoringApprovalType,
    ReviewTailoringComment,
    ReviewTailoringItem,
)

from .base import BaseSerializer


class ReviewTailoringApprovalSerializer(BaseSerializer):
    approver_detail = UserLiteSerializer(source="approver", read_only=True)

    class Meta:
        model = ReviewTailoringApproval
        fields = [
            "id",
            "approver",
            "approver_detail",
            "round",
            "action",
            "comment",
            "acted_at",
            "created_at",
        ]
        read_only_fields = fields


class ReviewTailoringItemSerializer(BaseSerializer):
    """矩阵里的一个格子。

    ``parent_template_id`` 是给前端建树用的（纵轴要把评审活动缩进到它所属的评审下），
    直接从模板节点上取，省得前端再去模板库查一遍。
    """

    product_id = serializers.UUIDField(read_only=True)
    template_id = serializers.UUIDField(read_only=True)
    parent_template_id = serializers.UUIDField(
        source="template.parent_id", read_only=True
    )
    kind = serializers.CharField(source="template.kind", read_only=True)
    template_is_active = serializers.BooleanField(
        source="template.is_active", read_only=True
    )
    template_sort_order = serializers.FloatField(
        source="template.sort_order", read_only=True
    )
    stage_review_id = serializers.UUIDField(read_only=True)
    # 已生成的评审做到哪一步了：修订时「已评审完的不许裁掉」，前端要据此锁住格子
    stage_review_status = serializers.CharField(
        source="stage_review.status", read_only=True, default=None
    )
    created_by_detail = UserLiteSerializer(source="created_by", read_only=True)

    class Meta:
        model = ReviewTailoringItem
        fields = [
            "id",
            "product_id",
            "template_id",
            "parent_template_id",
            "kind",
            "template_is_active",
            "template_sort_order",
            "title",
            "selected",
            "reason",
            "stage_review_id",
            "stage_review_status",
            "created_by_detail",
            "created_at",
        ]
        read_only_fields = fields


class ReviewTailoringProductSerializer(serializers.Serializer):
    """矩阵横轴的一列。手写而不是复用 ProductSerializer：这里只要够画表头的四个字段。"""

    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)
    code = serializers.CharField(read_only=True)
    identifier = serializers.CharField(read_only=True)


class ReviewTailoringListSerializer(BaseSerializer):
    """列表行。计数字段全部由 view 的 queryset annotate 出来，不在这里反查。"""

    stage_id = serializers.UUIDField(read_only=True)
    stage_detail = DataDictionaryItemLiteSerializer(source="stage", read_only=True)
    created_by_detail = UserLiteSerializer(source="created_by", read_only=True)
    submitted_by_detail = UserLiteSerializer(source="submitted_by", read_only=True)
    product_count = serializers.IntegerField(read_only=True, default=0)
    item_count = serializers.IntegerField(read_only=True, default=0)
    selected_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = ReviewTailoring
        fields = [
            "id",
            "project_id",
            "workspace_id",
            "title",
            "stage_id",
            "stage_detail",
            "status",
            "revision",
            "round",
            "approval_type",
            "required_count",
            "product_count",
            "item_count",
            "selected_count",
            "created_by_detail",
            "submitted_by_detail",
            "created_at",
            "updated_at",
            "submitted_at",
            "approved_at",
        ]
        read_only_fields = fields


class ReviewTailoringDetailSerializer(ReviewTailoringListSerializer):
    """详情：列表字段 + 描述 + 横轴产品 + 全部格子 + 本轮签批。

    格子与产品由 view 塞进 context（一次查完再分发），避免序列化器里逐条反查。
    """

    description_html = serializers.CharField(read_only=True)
    items = serializers.SerializerMethodField()
    products = serializers.SerializerMethodField()
    approvals = serializers.SerializerMethodField()

    class Meta(ReviewTailoringListSerializer.Meta):
        fields = ReviewTailoringListSerializer.Meta.fields + [
            "description_html",
            "items",
            "products",
            "approvals",
        ]
        read_only_fields = fields

    def get_items(self, obj):
        return ReviewTailoringItemSerializer(
            self.context.get("items", []), many=True
        ).data

    def get_products(self, obj):
        return ReviewTailoringProductSerializer(
            self.context.get("products", []), many=True
        ).data

    def get_approvals(self, obj):
        return ReviewTailoringApprovalSerializer(
            self.context.get("approvals", []), many=True
        ).data


class ReviewTailoringActivitySerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(source="actor", read_only=True)

    class Meta:
        model = ReviewTailoringActivity
        fields = [
            "id",
            "tailoring",
            "actor",
            "actor_detail",
            "verb",
            "field",
            "old_value",
            "new_value",
            "comment",
            "tailoring_comment",
            "old_identifier",
            "new_identifier",
            "epoch",
            "extra",
            "created_at",
        ]
        read_only_fields = fields


class ReviewTailoringCommentSerializer(BaseSerializer):
    actor_detail = UserLiteSerializer(source="actor", read_only=True)

    class Meta:
        model = ReviewTailoringComment
        fields = [
            "id",
            "workspace",
            "project",
            "tailoring",
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
            "tailoring",
            "actor",
            "comment_stripped",
            "edited_at",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        ]


# --- 输入 -----------------------------------------------------------------


class ReviewTailoringCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255)
    description_html = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default=""
    )
    stage_id = serializers.PrimaryKeyRelatedField(
        queryset=DataDictionaryItem.objects.all()
    )
    product_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False
    )

    def validate_product_ids(self, value):
        return list(dict.fromkeys(value))


class ReviewTailoringHeaderSerializer(serializers.Serializer):
    """改标题 / 描述。两个都可选，但不能一个都不给。"""

    title = serializers.CharField(max_length=255, required=False)
    description_html = serializers.CharField(
        required=False, allow_blank=True, allow_null=True
    )

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError(
                "Provide a title or a description to update."
            )
        return attrs


class ReviewTailoringCellSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    selected = serializers.BooleanField(required=False)
    reason = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default=""
    )

    def validate(self, attrs):
        if "selected" not in attrs and "reason" not in self.initial_data:
            raise serializers.ValidationError(
                "A cell update needs selected or reason."
            )
        return attrs


class ReviewTailoringCellsSerializer(serializers.Serializer):
    cells = ReviewTailoringCellSerializer(many=True, allow_empty=False)


class ReviewTailoringProductsSerializer(serializers.Serializer):
    product_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False
    )

    def validate_product_ids(self, value):
        return list(dict.fromkeys(value))


class ReviewTailoringSubmitSerializer(serializers.Serializer):
    """一次提交的签批人与通过规则。

    与需求变更单那套（``RequirementChangeApprovalSpecSerializer``）同形，但**没有
    none** —— 裁剪表必须有人签批。成员资格在 utils 里查，这里只做形状校验。
    """

    approval_type = serializers.ChoiceField(
        choices=ReviewTailoringApprovalType.choices,
        default=ReviewTailoringApprovalType.ANY,
    )
    required_count = serializers.IntegerField(
        required=False, allow_null=True, default=None, min_value=1
    )
    approver_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False
    )

    def validate_approver_ids(self, value):
        return list(dict.fromkeys(value))

    def validate(self, attrs):
        attrs = super().validate(attrs)
        approval_type = attrs["approval_type"]
        required_count = attrs.get("required_count")
        approver_ids = attrs["approver_ids"]

        if approval_type == ReviewTailoringApprovalType.N_OF_M:
            if required_count is None:
                raise serializers.ValidationError(
                    {"required_count": "This field is required for n_of_m approval."}
                )
            if required_count > len(approver_ids):
                raise serializers.ValidationError(
                    {
                        "required_count": (
                            "The required count cannot exceed the number of approvers."
                        )
                    }
                )
        elif required_count is not None:
            raise serializers.ValidationError(
                {
                    "required_count": (
                        "This field must be null unless approval_type is n_of_m."
                    )
                }
            )
        return attrs


class ReviewTailoringActSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=ReviewTailoringApprovalAction.choices)
    comment = serializers.CharField(
        required=False, allow_blank=True, allow_null=True, default=""
    )
