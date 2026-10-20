# filters.py
from django_filters import rest_framework as filters

from plane.db.models import (
    TestPlan,
    PlanModule,
    PlanCase,
    CaseReview,
    CaseReviewModule,
    TestReport,
    ReportModule,
)
from plane.app.views.qa.utils import build_module_filter_q
from plane.utils.filters.filterset import UUIDInFilter


class TestReportFilter(filters.FilterSet):
    """测试报告列表过滤：module_id 递归包含子模块，口径与模块树计数一致；"none" = 未归类。"""

    module_id = filters.CharFilter(method="filter_module_id")

    def filter_module_id(self, queryset, name, value):
        q = build_module_filter_q(value, model=ReportModule)
        return queryset if q is None else queryset.filter(q)

    class Meta:
        model = TestReport
        fields = {
            "project_id": ["exact", "in"],
            "report_type": ["exact", "in"],
            "name": ["exact", "icontains", "in"],
        }


class TestPlanFilter(filters.FilterSet):
    assignee_display_name = filters.CharFilter(field_name='plan_cases__assignee__display_name', lookup_expr='icontains')
    # 递归包含子模块；"none" = 未归类（module 为空）
    module_id = filters.CharFilter(method="filter_module_id")

    def filter_module_id(self, queryset, name, value):
        q = build_module_filter_q(value, model=PlanModule)
        return queryset if q is None else queryset.filter(q)

    class Meta:
        model = TestPlan
        fields = {
            'name': ['exact', 'icontains', 'in'],
            'id': ['exact', 'in'],
            'state': ['in'],
            'project_id': ['exact'],
        }


class PlanCaseFilter(filters.FilterSet):
    # 前端历史参数名是 assignee_isnull（无双下划线），保留别名
    assignee_isnull = filters.BooleanFilter(field_name="assignee", lookup_expr="isnull")
    # 逗号分隔的模块 id（前端已展开子树）；"none" = 未归类（用例 module 为空）
    case__module_id__in = filters.CharFilter(method="filter_case_module_in")

    def filter_case_module_in(self, queryset, name, value):
        q = build_module_filter_q(value, field="case__module_id")
        return queryset if q is None else queryset.filter(q)

    class Meta:
        model = PlanCase
        fields = {
            "plan_id": ["exact", "in"],
            "assignee_id": ["exact", "in", "isnull"],
            "case__repository_id": ["exact", "in"],
            "case__module_id": ["exact"],
            "case__type": ["exact", "in"],
            "case__priority": ["exact", "in"],
            "result": ["exact", "in"],
            "review_status": ["exact", "in"],
        }


class CaseReviewFilter(filters.FilterSet):
    assignee__in = UUIDInFilter(method="filter_assignee")
    started_at__lte = filters.DateFilter(field_name="started_at", lookup_expr="lte")
    ended_at__gte = filters.DateFilter(field_name="ended_at", lookup_expr="gte")
    # 递归包含子模块；"none" = 未归类（module 为空）
    module_id = filters.CharFilter(method="filter_module_id")

    def filter_assignee(self, queryset, name, value):
        if not value:
            return queryset
        return queryset.filter(assignees__id__in=value).distinct()

    def filter_module_id(self, queryset, name, value):
        q = build_module_filter_q(value, model=CaseReviewModule)
        return queryset if q is None else queryset.filter(q)

    class Meta:
        model = CaseReview
        fields = {
            'name': ['exact', 'icontains', 'in'],
            'project_id': ['exact', 'in'],
            'state': ['exact', 'in'],
            'mode': ['exact', 'in'],
        }
