# filters.py
from django_filters import rest_framework as filters

from plane.db.models import TestPlan, PlanModule, CaseReview, CaseReviewModule


class TestPlanFilter(filters.FilterSet):
    assignee_display_name = filters.CharFilter(field_name='assignees__display_name', lookup_expr='icontains')
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


class CaseReviewFilter(filters.FilterSet):
    module_id = filters.UUIDFilter(method="filter_module_id")

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
