from rest_framework import serializers
from rest_framework.serializers import ModelSerializer

from plane.db.models import PlanModule, PlanCase, PlanCaseRecord, TestCase


class PlanModuleCreateUpdateSerializer(ModelSerializer):
    class Meta:
        model = PlanModule
        fields = '__all__'


class PlanModuleListSerializer(ModelSerializer):
    count = serializers.SerializerMethodField()
    children = serializers.SerializerMethodField()

    def get_count(self, obj: PlanModule):
        # 列表场景下由视图预先聚合好 count，避免逐节点 COUNT 查询（N+1）
        count_map = self.context.get("count_map")
        if count_map is not None:
            return count_map.get(obj.id, 0)
        return obj.plans.filter(deleted_at__isnull=True).count()

    def get_children(self, obj: PlanModule):
        # 列表场景下由视图预先构建好父子关系，避免逐节点查询子节点（N+1）
        children_map = self.context.get("children_map")
        if children_map is not None:
            qs = children_map.get(obj.id, [])
            return PlanModuleListSerializer(qs, many=True, context=self.context).data
        qs = obj.children.filter(deleted_at__isnull=True).order_by("created_at")
        return PlanModuleListSerializer(qs, many=True).data

    class Meta:
        model = PlanModule
        fields = '__all__'


class PlanCaseListSerializer(ModelSerializer):
    class TestCaseLiteSerializer(ModelSerializer):
        repository = serializers.UUIDField(source="repository_id", read_only=True)
        repository_name = serializers.CharField(source="repository.name", read_only=True)
        module = serializers.CharField(source="module.name", read_only=True)

        class Meta:
            model = TestCase
            fields = ["id", "name", "type", "priority", "updated_at", "repository", 'code', 'repository_name', 'module',
                      'assignee' ]

    plan = serializers.UUIDField(source="plan_id", read_only=True)
    assignee = serializers.UUIDField(source="assignee_id", read_only=True)
    case = TestCaseLiteSerializer(read_only=True)

    class Meta:
        model = PlanCase
        fields = ["id", "plan", "case", "assignee", "result", "created_at", "updated_at"]


class PlanCaseCardSerializer(ModelSerializer):
    name = serializers.SerializerMethodField()
    priority = serializers.SerializerMethodField()

    def get_name(self, obj: PlanCase):
        return obj.case.name

    def get_priority(self, obj: PlanCase):
        return obj.case.priority

    class Meta:
        model = PlanCase
        fields = '__all__'


class PlanCaseRecordSerializer(ModelSerializer):
    file_count = serializers.SerializerMethodField()

    def get_file_count(self, obj: PlanCaseRecord):
        count = getattr(obj, "file_count", None)
        if count is not None:
            return int(count)
        return 0

    class Meta:
        model = PlanCaseRecord
        fields = '__all__'
