# Django imports
from django.db.models import Count, F, Sum, Q
from django.db.models.functions import ExtractMonth
from django.db.models.functions import TruncDay
from django.utils import timezone
from django.db.models.functions import Concat
from django.db.models import Case, When, Value, OuterRef, Func
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
        from plane.db.models.qa import TestCase, TestCaseRepository

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

        payload = {
            "project": {
                "id": str(project.id),
                "name": project.name,
                "identifier": project.identifier,
                "logo_props": project.logo_props,
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
