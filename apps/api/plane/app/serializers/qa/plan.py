from rest_framework import serializers
from rest_framework.serializers import ModelSerializer

from plane.app.serializers.user import UserLiteSerializer
from plane.db.models import (
    PlanModule,
    PlanCase,
    PlanCaseRecord,
    PlanCaseReviewRecord,
    TestCase,
)


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
    assignee = serializers.UUIDField(source="assignee_id", read_only=True, allow_null=True)
    case = TestCaseLiteSerializer(read_only=True)

    class Meta:
        model = PlanCase
        fields = [
            "id",
            "plan",
            "case",
            "assignee",
            "result",
            "review_status",
            "created_at",
            "updated_at",
        ]


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


class PlanCaseReviewRecordSerializer(ModelSerializer):
    reviewer_detail = UserLiteSerializer(source="reviewer", read_only=True)

    class Meta:
        model = PlanCaseReviewRecord
        fields = [
            "id",
            "plan_case",
            "plan_case_record",
            "result",
            "reason",
            "reviewer",
            "reviewer_detail",
            "invalidated_at",
            "created_at",
        ]


class PlanCaseRecordSerializer(ModelSerializer):
    file_count = serializers.SerializerMethodField()
    # 本次执行对应的复核记录；需要视图侧 prefetch 才不会 N+1
    review_records = PlanCaseReviewRecordSerializer(many=True, read_only=True)

    def get_file_count(self, obj: PlanCaseRecord):
        count = getattr(obj, "file_count", None)
        if count is not None:
            return int(count)
        return 0

    class Meta:
        model = PlanCaseRecord
        fields = '__all__'


class PlanCaseCopySerializer(serializers.Serializer):
    """复制计划用例到另一个测试计划（按 PlanCase.id，而非 case id）"""

    source_plan_id = serializers.UUIDField()
    target_plan_id = serializers.UUIDField()
    plan_case_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False)
    assignee = serializers.UUIDField(
        required=False,
        allow_null=True,
        help_text="缺省沿用源计划用例的执行人；null 清空；传 id 则统一覆盖",
    )

    def validate(self, attrs):
        if attrs["source_plan_id"] == attrs["target_plan_id"]:
            raise serializers.ValidationError("目标计划不能与当前计划相同")
        # 去重并保序，避免同一计划用例被重复提交
        attrs["plan_case_ids"] = list(dict.fromkeys(attrs["plan_case_ids"]))
        return attrs


class PlanCaseReviewSerializer(serializers.Serializer):
    """复核人对一批计划用例的执行结果给出复核结论"""

    plan_id = serializers.UUIDField()
    plan_case_ids = serializers.ListField(
        child=serializers.UUIDField(), allow_empty=False
    )
    result = serializers.ChoiceField(choices=PlanCaseReviewRecord.Result.choices)
    reason = serializers.CharField(required=False, allow_blank=True, allow_null=True)

    def validate(self, attrs):
        if attrs["result"] == PlanCaseReviewRecord.Result.FAIL and not (
            attrs.get("reason") or ""
        ).strip():
            raise serializers.ValidationError("复核不通过时必须填写原因")
        attrs["plan_case_ids"] = list(dict.fromkeys(attrs["plan_case_ids"]))
        return attrs
