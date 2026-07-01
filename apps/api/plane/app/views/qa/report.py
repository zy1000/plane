from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404

from plane.app.serializers.qa import (
    TestReportListSerializer,
    build_report_stats_map,
)
from plane.app.serializers.qa.report import (
    TestReportCreateUpdateSerializer,
    TestReportDetailSerializer,
)
from plane.app.views import BaseAPIView, BaseViewSet
from plane.app.permissions import allow_fine_permission, PermissionKey
from plane.db.models import TestReport, PlanCase
from plane.utils.paginator import CustomPaginator
from plane.utils.response import list_response


class TestReportAPIView(BaseAPIView):
    """测试报告 CRUD（项目作用域）。"""

    model = TestReport
    queryset = TestReport.objects.all()
    serializer_class = TestReportCreateUpdateSerializer
    pagination_class = CustomPaginator
    filterset_fields = {
        "project_id": ["exact", "in"],
        "report_type": ["exact", "in"],
        "name": ["exact", "icontains", "in"],
    }

    def _project_queryset(self, slug, project_id):
        return self.queryset.filter(
            project_id=project_id,
            project__workspace__slug=slug,
            deleted_at__isnull=True,
        )

    @allow_fine_permission(PermissionKey.QA_REPORT_CREATE)
    def post(self, request, slug, project_id):
        data = request.data.copy()
        data["project"] = project_id
        serializer = self.serializer_class(
            data=data,
            context={"project_id": project_id, "workspace_slug": slug},
        )
        serializer.is_valid(raise_exception=True)
        report = serializer.save()
        report = TestReportDetailSerializer(instance=report).data
        return Response(report, status=status.HTTP_201_CREATED)

    @allow_fine_permission(PermissionKey.QA_REPORT_VIEW)
    def get(self, request, slug, project_id):
        report_id = request.query_params.get("id")
        base = self.filter_queryset(self._project_queryset(slug, project_id)).distinct()
        if report_id:
            report = get_object_or_404(base, id=report_id)
            return Response(TestReportDetailSerializer(instance=report).data, status=status.HTTP_200_OK)

        paginator = self.pagination_class()
        page_reports = list(paginator.paginate_queryset(base, request) or [])
        report_stats = build_report_stats_map([r.id for r in page_reports])
        serializer = TestReportListSerializer(
            instance=page_reports,
            many=True,
            context={"report_stats": report_stats},
        )
        paginator_count = getattr(getattr(paginator, "page", None), "paginator", None)
        count = getattr(paginator_count, "count", None)
        return list_response(
            data=serializer.data, count=count if count is not None else base.count()
        )

    @allow_fine_permission(PermissionKey.QA_REPORT_EDIT)
    def put(self, request, slug, project_id):
        report_id = request.data.get("id")
        report = get_object_or_404(self._project_queryset(slug, project_id), id=report_id)
        data = request.data.copy()
        data["project"] = project_id
        update_serializer = self.serializer_class(
            instance=report,
            data=data,
            partial=True,
            context={"project_id": project_id, "workspace_slug": slug},
        )
        update_serializer.is_valid(raise_exception=True)
        update_serializer.save()
        return Response(TestReportDetailSerializer(instance=report).data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.QA_REPORT_DELETE)
    def delete(self, request, slug, project_id):
        report_ids = request.data.get("ids") or []
        self._project_queryset(slug, project_id).filter(id__in=report_ids).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReportView(BaseViewSet):
    """测试报告子资源：分析与执行明细。"""

    pagination_class = CustomPaginator

    def _get_report(self, request, slug):
        report_id = request.query_params.get("report_id")
        project_id = request.query_params.get("project_id")
        qs = TestReport.objects.filter(
            id=report_id,
            deleted_at__isnull=True,
            project__workspace__slug=slug,
        )
        if project_id:
            qs = qs.filter(project_id=project_id)
        return get_object_or_404(qs)

    @action(detail=False, methods=["get"], url_path="analysis")
    @allow_fine_permission(PermissionKey.QA_REPORT_VIEW)
    def analysis(self, request, slug):
        report = self._get_report(request, slug)
        stats = build_report_stats_map([report.id]).get(report.id, {})
        plan_count = stats.get("plan_count", 0)
        case_count = stats.get("case_count", 0)
        success_count = stats.get("success_count", 0)
        pass_rate = stats.get("pass_rate", {})
        not_start = pass_rate.get(PlanCase.Result.NOT_START, 0)
        overall_pass_rate = round((success_count / case_count) * 100, 2) if case_count else 0.0
        completion_rate = round(((case_count - not_start) / case_count) * 100, 2) if case_count else 0.0
        return Response(
            {
                "report_id": str(report.id),
                "plan_count": plan_count,
                "case_count": case_count,
                "success_count": success_count,
                "pass_rate": dict(pass_rate),
                "overall_pass_rate": overall_pass_rate,
                "completion_rate": completion_rate,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=["get"], url_path="case-list")
    @allow_fine_permission(PermissionKey.QA_REPORT_VIEW)
    def case_list(self, request, slug):
        report = self._get_report(request, slug)
        plan_ids = list(report.plans.filter(deleted_at__isnull=True).values_list("id", flat=True))
        query = (
            PlanCase.objects.select_related("case", "assignee", "plan", "case__module")
            .filter(plan_id__in=plan_ids, deleted_at__isnull=True, plan__deleted_at__isnull=True)
            .annotate(
                defect_count=Count(
                    "case__issues",
                    filter=Q(case__issues__deleted_at__isnull=True),
                    distinct=True,
                )
            )
        )
        if name := request.query_params.get("name__icontains"):
            query = query.filter(Q(case__name__icontains=name) | Q(case__code__icontains=name))
        if module := request.query_params.get("module_id"):
            query = query.filter(case__module_id=module)
        if result := request.query_params.get("result"):
            query = query.filter(result=result)

        all_param = str(request.query_params.get("all", "")).strip().lower()
        if all_param in {"1", "true", "yes"}:
            data = [self._serialize_case_row(pc) for pc in query]
            return list_response(data=data, count=query.count())

        paginator = self.pagination_class()
        paginated = paginator.paginate_queryset(query, request) or []
        data = [self._serialize_case_row(pc) for pc in paginated]
        return list_response(data=data, count=query.count())

    def _serialize_case_row(self, plan_case):
        case = plan_case.case
        return {
            "id": str(plan_case.id),
            "case_id": str(case.id) if case else None,
            "code": case.code if case else "",
            "name": case.name if case else "",
            "priority": case.priority if case else None,
            "result": plan_case.result,
            "module": case.module.name if case and case.module else "",
            "assignee_id": str(plan_case.assignee_id) if plan_case.assignee_id else None,
            "assignee_name": getattr(plan_case.assignee, "display_name", None) or getattr(plan_case.assignee, "email", None) if plan_case.assignee_id else None,
            "defect_count": getattr(plan_case, "defect_count", 0) if case else 0,
            "plan_name": plan_case.plan.name if plan_case.plan else "",
            "created_at": plan_case.created_at,
            "updated_at": plan_case.updated_at,
        }
