from decimal import Decimal

from rest_framework import serializers

from plane.app.serializers.stage_type import StageTypeLiteSerializer
from plane.db.models import (
    DevMode,
    DevModeStage,
    Project,
    StageReviewTemplate,
    StageType,
)
from plane.db.models.dev_mode import MAX_WORKLOAD_RATIO_TOTAL
from plane.db.seed_data.dev_modes import normalize_features
from plane.utils.dev_mode import check_workload_ratio

from .base import BaseSerializer


def count_projects_using(dev_mode, include_inactive=False):
    """引用这个模式的项目数。

    默认只算活跃项目（未软删、非模板），这是卡片上「N 个项目在用」要给人看的数。

    ``include_inactive=True`` 用在删除保护上：外键是 RESTRICT，软删的项目和模板项目
    照样在库里占着引用，漏掉它们就会「检查通过 → 真删时 RestrictedError」。
    """
    queryset = Project.all_objects.filter(dev_mode_id=dev_mode.id)
    if not include_inactive:
        queryset = queryset.filter(deleted_at__isnull=True, is_template=False)
    return queryset.count()


class DevModeLiteSerializer(BaseSerializer):
    """挂在项目上的只读模式信息。

    ``features`` 是前端判「这个组件项目能不能开」的唯一依据（项目设置的功能页灰显、
    侧栏 tab 渲染都读它），所以必须带上；阶段与勾选是模板中心的事，这里不带。
    """

    class Meta:
        model = DevMode
        fields = ["id", "name", "icon_props", "features", "is_system"]
        read_only_fields = fields


class DevModeSerializer(BaseSerializer):
    """研发模式列表 / 创建 / 编辑。

    预置模式（``is_system``）的名称锁死 —— 批次 3 的存量项目回填按名字找「混合模式」，
    改名会让回填迁移和后续的默认模式解析全部落空。组件开关、描述、图标都可以改。
    """

    workspace_id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True)
    icon_props = serializers.JSONField(required=False)
    features = serializers.JSONField(required=False)
    stage_count = serializers.SerializerMethodField()
    template_count = serializers.SerializerMethodField()
    project_count = serializers.SerializerMethodField()

    class Meta:
        model = DevMode
        fields = [
            "id",
            "workspace_id",
            "name",
            "description",
            "icon_props",
            "features",
            "is_system",
            "stage_count",
            "template_count",
            "project_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "workspace_id",
            "is_system",
            "stage_count",
            "template_count",
            "project_count",
            "created_at",
            "updated_at",
        ]

    def _workspace(self):
        workspace = self.context.get("workspace")
        if workspace is None:
            raise serializers.ValidationError("Workspace is required.")
        return workspace

    def get_stage_count(self, obj):
        annotated = getattr(obj, "stages_count", None)
        if annotated is not None:
            return annotated
        return obj.stages.count()

    def get_template_count(self, obj):
        annotated = getattr(obj, "templates_count", None)
        if annotated is not None:
            return annotated
        return sum(stage.template_links.count() for stage in obj.stages.all())

    def get_project_count(self, obj):
        return count_projects_using(obj)

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("DEV_MODE_NAME_REQUIRED")
        if (
            self.instance is not None
            and self.instance.is_system
            and name != self.instance.name
        ):
            raise serializers.ValidationError("DEV_MODE_SYSTEM_NAME_READONLY")
        queryset = DevMode.objects.filter(workspace=self._workspace(), name=name)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("DEV_MODE_NAME_ALREADY_EXISTS")
        return name

    def validate_features(self, value):
        if value is not None and not isinstance(value, dict):
            raise serializers.ValidationError("DEV_MODE_FEATURES_INVALID")
        # 九个 key 收敛齐全，缺的补 True（上限语义：没说关就是开）
        return normalize_features(value)

    def validate_icon_props(self, value):
        if value is not None and not isinstance(value, dict):
            raise serializers.ValidationError("DEV_MODE_ICON_PROPS_INVALID")
        return value or {}


