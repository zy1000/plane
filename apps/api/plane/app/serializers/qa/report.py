from django.db.models import Count
from rest_framework import serializers
from rest_framework.serializers import ModelSerializer

from plane.app.serializers import UserLiteSerializer
from plane.db.models import TestReport, TestPlan, PlanCase, ReportModule


class ReportModuleCreateUpdateSerializer(ModelSerializer):
    """报告模块创建 / 改名 / 换父：project 由视图按 URL 注入，parent 必须同项目且不能是自己或后代。"""

    class Meta:
        model = ReportModule
        fields = ["id", "name", "project", "parent"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # 归属项目创建后不可改：改名 / 换父时带上别的 project 会把模块挪到没权限的项目下
        if self.instance is not None:
            self.fields["project"].read_only = True

    def validate_parent(self, parent):
        if parent is None:
            return parent
        project_id = self.initial_data.get("project") or (
            self.instance.project_id if self.instance else None
        )
        if project_id and str(parent.project_id) != str(project_id):
            raise serializers.ValidationError("父模块不属于当前项目")
        if self.instance is not None:
            node = parent
            while node is not None:
                if node.id == self.instance.id:
                    raise serializers.ValidationError("不能把模块移动到自己或自己的子模块下")
                node = node.parent
        return parent


class ReportModuleListSerializer(ModelSerializer):
    """报告模块树节点：count / children 优先读视图预聚合的 context，避免 N+1。"""

    count = serializers.SerializerMethodField()
    children = serializers.SerializerMethodField()

    def get_count(self, obj: ReportModule):
        count_map = self.context.get("count_map")
        if count_map is not None:
            return count_map.get(obj.id, 0)
        return obj.reports.filter(deleted_at__isnull=True).count()

    def get_children(self, obj: ReportModule):
        children_map = self.context.get("children_map")
        if children_map is not None:
            qs = children_map.get(obj.id, [])
            return ReportModuleListSerializer(qs, many=True, context=self.context).data
        qs = obj.children.filter(deleted_at__isnull=True).order_by("created_at")
        return ReportModuleListSerializer(qs, many=True).data

    class Meta:
        model = ReportModule
        fields = "__all__"


class TestReportPlanBriefSerializer(ModelSerializer):
    class Meta:
        model = TestPlan
        fields = ["id", "name", "threshold"]


class TestReportCreateUpdateSerializer(ModelSerializer):
    """测试报告创建/更新：关联计划至少 1 个；所属模块可选，限本项目。"""

    plans = serializers.PrimaryKeyRelatedField(
        queryset=TestPlan.objects.none(), many=True, required=False
    )
    module = serializers.PrimaryKeyRelatedField(
        queryset=ReportModule.objects.none(), required=False, allow_null=True
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        project_id = self.context.get("project_id")
        workspace_slug = self.context.get("workspace_slug")
        plan_queryset = TestPlan.objects.filter(deleted_at__isnull=True)
        module_queryset = ReportModule.objects.filter(deleted_at__isnull=True)
        if project_id:
            plan_queryset = plan_queryset.filter(project_id=project_id)
            module_queryset = module_queryset.filter(project_id=project_id)
        if workspace_slug:
            plan_queryset = plan_queryset.filter(project__workspace__slug=workspace_slug)
            module_queryset = module_queryset.filter(project__workspace__slug=workspace_slug)
        self.fields["plans"].queryset = plan_queryset
        if hasattr(self.fields["plans"], "child_relation"):
            self.fields["plans"].child_relation.queryset = plan_queryset
        self.fields["module"].queryset = module_queryset

    class Meta:
        model = TestReport
        fields = ["name", "report_type", "summary_html", "summary_json", "project", "plans", "module"]

    def validate_plans(self, plans):
        if not plans or len(plans) < 1:
            raise serializers.ValidationError("请至少选择一个测试计划")
        return plans

    def validate(self, attrs):
        if self.instance is None and "plans" not in attrs:
            raise serializers.ValidationError({"plans": "请至少选择一个测试计划"})
        return attrs


def build_report_stats_map(report_ids):
    """一次聚合拿到列表页所有报告的用例统计，避免 N+1。

    返回 {report_id: {plan_count, case_count, success_count, pass_rate{各状态计数}}}
    """
    empty_pass_rate = {label: 0 for label in PlanCase.Result.values}
    stats = {
        rid: {
            "plan_count": 0,
            "case_count": 0,
            "success_count": 0,
            "pass_rate": dict(empty_pass_rate),
        }
        for rid in report_ids
    }
    if not report_ids:
        return stats

    # 关联计划数
    plan_rows = (
        TestReport.plans.through.objects.filter(
            testreport_id__in=report_ids,
            testplan__deleted_at__isnull=True,
        )
        .values("testreport_id")
        .annotate(cnt=Count("id"))
    )
    for row in plan_rows:
        stats[row["testreport_id"]]["plan_count"] = row["cnt"]

    # 各报告关联计划下的 PlanCase 状态计数
    plan_ids = set(
        TestReport.plans.through.objects.filter(
            testreport_id__in=report_ids,
            testplan__deleted_at__isnull=True,
        )
        .values_list("testplan_id", flat=True)
    )
    report_of_plan = {}
    for row in TestReport.plans.through.objects.filter(
        testreport_id__in=report_ids,
        testplan__deleted_at__isnull=True,
    ).values("testreport_id", "testplan_id"):
        report_of_plan.setdefault(row["testplan_id"], set()).add(row["testreport_id"])

    pc_rows = (
        PlanCase.objects.filter(
            plan_id__in=plan_ids,
            deleted_at__isnull=True,
            plan__deleted_at__isnull=True,
        )
        .values("plan_id", "result")
        .annotate(count=Count("id"))
    )
    for row in pc_rows:
        for rid in report_of_plan.get(row["plan_id"], set()):
            entry = stats[rid]
            entry["case_count"] += row["count"]
            if row["result"] in entry["pass_rate"]:
                entry["pass_rate"][row["result"]] += row["count"]
            if row["result"] == PlanCase.Result.SUCCESS:
                entry["success_count"] += row["count"]
    return stats


class TestReportListSerializer(ModelSerializer):
    """测试报告列表：依赖 context['report_stats'] 注入批量聚合。"""

    plan_names = serializers.SerializerMethodField()
    pass_rate = serializers.SerializerMethodField()
    module_name = serializers.SerializerMethodField()
    created_by_detail = UserLiteSerializer(read_only=True, source="created_by")

    def get_module_name(self, obj: TestReport):
        return obj.module.name if obj.module_id and obj.module else None

    def _stats(self, obj: TestReport):
        report_stats = self.context.get("report_stats") or {}
        return report_stats.get(obj.id) or {
            "plan_count": 0,
            "case_count": 0,
            "success_count": 0,
            "pass_rate": {label: 0 for label in PlanCase.Result.values},
        }

    def get_plan_names(self, obj: TestReport):
        return list(obj.plans.filter(deleted_at__isnull=True).values_list("name", flat=True))

    def get_pass_rate(self, obj: TestReport):
        return dict(self._stats(obj)["pass_rate"])

    def to_representation(self, instance):
        data = super().to_representation(instance)
        s = self._stats(instance)
        total = s["case_count"]
        success = s["success_count"]
        data["case_count"] = total
        data["plan_count"] = s["plan_count"]
        data["overall_pass_rate"] = round((success / total) * 100, 2) if total else 0.0
        data["completion_rate"] = round(((total - s["pass_rate"].get(PlanCase.Result.NOT_START, 0)) / total) * 100, 2) if total else 0.0
        return data

    class Meta:
        model = TestReport
        fields = [
            "id",
            "name",
            "report_type",
            "project",
            "module",
            "module_name",
            "plan_names",
            "pass_rate",
            "created_by_detail",
            "created_by",
            "created_at",
            "updated_at",
        ]


class TestReportDetailSerializer(ModelSerializer):
    """测试报告详情：含关联计划列表与富文本总结。"""

    plans = TestReportPlanBriefSerializer(many=True, read_only=True)
    module_name = serializers.SerializerMethodField()
    created_by_detail = UserLiteSerializer(read_only=True, source="created_by")

    def get_module_name(self, obj: TestReport):
        return obj.module.name if obj.module_id and obj.module else None

    class Meta:
        model = TestReport
        fields = [
            "id",
            "name",
            "report_type",
            "summary_html",
            "summary_json",
            "project",
            "module",
            "module_name",
            "plans",
            "created_by_detail",
            "created_by",
            "created_at",
            "updated_at",
        ]
