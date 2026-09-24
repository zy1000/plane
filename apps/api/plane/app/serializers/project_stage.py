"""项目阶段的序列化器。

字段级校验在这里（同工作区、项目成员、范围），跨字段的树规则（父子日期、叶子占比、
父占比下移）在 ``utils/project_stage.py`` —— 那些需要整棵树。
"""

from rest_framework import serializers

from plane.app.serializers.stage_type import StageTypeLiteSerializer
from plane.app.serializers.user import UserLiteSerializer
from plane.db.models import ProjectMember, ProjectStage, ProjectStageStatus, StageType, User

from .base import BaseSerializer

#: 批量改属性一次最多改多少条
PROJECT_STAGE_BULK_LIMIT = 500
PROJECT_STAGE_BULK_FIELDS = ("owner", "start_date", "end_date")


class ProjectStageLiteSerializer(BaseSerializer):
    """挂在评审实例上的只读阶段信息（``StageReview.stage_detail``）。

    ``label`` 是 ``name`` 的别名：这个字段最早指向字典值，前端读的是 ``label``，两个名字都给。
    """

    code = serializers.CharField(source="stage_type.code", read_only=True)
    label = serializers.CharField(source="name", read_only=True)
    parent_id = serializers.UUIDField(read_only=True, allow_null=True)
    stage_type_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = ProjectStage
        fields = ["id", "name", "label", "code", "sort_order", "parent_id", "stage_type_id"]
        read_only_fields = fields


