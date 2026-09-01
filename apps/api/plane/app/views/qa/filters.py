# filters.py
from django_filters import rest_framework as filters

from plane.db.models import TestPlan, PlanModule, PlanCase, CaseReview, CaseReviewModule
from plane.utils.filters.filterset import UUIDInFilter


class TestPlanFilter(filters.FilterSet):
    assignee_display_name = filters.CharFilter(field_name='plan_cases__assignees__display_name', lookup_expr='icontains')
    module_id = filters.UUIDFilter(method="filter_module_id")

    def filter_module_id(self, queryset, name, value):
        if not value:
            return queryset

        expanded = {str(value)}
        frontier = [str(value)]
        while frontier:
            children = list(
                PlanModule.objects.filter(parent_id__in=frontier, deleted_at__isnull=True).values_list("id", flat=True)
            )
            new_children = [str(c) for c in children if str(c) not in expanded]
            if not new_children:
                break
            expanded.update(new_children)
            frontier = new_children

        return queryset.filter(module_id__in=list(expanded))

    class Meta:
        model = TestPlan
        fields = {
            'name': ['exact', 'icontains', 'in'],
            'id': ['exact', 'in'],
            'state': ['in'],
            'project_id': ['exact'],
        }


class PlanCaseFilter(filters.FilterSet):
    # 执行人是 M2M，用 through 表子查询过滤，避免 join 产生重复行再 distinct
    assignee_id = filters.UUIDFilter(method="filter_assignee_id")
    assignee_id__in = UUIDInFilter(method="filter_assignee_id_in")

    def filter_assignee_id(self, queryset, name, value):
        return self._filter_by_assignees(queryset, [value])

    def filter_assignee_id_in(self, queryset, name, value):
        return self._filter_by_assignees(queryset, value)

    @staticmethod
    def _filter_by_assignees(queryset, user_ids):
        if not user_ids:
            return queryset
        through = PlanCase.assignees.through
        return queryset.filter(
            id__in=through.objects.filter(user_id__in=user_ids).values("plancase_id")
        )

    class Meta:
        model = PlanCase
        fields = {
            "plan_id": ["exact", "in"],
            "case__repository_id": ["exact", "in"],
            "case__module_id": ["exact", "in"],
            "case__type": ["exact", "in"],
            "case__priority": ["exact", "in"],
            "result": ["exact", "in"],
        }


class CaseReviewFilter(filters.FilterSet):
    assignee__in = UUIDInFilter(method="filter_assignee")
    started_at__lte = filters.DateFilter(field_name="started_at", lookup_expr="lte")
    ended_at__gte = filters.DateFilter(field_name="ended_at", lookup_expr="gte")
    module_id = filters.UUIDFilter(method="filter_module_id")

    def filter_assignee(self, queryset, name, value):
        if not value:
            return queryset
        return queryset.filter(assignees__id__in=value).distinct()

    def filter_module_id(self, queryset, name, value):
        if not value:
            return queryset

        expanded = {str(value)}
        frontier = [str(value)]
        while frontier:
            children = list(
                CaseReviewModule.objects.filter(parent_id__in=frontier, deleted_at__isnull=True).values_list(
                    "id", flat=True
                )
            )
            new_children = [str(c) for c in children if str(c) not in expanded]
            if not new_children:
                break
            expanded.update(new_children)
            frontier = new_children

        return queryset.filter(module_id__in=list(expanded))

    class Meta:
        model = CaseReview
        fields = {
            'name': ['exact', 'icontains', 'in'],
            'project_id': ['exact', 'in'],
            'state': ['exact', 'in'],
            'mode': ['exact', 'in'],
        }
