from rest_framework import serializers

from plane.db.models import StageType

from .base import BaseSerializer


class StageTypeLiteSerializer(BaseSerializer):
    """挂在评审模板等消费方上的精简形状：只要够画一个阶段标签。"""

    class Meta:
        model = StageType
        fields = ["id", "code", "name"]
        read_only_fields = fields


class StageTypeSerializer(BaseSerializer):
    code = serializers.CharField(max_length=64)
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True)
    sort_order = serializers.FloatField(required=False)

    class Meta:
        model = StageType
        fields = [
            "id",
            "workspace",
            "code",
            "name",
            "description",
            "is_system",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "workspace",
            "is_system",
            "created_at",
            "updated_at",
        ]

    def _workspace(self):
        workspace = self.context.get("workspace")
        if workspace is None:
            raise serializers.ValidationError("Workspace is required.")
        return workspace

    def validate_code(self, value):
        code = value.strip()
        if not code:
            raise serializers.ValidationError("STAGE_TYPE_CODE_REQUIRED")
        # 预置类型的编码是评审模板树的锚（迁移回填、种子都按它对齐），改了会让标准流程对不上
        if self.instance is not None and self.instance.is_system and code != self.instance.code:
            raise serializers.ValidationError("STAGE_TYPE_SYSTEM_CODE_READONLY")
        queryset = StageType.objects.filter(workspace=self._workspace(), code=code)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("STAGE_TYPE_CODE_ALREADY_EXISTS")
        return code

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("STAGE_TYPE_NAME_REQUIRED")
        if self.instance is not None and self.instance.is_system and name != self.instance.name:
            raise serializers.ValidationError("STAGE_TYPE_SYSTEM_NAME_READONLY")
        queryset = StageType.objects.filter(workspace=self._workspace(), name=name)
        if self.instance is not None:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError("STAGE_TYPE_NAME_ALREADY_EXISTS")
        return name