class ProjectStageSerializer(BaseSerializer):
    """列表 / 详情 / 创建 / 编辑共用一份。

    - ``parent_id`` 只在创建时可写（更新时传了不同的值会被拒）。
    - ``stage_type_id`` 对从模式带出的阶段（``source_stage`` 非空）不可改，第二期评审换挂
      靠它对应模式阶段。
    - ``computed_workload_ratio``：父 = 子之和，叶 = 自身；由视图算好放在 ``context["ratios"]``。
    """

    project_id = serializers.UUIDField(read_only=True)
    stage_type_id = serializers.PrimaryKeyRelatedField(
        source="stage_type", queryset=StageType.objects.all()
    )
    stage_type_detail = StageTypeLiteSerializer(source="stage_type", read_only=True)
    code = serializers.CharField(source="stage_type.code", read_only=True)
    name = serializers.CharField(max_length=255, required=False)
    parent_id = serializers.PrimaryKeyRelatedField(
        source="parent", queryset=ProjectStage.objects.all(), required=False, allow_null=True
    )
    owner_id = serializers.PrimaryKeyRelatedField(
        source="owner",
        queryset=User.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    owner_detail = UserLiteSerializer(source="owner", read_only=True)
    workload_ratio = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True
    )
    computed_workload_ratio = serializers.SerializerMethodField()
    status = serializers.ChoiceField(choices=ProjectStageStatus.choices, required=False)
    source_stage_id = serializers.UUIDField(read_only=True)
    is_delayed = serializers.BooleanField(read_only=True)
    children_count = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()

    class Meta:
        model = ProjectStage
        fields = [
            "id",
            "project_id",
            "stage_type_id",
            "stage_type_detail",
            "code",
            "name",
            "description",
            "is_milestone",
            "parent_id",
            "owner_id",
            "owner_detail",
            "workload_ratio",
            "computed_workload_ratio",
            "start_date",
            "end_date",
            "actual_start",
            "actual_end",
            "status",
            "is_delayed",
            "sort_order",
            "source_stage_id",
            "children_count",
            "review_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "project_id",
            "stage_type_detail",
            "code",
            "computed_workload_ratio",
            "is_delayed",
            "sort_order",
            "source_stage_id",
            "children_count",
            "review_count",
            "created_at",
            "updated_at",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        project_id = self.context.get("project_id")
        if project_id is not None and "parent_id" in self.fields:
            self.fields["parent_id"].queryset = ProjectStage.objects.filter(project_id=project_id)

    def _project(self):
        project = self.context.get("project")
        if project is None:
            raise serializers.ValidationError("Project is required.")
        return project

    def get_computed_workload_ratio(self, obj):
        ratios = self.context.get("ratios")
        if ratios is not None and obj.id in ratios:
            value = ratios[obj.id]
        else:
            value = obj.workload_ratio
        return str(value) if value is not None else None

    def get_review_count(self, obj):
        annotated = getattr(obj, "review_count", None)
        if annotated is not None:
            return annotated
        return obj.stage_reviews.count()

    def get_children_count(self, obj):
        annotated = getattr(obj, "children_count", None)
        if annotated is not None:
            return annotated
        return obj.children.count()

    def validate_stage_type_id(self, value):
        if value.workspace_id != self._project().workspace_id:
            raise serializers.ValidationError("PROJECT_STAGE_TYPE_WORKSPACE_MISMATCH")
        instance = self.instance
        if (
            instance is not None
            and instance.source_stage_id is not None
            and value.id != instance.stage_type_id
        ):
            raise serializers.ValidationError("PROJECT_STAGE_TYPE_LOCKED")
        return value

    def validate_parent_id(self, value):
        if value is None:
            return value
        instance = self.instance
        if instance is not None:
            if value.id != instance.parent_id:
                raise serializers.ValidationError("PROJECT_STAGE_PARENT_IMMUTABLE")
            return value
        if value.project_id != self._project().id:
            raise serializers.ValidationError("PROJECT_STAGE_PARENT_PROJECT_MISMATCH")
        return value

    def validate_owner_id(self, value):
        if value is None:
            return value
        if not ProjectMember.objects.filter(
            project_id=self._project().id, member_id=value.id, is_active=True
        ).exists():
            raise serializers.ValidationError("PROJECT_STAGE_OWNER_NOT_MEMBER")
        return value

    def validate_workload_ratio(self, value):
        if value is not None and (value < 0 or value > 100):
            raise serializers.ValidationError("PROJECT_STAGE_RATIO_OUT_OF_RANGE")
        return value

    def validate(self, attrs):
        instance = self.instance
        if instance is not None and "parent" in attrs and attrs["parent"] is None and instance.parent_id:
            raise serializers.ValidationError({"parent_id": "PROJECT_STAGE_PARENT_IMMUTABLE"})
        # 名称：创建时没给就取阶段类型名（「默认等于类型名，可改」）
        name = attrs.get("name")
        if name is not None:
            name = name.strip()
        if instance is None:
            if not name:
                stage_type = attrs.get("stage_type")
                name = stage_type.name if stage_type is not None else ""
            if not name:
                raise serializers.ValidationError({"name": "PROJECT_STAGE_NAME_REQUIRED"})
            attrs["name"] = name
        elif "name" in attrs:
            if not name:
                raise serializers.ValidationError({"name": "PROJECT_STAGE_NAME_REQUIRED"})
            attrs["name"] = name
        return attrs


class ProjectStageBulkUpdateSerializer(serializers.Serializer):
    """列表勾选后批量改属性。字段「出现即修改」，``owner`` 传 null 表示清空。"""

    stage_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False, max_length=PROJECT_STAGE_BULK_LIMIT
    )
    owner = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.filter(is_active=True), required=False, allow_null=True
    )
    start_date = serializers.DateField(required=False, allow_null=True)
    end_date = serializers.DateField(required=False, allow_null=True)

    def validate_owner(self, value):
        if value is None:
            return value
        if not ProjectMember.objects.filter(
            project_id=self.context.get("project_id"), member_id=value.id, is_active=True
        ).exists():
            raise serializers.ValidationError("该成员不在本项目中")
        return value

    def validate(self, attrs):
        if not any(field in attrs for field in PROJECT_STAGE_BULK_FIELDS):
            raise serializers.ValidationError("没有要修改的属性")
        start, end = attrs.get("start_date"), attrs.get("end_date")
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "结束日期不能早于开始日期"})
        return attrs