class DevModeStageSerializer(BaseSerializer):
    """模式里的一个阶段。

    ``code`` 是只读派生字段（恒等于阶段类型的编码，见模型头注，不落库）。
    """

    dev_mode_id = serializers.UUIDField(read_only=True)
    stage_type_id = serializers.PrimaryKeyRelatedField(
        source="stage_type", queryset=StageType.objects.all()
    )
    stage_type_detail = StageTypeLiteSerializer(source="stage_type", read_only=True)
    code = serializers.CharField(source="stage_type.code", read_only=True)
    name = serializers.CharField(max_length=255, required=False)
    workload_ratio = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, allow_null=True
    )
    standard_days = serializers.IntegerField(required=False, allow_null=True, min_value=0)
    template_count = serializers.SerializerMethodField()

    class Meta:
        model = DevModeStage
        fields = [
            "id",
            "dev_mode_id",
            "stage_type_id",
            "stage_type_detail",
            "code",
            "name",
            "workload_ratio",
            "standard_days",
            "sort_order",
            "template_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "dev_mode_id",
            "stage_type_detail",
            "code",
            "sort_order",
            "template_count",
            "created_at",
            "updated_at",
        ]

    def _dev_mode(self):
        dev_mode = self.context.get("dev_mode")
        if dev_mode is None:
            raise serializers.ValidationError("Dev mode is required.")
        return dev_mode

    def get_template_count(self, obj):
        annotated = getattr(obj, "links_count", None)
        if annotated is not None:
            return annotated
        return obj.template_links.count()

    def validate_stage_type(self, value):
        # 跨工作区引用会让模式里冒出别家的评审树。模型 clean() 也挡，这里提前给可读错误。
        if value.workspace_id != self._dev_mode().workspace_id:
            raise serializers.ValidationError("DEV_MODE_STAGE_TYPE_WORKSPACE_MISMATCH")
        return value

    def validate_workload_ratio(self, value):
        if value is not None and (value < 0 or value > MAX_WORKLOAD_RATIO_TOTAL):
            raise serializers.ValidationError("DEV_MODE_STAGE_RATIO_OUT_OF_RANGE")
        return value

    def validate(self, attrs):
        dev_mode = self._dev_mode()
        instance = self.instance

        # 名称：没给就取阶段类型名（「默认等于类型名，可改」）
        name = attrs.get("name")
        if name is not None:
            name = name.strip()
        if not name:
            if instance is not None:
                name = instance.name
            else:
                stage_type = attrs.get("stage_type")
                name = stage_type.name if stage_type is not None else ""
        if not name:
            raise serializers.ValidationError({"name": "DEV_MODE_STAGE_NAME_REQUIRED"})
        queryset = DevModeStage.objects.filter(dev_mode=dev_mode, name=name)
        if instance is not None:
            queryset = queryset.exclude(pk=instance.pk)
        if queryset.exists():
            raise serializers.ValidationError(
                {"name": "DEV_MODE_STAGE_NAME_ALREADY_EXISTS"}
            )
        attrs["name"] = name

        # 占比：累计不超过 100。编辑时把自己这一行从「已分配」里排除再比。
        if "workload_ratio" in attrs:
            incoming = attrs["workload_ratio"]
            if incoming is not None:
                error = check_workload_ratio(
                    dev_mode.id,
                    Decimal(incoming),
                    exclude_stage_ids=[instance.id] if instance is not None else None,
                )
                if error:
                    raise serializers.ValidationError({"workload_ratio": error})

        return attrs


class DevModeStageTemplateNodeSerializer(BaseSerializer):
    """阶段勾选面板里的一个评审树节点。

    字段照 ``StageReviewTemplateSerializer`` 的读侧子集，另加 ``selected``。不复用那个
    serializer：它带 ``stage_id`` 的可写 PrimaryKeyRelatedField 和 ``child_count``
    反查，勾选面板两样都不需要，而每次打开面板要出几十行。

    ``selected`` 由视图预先算好的 id 集合决定，别在这里逐行查库。
    """

    parent_id = serializers.UUIDField(read_only=True)
    selected = serializers.SerializerMethodField()

    class Meta:
        model = StageReviewTemplate
        fields = [
            "id",
            "parent_id",
            "kind",
            "title",
            "initiator_role",
            "leader_role",
            "auditor_role",
            "is_active",
            "sort_order",
            "selected",
        ]
        read_only_fields = fields

    def get_selected(self, obj):
        return obj.id in self.context.get("selected_ids", set())


class DevModeDetailSerializer(DevModeSerializer):
    """模式详情：带阶段列表。"""

    stages = serializers.SerializerMethodField()

    class Meta(DevModeSerializer.Meta):
        fields = DevModeSerializer.Meta.fields + ["stages"]
        read_only_fields = DevModeSerializer.Meta.read_only_fields + ["stages"]

    def get_stages(self, obj):
        stages = obj.stages.select_related("stage_type").order_by(
            "sort_order", "created_at", "id"
        )
        return DevModeStageSerializer(
            stages, many=True, context={**self.context, "dev_mode": obj}
        ).data
