from rest_framework import serializers

from plane.app.serializers.data_dictionary import DataDictionaryItemLiteSerializer
from plane.db.models import DataDictionaryItem, StageReviewTemplate
from plane.db.models.stage_review import (
    ACTIVITY_KIND_BY_ROOT,
    ACTIVITY_KINDS,
    O_STAGE_KINDS,
    ROOT_KINDS,
    StageReviewKind,
    is_o_stage_label,
)

from .base import BaseSerializer


class StageReviewTemplateSerializer(BaseSerializer):
    """评审模板节点。

    树最多两层：评审恒在顶层；评审活动可以挂在同族的评审下，也可以直接挂在阶段下
    （有些阶段没有汇总评审）。层级与同族规则由模型的 ``clean()`` + CheckConstraint
    兜底，这里只做「让客户端拿到可读错误」的前置校验。
    """

    workspace_id = serializers.UUIDField(read_only=True)
    stage_id = serializers.PrimaryKeyRelatedField(
        source="stage",
        queryset=DataDictionaryItem.objects.all(),
    )
    # 复用产品 / 项目那套 *_detail 形状，前端可以直接喂给 DictionaryValueTag。
    # queryset 需 select_related("stage__dictionary")，否则每行多一条查询。
    stage_detail = DataDictionaryItemLiteSerializer(source="stage", read_only=True)
    parent_id = serializers.PrimaryKeyRelatedField(
        source="parent",
        queryset=StageReviewTemplate.objects.all(),
        required=False,
        allow_null=True,
    )
    child_count = serializers.SerializerMethodField()

    class Meta:
        model = StageReviewTemplate
        fields = [
            "id",
            "workspace_id",
            "stage_id",
            "stage_detail",
            "parent_id",
            "kind",
            "title",
            "description_html",
            # 三个角色存的都是**角色名称文本**而不是人：模板是工作区级标准流程，
            # 落到具体项目 + 产品时才解析成人。审核者留空 = 无需审核。
            "initiator_role",
            "leader_role",
            "auditor_role",
            "is_active",
            "sort_order",
            "child_count",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]
        read_only_fields = [
            "id",
            "workspace_id",
            "stage_detail",
            "child_count",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]

    def get_child_count(self, obj):
        # 列表接口在 queryset 上 annotate；单条读取时回落到反查
        annotated = getattr(obj, "children_count", None)
        if annotated is not None:
            return annotated
        return obj.children.count()

    def validate(self, attrs):
        instance = self.instance
        kind = attrs.get("kind", getattr(instance, "kind", None))
        parent = attrs.get("parent", getattr(instance, "parent", None))
        stage = attrs.get("stage", getattr(instance, "stage", None))

        if kind in ROOT_KINDS and parent is not None:
            raise serializers.ValidationError({"parent_id": "评审不能挂在别的评审下。"})

        if parent is not None:
            if kind not in ACTIVITY_KINDS:
                raise serializers.ValidationError({"kind": "挂在评审下的只能是评审活动。"})
            if parent.kind not in ROOT_KINDS:
                raise serializers.ValidationError(
                    {"parent_id": "评审活动只能挂在评审下，不能再往下嵌套。"}
                )
            expected = ACTIVITY_KIND_BY_ROOT[parent.kind]
            if kind != expected:
                raise serializers.ValidationError(
                    {
                        "kind": f"「{StageReviewKind(parent.kind).label}」下只能挂"
                        f"「{StageReviewKind(expected).label}」。"
                    }
                )
            # 阶段跟随父节点（模型 save() 也会传播，这里提前对齐，免得响应里出现
            # 客户端传的那个阶段）
            attrs["stage"] = parent.stage
        elif stage is None:
            raise serializers.ValidationError({"stage_id": "请选择阶段。"})

        # O 阶段类型只能落在 O 系列阶段上。stage 可能刚被上面按父节点改写过，所以放最后判。
        stage = attrs.get("stage", stage)
        if kind in O_STAGE_KINDS and stage is not None and not is_o_stage_label(stage.label):
            raise serializers.ValidationError(
                {
                    "kind": f"「{StageReviewKind(kind).label}」只能用在 O 系列阶段上，"
                    f"「{stage.label}」不是。"
                }
            )

        return attrs
