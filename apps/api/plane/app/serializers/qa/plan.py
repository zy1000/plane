from rest_framework import serializers
from rest_framework.serializers import ModelSerializer

from plane.db.models import PlanModule, PlanCase, PlanCaseRecord, TestCase


class PlanModuleCreateUpdateSerializer(ModelSerializer):
    class Meta:
        model = PlanModule
        fields = '__all__'


class PlanModuleListSerializer(ModelSerializer):
    count = serializers.SerializerMethodField()

    def get_count(self, obj: PlanModule):
        return obj.plans.filter(deleted_at__isnull=True).count()

    class Meta:
        model = PlanModule
        fields = '__all__'


class PlanCaseListSerializer(ModelSerializer):
    class TestCaseLiteSerializer(ModelSerializer):
        repository = serializers.UUIDField(source="repository_id", read_only=True)

        class Meta:
            model = TestCase
            fields = ["id", "name", "type", "priority", "updated_at", "repository"]

    plan = serializers.UUIDField(source="plan_id", read_only=True)
    case = TestCaseLiteSerializer(read_only=True)

    class Meta:
        model = PlanCase
        fields = ["id", "plan", "case", "result", "created_at", "updated_at"]


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
    class Meta:
        model = PlanCaseRecord
        fields = '__all__'
