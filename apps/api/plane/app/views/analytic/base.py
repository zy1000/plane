# Django imports
from django.db.models import Count, F, Sum, Q, OuterRef, Subquery
from django.db.models.functions import ExtractMonth
from django.db.models.functions import TruncDay
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.db.models.functions import Concat
from django.db.models import Case, When, Value, Func
from django.db import models
from datetime import timedelta

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import WorkSpaceAdminPermission
from plane.app.serializers import AnalyticViewSerializer
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.bgtasks.analytic_plot_export import analytic_export_task
from plane.db.models import (
    AnalyticView,
    Issue,
    Workspace,
    Project,
    ProjectMember,
    Cycle,
    Module,
)

from plane.utils.analytics_plot import build_graph_plot
from plane.utils.issue_filters import issue_filters
from plane.app.permissions import allow_permission, ROLE


class AnalyticsEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        x_axis = request.GET.get("x_axis", False)
        y_axis = request.GET.get("y_axis", False)
        segment = request.GET.get("segment", False)

        valid_xaxis_segment = [
            "state_id",
            "state__group",
            "labels__id",
            "assignees__id",
            "estimate_point__value",
            "issue_cycle__cycle_id",
            "issue_module__module_id",
            "priority",
            "start_date",
            "target_date",
            "created_at",
            "completed_at",
        ]

        valid_yaxis = ["issue_count", "estimate"]

        # Check for x-axis and y-axis as thery are required parameters
        if not x_axis or not y_axis or x_axis not in valid_xaxis_segment or y_axis not in valid_yaxis:
            return Response(
                {"error": "x-axis and y-axis dimensions are required and the values should be valid"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # If segment is present it cannot be same as x-axis
        if segment and (segment not in valid_xaxis_segment or x_axis == segment):
            return Response(
                {"error": "Both segment and x axis cannot be same and segment should be valid"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Additional filters that need to be applied
        filters = issue_filters(request.GET, "GET")

        # Get the issues for the workspace with the additional filters applied
        queryset = Issue.issue_objects.filter(workspace__slug=slug, **filters)

        # Get the total issue count
        total_issues = queryset.count()

        # Build the graph payload
        distribution = build_graph_plot(queryset=queryset, x_axis=x_axis, y_axis=y_axis, segment=segment)

        state_details = {}
        if x_axis in ["state_id"] or segment in ["state_id"]:
            state_details = (
                Issue.issue_objects.filter(workspace__slug=slug, **filters)
                .distinct("state_id")
                .order_by("state_id")
                .values("state_id", "state__name", "state__color")
            )

        label_details = {}
        if x_axis in ["labels__id"] or segment in ["labels__id"]:
            label_details = (
                Issue.objects.filter(
                    workspace__slug=slug,
                    **filters,
                    labels__id__isnull=False,
                    label_issue__deleted_at__isnull=True,
                )
                .distinct("labels__id")
                .order_by("labels__id")
                .values("labels__id", "labels__color", "labels__name")
            )

        assignee_details = {}
        if x_axis in ["assignees__id"] or segment in ["assignees__id"]:
            assignee_details = (
                Issue.issue_objects.filter(
                    Q(Q(assignees__avatar__isnull=False) | Q(assignees__avatar_asset__isnull=False)),
                    workspace__slug=slug,
                    **filters,
                )
                .annotate(
                    assignees__avatar_url=Case(
                        # If `avatar_asset` exists, use it to generate the asset URL
                        When(
                            assignees__avatar_asset__isnull=False,
                            then=Concat(
                                Value("/api/assets/v2/static/"),
                                "assignees__avatar_asset",  # Assuming avatar_asset has an id or relevant field
                                Value("/"),
                            ),
                        ),
                        # If `avatar_asset` is None, fall back to using `avatar` field directly
                        When(
                            assignees__avatar_asset__isnull=True,
                            then="assignees__avatar",
                        ),
                        default=Value(None),
                        output_field=models.CharField(),
                    )
                )
                .order_by("assignees__id")
                .distinct("assignees__id")
                .values(
                    "assignees__avatar_url",
                    "assignees__display_name",
                    "assignees__first_name",
                    "assignees__last_name",
                    "assignees__id",
                )
            )

        cycle_details = {}
        if x_axis in ["issue_cycle__cycle_id"] or segment in ["issue_cycle__cycle_id"]:
            cycle_details = (
                Issue.issue_objects.filter(
                    workspace__slug=slug,
                    **filters,
                    issue_cycle__cycle_id__isnull=False,
                    issue_cycle__deleted_at__isnull=True,
                )
                .distinct("issue_cycle__cycle_id")
                .order_by("issue_cycle__cycle_id")
                .values("issue_cycle__cycle_id", "issue_cycle__cycle__name")
            )

        module_details = {}
        if x_axis in ["issue_module__module_id"] or segment in ["issue_module__module_id"]:
            module_details = (
                Issue.issue_objects.filter(
                    workspace__slug=slug,
                    **filters,
                    issue_module__module_id__isnull=False,
                    issue_module__deleted_at__isnull=True,
                )
                .distinct("issue_module__module_id")
                .order_by("issue_module__module_id")
                .values("issue_module__module_id", "issue_module__module__name")
            )

        return Response(
            {
                "total": total_issues,
                "distribution": distribution,
                "extras": {
                    "state_details": state_details,
                    "assignee_details": assignee_details,
                    "label_details": label_details,
                    "cycle_details": cycle_details,
                    "module_details": module_details,
                },
            },
            status=status.HTTP_200_OK,
        )


class AnalyticViewViewset(BaseViewSet):
    permission_classes = [WorkSpaceAdminPermission]
    model = AnalyticView
    serializer_class = AnalyticViewSerializer

    def perform_create(self, serializer):
        workspace = Workspace.objects.get(slug=self.kwargs.get("slug"))
        serializer.save(workspace_id=workspace.id)

    def get_queryset(self):
        return self.filter_queryset(super().get_queryset().filter(workspace__slug=self.kwargs.get("slug")))


class SavedAnalyticEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug, analytic_id):
        analytic_view = AnalyticView.objects.get(pk=analytic_id, workspace__slug=slug)

        filter = analytic_view.query
        queryset = Issue.issue_objects.filter(**filter)

        x_axis = analytic_view.query_dict.get("x_axis", False)
        y_axis = analytic_view.query_dict.get("y_axis", False)

        if not x_axis or not y_axis:
            return Response(
                {"error": "x-axis and y-axis dimensions are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        segment = request.GET.get("segment", False)
        distribution = build_graph_plot(queryset=queryset, x_axis=x_axis, y_axis=y_axis, segment=segment)
        total_issues = queryset.count()
        return Response(
            {"total": total_issues, "distribution": distribution},
            status=status.HTTP_200_OK,
        )


class ExportAnalyticsEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        x_axis = request.data.get("x_axis", False)
        y_axis = request.data.get("y_axis", False)
        segment = request.data.get("segment", False)

        valid_xaxis_segment = [
            "state_id",
            "state__group",
            "labels__id",
            "assignees__id",
            "estimate_point",
            "issue_cycle__cycle_id",
            "issue_module__module_id",
            "priority",
            "start_date",
            "target_date",
            "created_at",
            "completed_at",
        ]

        valid_yaxis = ["issue_count", "estimate"]

        # Check for x-axis and y-axis as thery are required parameters
        if not x_axis or not y_axis or x_axis not in valid_xaxis_segment or y_axis not in valid_yaxis:
            return Response(
                {"error": "x-axis and y-axis dimensions are required and the values should be valid"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # If segment is present it cannot be same as x-axis
        if segment and (segment not in valid_xaxis_segment or x_axis == segment):
            return Response(
                {"error": "Both segment and x axis cannot be same and segment should be valid"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        analytic_export_task.delay(email=request.user.email, data=request.data, slug=slug)

        return Response(
            {"message": f"Once the export is ready it will be emailed to you at {str(request.user.email)}"},
            status=status.HTTP_200_OK,
        )


class DefaultAnalyticsEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        filters = issue_filters(request.GET, "GET")
        base_issues = Issue.issue_objects.filter(workspace__slug=slug, **filters)

        total_issues = base_issues.count()

        state_groups = base_issues.annotate(state_group=F("state__group"))

        total_issues_classified = (
            state_groups.values("state_group").annotate(state_count=Count("state_group")).order_by("state_group")
        )

        open_issues_groups = ["backlog", "unstarted", "started"]
        open_issues_queryset = state_groups.filter(state__group__in=open_issues_groups)

        open_issues = open_issues_queryset.count()
        open_issues_classified = (
            open_issues_queryset.values("state_group")
            .annotate(state_count=Count("state_group"))
            .order_by("state_group")
        )

        current_year = timezone.now().year
        issue_completed_month_wise = (
            base_issues.filter(completed_at__year=current_year)
            .annotate(month=ExtractMonth("completed_at"))
            .values("month")
            .annotate(count=Count("*"))
            .order_by("month")
        )

        user_details = [
            "created_by__first_name",
            "created_by__last_name",
            "created_by__display_name",
            "created_by__id",
        ]

        most_issue_created_user = (
            base_issues.exclude(created_by=None)
            .values(*user_details)
            .annotate(count=Count("id"))
            .annotate(
                created_by__avatar_url=Case(
                    # If `avatar_asset` exists, use it to generate the asset URL
                    When(
                        created_by__avatar_asset__isnull=False,
                        then=Concat(
                            Value("/api/assets/v2/static/"),
                            "created_by__avatar_asset",  # Assuming avatar_asset has an id or relevant field
                            Value("/"),
                        ),
                    ),
                    # If `avatar_asset` is None, fall back to using `avatar` field directly
                    When(created_by__avatar_asset__isnull=True, then="created_by__avatar"),
                    default=Value(None),
                    output_field=models.CharField(),
                )
            )
            .order_by("-count")[:5]
        )

        user_assignee_details = [
            "assignees__first_name",
            "assignees__last_name",
            "assignees__display_name",
            "assignees__id",
        ]

        most_issue_closed_user = (
            base_issues.filter(completed_at__isnull=False)
            .exclude(assignees=None)
            .values(*user_assignee_details)
            .annotate(
                assignees__avatar_url=Case(
                    # If `avatar_asset` exists, use it to generate the asset URL
                    When(
                        assignees__avatar_asset__isnull=False,
                        then=Concat(
                            Value("/api/assets/v2/static/"),
                            "assignees__avatar_asset",  # Assuming avatar_asset has an id or relevant field
                            Value("/"),
                        ),
                    ),
                    # If `avatar_asset` is None, fall back to using `avatar` field directly
                    When(assignees__avatar_asset__isnull=True, then="assignees__avatar"),
                    default=Value(None),
                    output_field=models.CharField(),
                )
            )
            .annotate(count=Count("id"))
            .order_by("-count")[:5]
        )

        pending_issue_user = (
            base_issues.filter(completed_at__isnull=True)
            .values(*user_assignee_details)
            .annotate(count=Count("id"))
            .annotate(
                assignees__avatar_url=Case(
                    # If `avatar_asset` exists, use it to generate the asset URL
                    When(
                        assignees__avatar_asset__isnull=False,
                        then=Concat(
                            Value("/api/assets/v2/static/"),
                            "assignees__avatar_asset",  # Assuming avatar_asset has an id or relevant field
                            Value("/"),
                        ),
                    ),
                    # If `avatar_asset` is None, fall back to using `avatar` field directly
                    When(assignees__avatar_asset__isnull=True, then="assignees__avatar"),
                    default=Value(None),
                    output_field=models.CharField(),
                )
            )
            .order_by("-count")
        )

        open_estimate_sum = open_issues_queryset.aggregate(sum=Sum("point"))["sum"]
        total_estimate_sum = base_issues.aggregate(sum=Sum("point"))["sum"]

        return Response(
            {
                "total_issues": total_issues,
                "total_issues_classified": total_issues_classified,
                "open_issues": open_issues,
                "open_issues_classified": open_issues_classified,
                "issue_completed_month_wise": issue_completed_month_wise,
                "most_issue_created_user": most_issue_created_user,
                "most_issue_closed_user": most_issue_closed_user,
                "pending_issue_user": pending_issue_user,
                "open_estimate_sum": open_estimate_sum,
                "total_estimate_sum": total_estimate_sum,
            },
            status=status.HTTP_200_OK,
        )


class ProjectStatsEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        fields = request.GET.get("fields", "").split(",")
        project_ids = request.GET.get("project_ids", "")

        valid_fields = {
            "total_issues",
            "completed_issues",
            "total_members",
            "total_cycles",
            "total_modules",
        }
        requested_fields = set(filter(None, fields)) & valid_fields

        if not requested_fields:
            requested_fields = valid_fields

        projects = Project.objects.filter(workspace__slug=slug)
        if project_ids:
            projects = projects.filter(id__in=project_ids.split(","))

        annotations = {}
        if "total_issues" in requested_fields:
            annotations["total_issues"] = (
                Issue.issue_objects.filter(project_id=OuterRef("pk"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )

        if "completed_issues" in requested_fields:
            annotations["completed_issues"] = (
                Issue.issue_objects.filter(project_id=OuterRef("pk"), state__group__in=["completed", "cancelled"])
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )

        if "total_cycles" in requested_fields:
            annotations["total_cycles"] = (
                Cycle.objects.filter(project_id=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )

        if "total_modules" in requested_fields:
            annotations["total_modules"] = (
                Module.objects.filter(project_id=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )

        if "total_members" in requested_fields:
            annotations["total_members"] = (
                ProjectMember.objects.filter(project_id=OuterRef("id"), member__is_bot=False, is_active=True)
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )

        projects = projects.annotate(**annotations).values("id", *requested_fields)
        return Response(projects, status=status.HTTP_200_OK)


class ProjectStatisticsEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, project_id):
        from plane.db.models.page import ProjectPage
        from plane.db.models.view import IssueView
        from plane.db.models.milestone import Milestone
        from plane.db.models.qa import (
            CaseReview,
            CaseReviewRecord,
            PlanCase,
            PlanCaseRecord,
            TestCase,
            TestCaseRepository,
        )
        from plane.utils.analytics_plot import burndown_plot

        project = (
            Project.objects.filter(workspace__slug=slug, id=project_id, archived_at__isnull=True)
            .filter(Q(project_projectmember__member=self.request.user, project_projectmember__is_active=True) | Q(network=2))
            .first()
        )
        if not project:
            return Response({"message": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.now()
        today = now.date()
        last_7d = now - timedelta(days=7)
        last_30d = now - timedelta(days=30)

        requested_start_date = parse_date(request.GET.get("start_date")) if request.GET.get("start_date") else None
        requested_end_date = parse_date(request.GET.get("end_date")) if request.GET.get("end_date") else None
        range_start_date = requested_start_date or last_30d.date()
        range_end_date = requested_end_date or today
        if range_start_date and range_end_date and range_start_date > range_end_date:
            range_start_date, range_end_date = range_end_date, range_start_date

        requested_cycle_id = request.GET.get("cycle_id") or None

        issues = Issue.issue_objects.filter(workspace__slug=slug, project_id=project_id)

        total_work_items = issues.count()
        completed_work_items = issues.filter(state__group__in=["completed", "cancelled"]).count()
        in_progress_work_items = issues.filter(state__group__in=["started", "unstarted"]).count()
        backlog_work_items = issues.filter(state__group="backlog").count()

        overdue_work_items = issues.filter(target_date__lt=today).exclude(state__group__in=["completed", "cancelled"]).count()
        due_today_work_items = issues.filter(target_date=today).exclude(state__group__in=["completed", "cancelled"]).count()

        created_last_7d = issues.filter(created_at__gte=last_7d).count()
        completed_last_7d = issues.filter(completed_at__gte=last_7d).count()
        created_last_30d = issues.filter(created_at__gte=last_30d).count()
        completed_last_30d = issues.filter(completed_at__gte=last_30d).count()

        defect_work_items = issues.filter(Q(type__name__icontains="bug") | Q(type__name__icontains="缺陷")).count()

        completion_rate = round((completed_work_items / total_work_items) * 100, 2) if total_work_items > 0 else 0

        state_group_distribution = (
            issues.values("state__group")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        priority_distribution = (
            issues.values("priority")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        type_distribution = (
            issues.values("type_id", "type__name")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        module_status_distribution = (
            Module.objects.filter(project_id=project_id, archived_at__isnull=True, deleted_at__isnull=True)
            .values("status")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        cycles = Cycle.objects.filter(project_id=project_id, archived_at__isnull=True, deleted_at__isnull=True)
        active_cycles = cycles.filter(start_date__lte=now, end_date__gte=now).count()

        milestone_state_distribution = (
            Milestone.objects.filter(project_id=project_id, deleted_at__isnull=True)
            .values("state")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        cycles_for_release_timeline = list(
            cycles.filter(end_date__isnull=False)
            .order_by("end_date")
            .values("id", "name", "start_date", "end_date")[:12]
        )
        cycle_ids_for_release_timeline = [c["id"] for c in cycles_for_release_timeline]
        cycle_issue_stats = (
            Issue.issue_objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                issue_cycle__cycle_id__in=cycle_ids_for_release_timeline,
                issue_cycle__deleted_at__isnull=True,
                archived_at__isnull=True,
                is_draft=False,
            )
            .values("issue_cycle__cycle_id")
            .annotate(total=Count("id"))
            .annotate(completed=Count("id", filter=Q(state__group__in=["completed", "cancelled"])))
        )
        cycle_issue_stats_map = {str(r["issue_cycle__cycle_id"]): r for r in cycle_issue_stats}
        urgent_cutoff = today + timedelta(days=3)
        release_nodes = []
        for c in cycles_for_release_timeline:
            cid = str(c["id"])
            stat = cycle_issue_stats_map.get(cid, {})
            total = stat.get("total", 0) or 0
            completed = stat.get("completed", 0) or 0
            remaining = max(0, total - completed)
            completion = round((completed / total) * 100, 2) if total > 0 else 0
            start_date = c["start_date"].date() if c.get("start_date") else None
            end_date = c["end_date"].date() if c.get("end_date") else None
            if total > 0 and remaining == 0:
                release_state = "已发布"
            elif end_date and end_date < today and remaining > 0:
                release_state = "延期"
            elif start_date and start_date > today:
                release_state = "未开始"
            else:
                release_state = "进行中"
            is_urgent = bool(end_date and end_date <= urgent_cutoff and remaining > 0)
            release_nodes.append(
                {
                    "id": cid,
                    "name": c["name"],
                    "start_date": start_date.isoformat() if start_date else None,
                    "end_date": end_date.isoformat() if end_date else None,
                    "state": release_state,
                    "completion_rate": completion,
                    "remaining_work_items": remaining,
                    "total_work_items": total,
                    "is_urgent": is_urgent,
                }
            )

        total_members = ProjectMember.objects.filter(project_id=project_id, member__is_bot=False, is_active=True).count()
        total_pages = ProjectPage.objects.filter(project_id=project_id, deleted_at__isnull=True).count()
        total_views = IssueView.objects.filter(project_id=project_id, deleted_at__isnull=True).count()

        test_repositories = TestCaseRepository.objects.filter(project_id=project_id, workspace__slug=slug, deleted_at__isnull=True)
        test_cases = TestCase.objects.filter(repository__in=test_repositories, deleted_at__isnull=True)
        test_repository_count = test_repositories.count()
        test_case_count = test_cases.count()

        test_case_type_distribution = (
            test_cases.values("type")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        test_case_test_type_distribution = (
            test_cases.values("test_type")
            .annotate(count=Count("id"))
            .order_by("-count")
        )
        test_case_priority_distribution = (
            test_cases.values("priority")
            .annotate(count=Count("id"))
            .order_by("-count")
        )

        created_by_day = (
            issues.filter(created_at__gte=last_30d)
            .annotate(day=TruncDay("created_at"))
            .values("day")
            .annotate(count=Count("id"))
            .order_by("day")
        )
        completed_by_day = (
            issues.filter(completed_at__isnull=False, completed_at__gte=last_30d)
            .annotate(day=TruncDay("completed_at"))
            .values("day")
            .annotate(count=Count("id"))
            .order_by("day")
        )

        created_map = {row["day"].date().isoformat(): row["count"] for row in created_by_day}
        completed_map = {row["day"].date().isoformat(): row["count"] for row in completed_by_day}

        trend_30d = []
        for offset in range(29, -1, -1):
            d = (today - timedelta(days=offset)).isoformat()
            trend_30d.append(
                {
                    "date": d,
                    "created": created_map.get(d, 0),
                    "completed": completed_map.get(d, 0),
                }
            )

        defects_in_range = issues.filter(
            Q(type__name__icontains="bug") | Q(type__name__icontains="缺陷") | Q(type__name__icontains="defect"),
            created_at__date__gte=range_start_date,
            created_at__date__lte=range_end_date,
        )
        defect_status_rows = defects_in_range.values("state__group").annotate(count=Count("id")).order_by("-count")
        defect_status_map = {k: 0 for k in ["backlog", "unstarted", "started", "completed", "cancelled"]}
        for row in defect_status_rows:
            key = row.get("state__group") or "backlog"
            defect_status_map[key] = defect_status_map.get(key, 0) + (row.get("count") or 0)

        defect_severity_rows = (
            defects_in_range.values("priority").annotate(count=Count("id")).order_by("-count")
        )

        latest_execution_result = Coalesce(
            Subquery(
                PlanCase.objects.filter(case_id=OuterRef("id"), plan__project_id=project_id)
                .order_by("-updated_at")
                .values("result")[:1]
            ),
            Value(PlanCase.Result.NOT_START),
        )
        cases_with_exec = test_cases.annotate(latest_result=latest_execution_result)
        exec_total = test_case_count
        exec_success = cases_with_exec.filter(latest_result=PlanCase.Result.SUCCESS).count()
        exec_fail = cases_with_exec.filter(latest_result__in=[PlanCase.Result.FAIL, PlanCase.Result.BLOCK, PlanCase.Result.INVALID]).count()
        exec_not_start = exec_total - exec_success - exec_fail

        failed_case_ids = list(
            cases_with_exec.filter(latest_result__in=[PlanCase.Result.FAIL, PlanCase.Result.BLOCK, PlanCase.Result.INVALID])
            .values_list("id", flat=True)[:200]
        )
        failed_case_records = (
            PlanCaseRecord.objects.filter(
                plan_case__case_id__in=failed_case_ids,
                plan_case__plan__project_id=project_id,
                result__in=[PlanCaseRecord.Result.FAIL, PlanCaseRecord.Result.BLOCK, PlanCaseRecord.Result.INVALID],
            )
            .select_related("assignee", "plan_case", "plan_case__plan", "plan_case__case")
            .order_by("-created_at")
        )
        failed_case_seen = set()
        failed_cases_details = []
        for record in failed_case_records:
            case_id = str(record.plan_case.case_id) if record.plan_case_id else None
            if not case_id or case_id in failed_case_seen:
                continue
            failed_case_seen.add(case_id)
            case = record.plan_case.case if getattr(record.plan_case, "case_id", None) else None
            failed_cases_details.append(
                {
                    "id": case_id,
                    "code": getattr(case, "code", ""),
                    "name": getattr(case, "name", ""),
                    "result": record.result,
                    "reason": record.reason,
                    "executed_at": record.created_at.isoformat() if record.created_at else None,
                    "executor": record.assignee.display_name if record.assignee_id else None,
                    "plan_id": str(record.plan_case.plan_id) if record.plan_case_id else None,
                    "plan_name": record.plan_case.plan.name if record.plan_case_id else None,
                }
            )
            if len(failed_cases_details) >= 50:
                break

        latest_review_result = Subquery(
            CaseReviewRecord.objects.filter(crt__case_id=OuterRef("id"))
            .order_by("-created_at")
            .values("result")[:1]
        )
        cases_with_review = test_cases.annotate(latest_review=Coalesce(latest_review_result, Value("未评审")))
        review_pass = cases_with_review.filter(latest_review=CaseReviewRecord.Result.PASS).count()
        review_fail = cases_with_review.filter(latest_review=CaseReviewRecord.Result.FAIL).count()
        review_pending = test_case_count - review_pass - review_fail
        review_pass_rate = round((review_pass / test_case_count) * 100, 2) if test_case_count > 0 else 0

        review_trend_start = today - timedelta(days=29)
        review_pass_by_day = (
            CaseReviewRecord.objects.filter(
                crt__review__project_id=project_id,
                created_at__date__gte=review_trend_start,
                created_at__date__lte=today,
                result=CaseReviewRecord.Result.PASS,
            )
            .annotate(day=TruncDay("created_at"))
            .values("day")
            .annotate(count=Count("id"))
            .order_by("day")
        )
        review_fail_by_day = (
            CaseReviewRecord.objects.filter(
                crt__review__project_id=project_id,
                created_at__date__gte=review_trend_start,
                created_at__date__lte=today,
                result=CaseReviewRecord.Result.FAIL,
            )
            .annotate(day=TruncDay("created_at"))
            .values("day")
            .annotate(count=Count("id"))
            .order_by("day")
        )
        review_pass_map = {row["day"].date().isoformat(): row["count"] for row in review_pass_by_day}
        review_fail_map = {row["day"].date().isoformat(): row["count"] for row in review_fail_by_day}
        review_trend_30d = []
        for offset in range(29, -1, -1):
            d = (today - timedelta(days=offset)).isoformat()
            p = review_pass_map.get(d, 0)
            f = review_fail_map.get(d, 0)
            denom = p + f
            review_trend_30d.append({"date": d, "pass": p, "fail": f, "pass_rate": round((p / denom) * 100, 2) if denom else 0})

        latest_active_review = (
            CaseReview.objects.filter(project_id=project_id, deleted_at__isnull=True)
            .exclude(state=CaseReview.State.COMPLETED)
            .order_by("-created_at")
            .first()
        )
        review_owner = None
        if latest_active_review:
            assignees = (
                latest_active_review.assignees.annotate(
                    avatar_url=Case(
                        When(
                            avatar_asset__isnull=False,
                            then=Concat(
                                Value("/api/assets/v2/static/"),
                                "avatar_asset",
                                Value("/"),
                            ),
                        ),
                        When(avatar_asset__isnull=True, then="avatar"),
                        default=Value(None),
                        output_field=models.CharField(),
                    )
                )
                .values("id", "display_name", "avatar_url")
            )
            review_owner = {
                "review_id": str(latest_active_review.id),
                "review_name": latest_active_review.name,
                "state": latest_active_review.state,
                "assignees": list(assignees),
            }

        available_cycles = cycles.values("id", "name", "start_date", "end_date").order_by("-created_at")[:50]
        selected_cycle = None
        if requested_cycle_id:
            selected_cycle = cycles.filter(id=requested_cycle_id).first()
        if not selected_cycle:
            selected_cycle = cycles.filter(start_date__lte=now, end_date__gte=now).order_by("start_date").first()
        if not selected_cycle:
            selected_cycle = cycles.order_by("-created_at").first()

        burndown = None
        if selected_cycle and selected_cycle.start_date and selected_cycle.end_date:
            cycle_total_issues = (
                Issue.issue_objects.filter(
                    workspace__slug=slug,
                    project_id=project_id,
                    issue_cycle__cycle_id=selected_cycle.id,
                    issue_cycle__deleted_at__isnull=True,
                    archived_at__isnull=True,
                    is_draft=False,
                ).count()
            )
            setattr(selected_cycle, "total_issues", cycle_total_issues)
            burndown_chart = burndown_plot(
                queryset=selected_cycle,
                slug=slug,
                project_id=project_id,
                plot_type="issues",
                cycle_id=str(selected_cycle.id),
            )
            burndown = {
                "cycle": {
                    "id": str(selected_cycle.id),
                    "name": selected_cycle.name,
                    "start_date": selected_cycle.start_date.date().isoformat() if selected_cycle.start_date else None,
                    "end_date": selected_cycle.end_date.date().isoformat() if selected_cycle.end_date else None,
                    "total_issues": cycle_total_issues,
                },
                "series": burndown_chart,
            }

        timeline_start_candidates = []
        timeline_end_candidates = []
        cycle_min_start = cycles.aggregate(min_start=models.Min("start_date")).get("min_start")
        cycle_max_end = cycles.aggregate(max_end=models.Max("end_date")).get("max_end")
        milestone_min_start = Milestone.objects.filter(project_id=project_id, deleted_at__isnull=True).aggregate(
            min_start=models.Min("start_date")
        ).get("min_start")
        milestone_max_end = Milestone.objects.filter(project_id=project_id, deleted_at__isnull=True).aggregate(
            max_end=models.Max("end_date")
        ).get("max_end")
        issue_min_start = issues.aggregate(min_start=models.Min("start_date")).get("min_start")
        issue_max_target = issues.aggregate(max_target=models.Max("target_date")).get("max_target")

        if project.created_at:
            timeline_start_candidates.append(project.created_at.date())
        if cycle_min_start:
            timeline_start_candidates.append(cycle_min_start.date())
        if milestone_min_start:
            timeline_start_candidates.append(milestone_min_start)
        if issue_min_start:
            timeline_start_candidates.append(issue_min_start)

        if cycle_max_end:
            timeline_end_candidates.append(cycle_max_end.date())
        if milestone_max_end:
            timeline_end_candidates.append(milestone_max_end)
        if issue_max_target:
            timeline_end_candidates.append(issue_max_target)

        timeline_start_date = min(timeline_start_candidates) if timeline_start_candidates else None
        timeline_end_date = max(timeline_end_candidates) if timeline_end_candidates else None

        selected_release_total = 0
        selected_release_completed = 0
        selected_release_completion_rate = completion_rate
        selected_release_start_date = None
        selected_release_end_date = None
        selected_release_is_urgent = False
        if selected_cycle and selected_cycle.start_date and selected_cycle.end_date:
            selected_release_total = (
                Issue.issue_objects.filter(
                    workspace__slug=slug,
                    project_id=project_id,
                    issue_cycle__cycle_id=selected_cycle.id,
                    issue_cycle__deleted_at__isnull=True,
                    archived_at__isnull=True,
                    is_draft=False,
                ).count()
            )
            selected_release_completed = (
                Issue.issue_objects.filter(
                    workspace__slug=slug,
                    project_id=project_id,
                    issue_cycle__cycle_id=selected_cycle.id,
                    issue_cycle__deleted_at__isnull=True,
                    archived_at__isnull=True,
                    is_draft=False,
                    state__group__in=["completed", "cancelled"],
                ).count()
            )
            selected_release_completion_rate = (
                round((selected_release_completed / selected_release_total) * 100, 2) if selected_release_total > 0 else 0
            )
            selected_release_start_date = selected_cycle.start_date.date()
            selected_release_end_date = selected_cycle.end_date.date()
            selected_release_is_urgent = bool(
                selected_release_end_date and selected_release_end_date <= (today + timedelta(days=3)) and (selected_release_total - selected_release_completed) > 0
            )

        payload = {
            "generated_at": now.isoformat(),
            "project": {
                "id": str(project.id),
                "name": project.name,
                "identifier": project.identifier,
                "logo_props": project.logo_props,
            },
            "project_progress": {
                "release": {
                    "id": str(selected_cycle.id) if selected_cycle else None,
                    "name": selected_cycle.name if selected_cycle else None,
                    "start_date": selected_release_start_date.isoformat() if selected_release_start_date else None,
                    "end_date": selected_release_end_date.isoformat() if selected_release_end_date else None,
                    "completion_rate": selected_release_completion_rate,
                    "total_work_items": selected_release_total,
                    "remaining_work_items": max(0, selected_release_total - selected_release_completed),
                    "is_urgent": selected_release_is_urgent,
                },
                "start_date": (selected_release_start_date or timeline_start_date).isoformat() if (selected_release_start_date or timeline_start_date) else None,
                "end_date": (selected_release_end_date or timeline_end_date).isoformat() if (selected_release_end_date or timeline_end_date) else None,
                "completion_rate": selected_release_completion_rate,
                "description": selected_cycle.description if (selected_cycle and selected_cycle.description) else project.description,
                "releases": release_nodes,
            },
            "kpis": {
                "total_work_items": total_work_items,
                "completed_work_items": completed_work_items,
                "in_progress_work_items": in_progress_work_items,
                "backlog_work_items": backlog_work_items,
                "overdue_work_items": overdue_work_items,
                "due_today_work_items": due_today_work_items,
                "defect_work_items": defect_work_items,
                "active_cycles": active_cycles,
                "total_cycles": cycles.count(),
                "total_modules": Module.objects.filter(project_id=project_id, archived_at__isnull=True, deleted_at__isnull=True).count(),
                "total_milestones": Milestone.objects.filter(project_id=project_id, deleted_at__isnull=True).count(),
                "total_members": total_members,
                "total_pages": total_pages,
                "total_views": total_views,
                "test_repository_count": test_repository_count,
                "test_case_count": test_case_count,
                "created_last_7d": created_last_7d,
                "completed_last_7d": completed_last_7d,
                "created_last_30d": created_last_30d,
                "completed_last_30d": completed_last_30d,
            },
            "test_progress": {
                "total_cases": exec_total,
                "success": exec_success,
                "fail": exec_fail,
                "not_executed": exec_not_start,
                "failed_cases": failed_cases_details,
            },
            "defect_stats": {
                "range": {"start_date": range_start_date.isoformat() if range_start_date else None, "end_date": range_end_date.isoformat() if range_end_date else None},
                "total": defects_in_range.count(),
                "by_status": [{"status": k, "count": v} for k, v in defect_status_map.items()],
                "by_severity": list(defect_severity_rows),
            },
            "case_review": {
                "pass": review_pass,
                "fail": review_fail,
                "pending": review_pending,
                "pass_rate": review_pass_rate,
                "trend_30d": review_trend_30d,
                "owner": review_owner,
            },
            "burndown": burndown,
            "cycles": [
                {
                    "id": str(c["id"]),
                    "name": c["name"],
                    "start_date": c["start_date"].date().isoformat() if c.get("start_date") else None,
                    "end_date": c["end_date"].date().isoformat() if c.get("end_date") else None,
                }
                for c in available_cycles
            ],
            "distributions": {
                "state_groups": list(state_group_distribution),
                "priorities": list(priority_distribution),
                "issue_types": list(type_distribution),
                "module_status": list(module_status_distribution),
                "milestone_state": list(milestone_state_distribution),
                "test_case_type": list(test_case_type_distribution),
                "test_case_test_type": list(test_case_test_type_distribution),
                "test_case_priority": list(test_case_priority_distribution),
            },
            "trend_30d": trend_30d,
        }
        return Response(payload, status=status.HTTP_200_OK)
