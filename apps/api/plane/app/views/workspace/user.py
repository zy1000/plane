# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import copy
from datetime import date, timedelta

from dateutil.relativedelta import relativedelta

# Django imports
from django.db.models import (
    Case,
    Count,
    F,
    Func,
    IntegerField,
    OuterRef,
    Q,
    Value,
    When,
    Subquery,
)
from django.db.models.fields import DateField
from django.db.models.functions import Cast, ExtractWeek
from django.utils import timezone

# Third party modules
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import (
    PermissionKey,
    allow_workspace_member,
    allow_workspace_self_or_permission,
)

# Module imports
from plane.app.serializers import (
    IssueActivitySerializer,
    ProjectMemberSerializer,
    WorkspaceUserMetricItemSerializer,
    WorkspaceUserMetricQuerySerializer,
    WorkSpaceSerializer,
    WorkspaceUserPropertiesSerializer,
)
from plane.app.views.base import BaseAPIView
from plane.db.models import (
    CycleIssue,
    Issue,
    IssueActivity,
    FileAsset,
    IssueLink,
    Project,
    ProjectMember,
    User,
    Workspace,
    WorkspaceMember,
    WorkspaceUserProperties,
)
from plane.utils.grouper import (
    issue_group_values,
    issue_on_results,
    issue_queryset_grouper,
)
from plane.utils.issue_filters import issue_filters
from plane.utils.order_queryset import order_issue_queryset
from plane.utils.paginator import GroupedOffsetPaginator, SubGroupedOffsetPaginator
from plane.utils.profile_metrics import (
    PROFILE_METRIC_KEYS,
    apply_profile_metric_filters,
    build_profile_metric_tree,
    get_profile_metric_queryset,
)
from plane.utils.filters import ComplexFilterBackend
from plane.utils.filters import IssueFilterSet


class UserLastProjectWithWorkspaceEndpoint(BaseAPIView):
    def get(self, request):
        user = User.objects.get(pk=request.user.id)

        last_workspace_id = user.last_workspace_id

        if last_workspace_id is None:
            return Response(
                {"project_details": [], "workspace_details": {}},
                status=status.HTTP_200_OK,
            )

        workspace = Workspace.objects.get(pk=last_workspace_id)
        workspace_serializer = WorkSpaceSerializer(workspace)

        project_member = ProjectMember.objects.filter(
            workspace_id=last_workspace_id, member=request.user
        ).select_related("workspace", "project", "member", "workspace__owner")

        project_member_serializer = ProjectMemberSerializer(project_member, many=True)

        return Response(
            {
                "workspace_details": workspace_serializer.data,
                "project_details": project_member_serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class WorkspaceUserProfileIssuesEndpoint(BaseAPIView):
    filter_backends = (ComplexFilterBackend,)
    filterset_class = IssueFilterSet

    def apply_annotations(self, issues):
        return (
            issues.annotate(
                cycle_id=Subquery(
                    CycleIssue.objects.filter(issue=OuterRef("id"), deleted_at__isnull=True).values("cycle_id")[:1]
                )
            )
            .annotate(
                link_count=IssueLink.objects.filter(issue=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                attachment_count=FileAsset.objects.filter(
                    issue_id=OuterRef("id"),
                    entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                )
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .annotate(
                sub_issues_count=Issue.issue_objects.filter(parent=OuterRef("id"))
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .prefetch_related("assignees", "labels", "issue_module__module")
        )

    @allow_workspace_self_or_permission(PermissionKey.WORKSPACE_USER_PROFILE_VIEW)
    def get(self, request, slug, user_id):
        filters = issue_filters(request.query_params, "GET")

        order_by_param = request.GET.get("order_by", "-created_at")
        issue_queryset = Issue.issue_objects.filter(
            id__in=Issue.issue_objects.filter(
                Q(assignees__in=[user_id]) | Q(created_by_id=user_id) | Q(issue_subscribers__subscriber_id=user_id),
                workspace__slug=slug,
            ).values_list("id", flat=True),
            workspace__slug=slug,
            project__project_projectmember__member=request.user,
            project__project_projectmember__is_active=True,
        )

        # Apply filtering from filterset
        issue_queryset = self.filter_queryset(issue_queryset)

        # Apply legacy filters
        issue_queryset = issue_queryset.filter(**filters)

        # Total count queryset
        total_issue_queryset = copy.deepcopy(issue_queryset)

        # Apply annotations to the issue queryset
        issue_queryset = self.apply_annotations(issue_queryset)

        # Issue queryset
        issue_queryset, order_by_param = order_issue_queryset(
            issue_queryset=issue_queryset, order_by_param=order_by_param
        )

        # Group by
        group_by = request.GET.get("group_by", False)
        sub_group_by = request.GET.get("sub_group_by", False)

        # issue queryset
        issue_queryset = issue_queryset_grouper(queryset=issue_queryset, group_by=group_by, sub_group_by=sub_group_by)

        if group_by:
            if sub_group_by:
                if group_by == sub_group_by:
                    return Response(
                        {
                            "error": "Group by and sub group by cannot have same parameters"  # noqa: E501
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                else:
                    return self.paginate(
                        request=request,
                        order_by=order_by_param,
                        queryset=issue_queryset,
                        total_count_queryset=total_issue_queryset,
                        on_results=lambda issues: issue_on_results(
                            group_by=group_by, issues=issues, sub_group_by=sub_group_by
                        ),
                        paginator_cls=SubGroupedOffsetPaginator,
                        group_by_fields=issue_group_values(
                            field=group_by,
                            slug=slug,
                            filters=filters,
                            queryset=total_issue_queryset,
                        ),
                        sub_group_by_fields=issue_group_values(
                            field=sub_group_by,
                            slug=slug,
                            filters=filters,
                            queryset=total_issue_queryset,
                        ),
                        group_by_field_name=group_by,
                        sub_group_by_field_name=sub_group_by,
                        count_filter=Q(
                            Q(issue_intake__status=1)
                            | Q(issue_intake__status=-1)
                            | Q(issue_intake__status=2)
                            | Q(issue_intake__isnull=True),
                            archived_at__isnull=True,
                            is_draft=False,
                        ),
                    )
            else:
                # Group paginate
                return self.paginate(
                    request=request,
                    order_by=order_by_param,
                    queryset=issue_queryset,
                    total_count_queryset=total_issue_queryset,
                    on_results=lambda issues: issue_on_results(
                        group_by=group_by, issues=issues, sub_group_by=sub_group_by
                    ),
                    paginator_cls=GroupedOffsetPaginator,
                    group_by_fields=issue_group_values(
                        field=group_by,
                        slug=slug,
                        filters=filters,
                        queryset=total_issue_queryset,
                    ),
                    group_by_field_name=group_by,
                    count_filter=Q(
                        Q(issue_intake__status=1)
                        | Q(issue_intake__status=-1)
                        | Q(issue_intake__status=2)
                        | Q(issue_intake__isnull=True),
                        archived_at__isnull=True,
                        is_draft=False,
                    ),
                )
        else:
            return self.paginate(
                order_by=order_by_param,
                request=request,
                queryset=issue_queryset,
                total_count_queryset=total_issue_queryset,
                on_results=lambda issues: issue_on_results(group_by=group_by, issues=issues, sub_group_by=sub_group_by),
            )


class WorkspaceUserPropertiesEndpoint(BaseAPIView):
    @allow_workspace_member
    def patch(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)

        (workspace_properties, _) = WorkspaceUserProperties.objects.get_or_create(
            user=request.user, workspace_id=workspace.id
        )

        serializer = WorkspaceUserPropertiesSerializer(workspace_properties, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_workspace_member
    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)

        (workspace_properties, _) = WorkspaceUserProperties.objects.get_or_create(
            user=request.user, workspace=workspace
        )

        serializer = WorkspaceUserPropertiesSerializer(workspace_properties)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WorkspaceUserProfileEndpoint(BaseAPIView):
    @allow_workspace_self_or_permission(PermissionKey.WORKSPACE_USER_PROFILE_VIEW)
    def get(self, request, slug, user_id):
        user_data = User.objects.get(pk=user_id)

        projects = []
        can_view_project_contributions = True
        if can_view_project_contributions:
            projects = (
                Project.objects.filter(
                    workspace__slug=slug,
                    project_projectmember__member=request.user,
                    project_projectmember__is_active=True,
                    project_projectmember__deleted_at__isnull=True,
                    archived_at__isnull=True,
                )
                .annotate(
                    created_issues=Count(
                        "project_issue",
                        filter=Q(
                            project_issue__created_by_id=user_id,
                            project_issue__deleted_at__isnull=True,
                            project_issue__archived_at__isnull=True,
                            project_issue__is_draft=False,
                        ),
                        distinct=True,
                    )
                )
                .annotate(
                    assigned_issues=Count(
                        "project_issue",
                        filter=Q(
                            project_issue__issue_assignee__assignee_id=user_id,
                            project_issue__issue_assignee__deleted_at__isnull=True,
                            project_issue__deleted_at__isnull=True,
                            project_issue__archived_at__isnull=True,
                            project_issue__is_draft=False,
                        ),
                        distinct=True,
                    )
                )
                .annotate(
                    completed_issues=Count(
                        "project_issue",
                        filter=Q(
                            project_issue__state__group="completed",
                            project_issue__issue_assignee__assignee_id=user_id,
                            project_issue__issue_assignee__deleted_at__isnull=True,
                            project_issue__deleted_at__isnull=True,
                            project_issue__archived_at__isnull=True,
                            project_issue__is_draft=False,
                        ),
                        distinct=True,
                    )
                )
                .annotate(
                    pending_issues=Count(
                        "project_issue",
                        filter=Q(
                            project_issue__state__group__in=[
                                "backlog",
                                "unstarted",
                                "started",
                            ],
                            project_issue__issue_assignee__assignee_id=user_id,
                            project_issue__issue_assignee__deleted_at__isnull=True,
                            project_issue__deleted_at__isnull=True,
                            project_issue__archived_at__isnull=True,
                            project_issue__is_draft=False,
                        ),
                        distinct=True,
                    )
                )
                .values(
                    "id",
                    "logo_props",
                    "created_issues",
                    "assigned_issues",
                    "completed_issues",
                    "pending_issues",
                )
            )

        return Response(
            {
                "can_view_project_contributions": can_view_project_contributions,
                "project_data": projects,
                "user_data": {
                    "email": user_data.email,
                    "first_name": user_data.first_name,
                    "last_name": user_data.last_name,
                    "avatar_url": user_data.avatar_url,
                    "cover_image_url": user_data.cover_image_url,
                    "date_joined": user_data.date_joined,
                    "user_timezone": user_data.user_timezone,
                    "display_name": user_data.display_name,
                },
            },
            status=status.HTTP_200_OK,
        )


class WorkspaceUserActivityEndpoint(BaseAPIView):
    @allow_workspace_self_or_permission(PermissionKey.WORKSPACE_USER_PROFILE_VIEW)
    def get(self, request, slug, user_id):
        projects = request.query_params.getlist("project", [])

        queryset = IssueActivity.objects.filter(
            ~Q(field__in=["comment", "vote", "reaction", "draft"]),
            workspace__slug=slug,
            project__project_projectmember__member=request.user,
            project__project_projectmember__is_active=True,
            project__archived_at__isnull=True,
            actor=user_id,
        ).select_related("actor", "workspace", "issue", "project")

        if projects:
            queryset = queryset.filter(project__in=projects)

        return self.paginate(
            order_by=request.GET.get("order_by", "-created_at"),
            request=request,
            queryset=queryset,
            on_results=lambda issue_activities: IssueActivitySerializer(issue_activities, many=True).data,
        )


class WorkspaceUserProfileStatsEndpoint(BaseAPIView):
    @allow_workspace_self_or_permission(PermissionKey.WORKSPACE_USER_PROFILE_VIEW)
    def get(self, request, slug, user_id):
        filters = issue_filters(request.query_params, "GET")
        today = timezone.now().date()
        week_start = today - timedelta(days=today.weekday())
        week_end = today + timedelta(days=6 - today.weekday())

        metric_counts = {
            metric: get_profile_metric_queryset(metric, slug, user_id, request.user).count()
            for metric in PROFILE_METRIC_KEYS
        }

        state_distribution = (
            Issue.issue_objects.filter(
                (Q(assignees__in=[user_id]) & Q(issue_assignee__deleted_at__isnull=True)),
                workspace__slug=slug,
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
            )
            .filter(**filters)
            .annotate(state_group=F("state__group"))
            .values("state_group")
            .annotate(state_count=Count("state_group"))
            .order_by("state_group")
        )

        priority_order = ["urgent", "high", "medium", "low", "none"]

        priority_distribution = (
            Issue.issue_objects.filter(
                (Q(assignees__in=[user_id]) & Q(issue_assignee__deleted_at__isnull=True)),
                workspace__slug=slug,
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
            )
            .filter(**filters)
            .values("priority")
            .annotate(priority_count=Count("priority"))
            .filter(priority_count__gte=1)
            .annotate(
                priority_order=Case(
                    *[When(priority=p, then=Value(i)) for i, p in enumerate(priority_order)],
                    default=Value(len(priority_order)),
                    output_field=IntegerField(),
                )
            )
            .order_by("priority_order")
        )

        pending_issues_count = (
            Issue.issue_objects.filter(
                ~Q(state__group__in=["completed", "cancelled"]),
                (Q(assignees__in=[user_id]) & Q(issue_assignee__deleted_at__isnull=True)),
                workspace__slug=slug,
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
            )
            .filter(**filters)
            .count()
        )

        completed_issues_count = (
            Issue.issue_objects.filter(
                (Q(assignees__in=[user_id]) & Q(issue_assignee__deleted_at__isnull=True)),
                workspace__slug=slug,
                state__group="completed",
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
            )
            .filter(**filters)
            .count()
        )

        high_priority_pending_issues_count = (
            Issue.issue_objects.filter(
                ~Q(state__group__in=["completed", "cancelled"]),
                (Q(assignees__in=[user_id]) & Q(issue_assignee__deleted_at__isnull=True)),
                workspace__slug=slug,
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
                priority__in=["urgent", "high"],
            )
            .filter(**filters)
            .count()
        )

        completed_today_issues_count = (
            Issue.issue_objects.filter(
                (Q(assignees__in=[user_id]) & Q(issue_assignee__deleted_at__isnull=True)),
                workspace__slug=slug,
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
                completed_at__date=today,
            )
            .filter(**filters)
            .count()
        )

        completed_this_week_issues_count = (
            Issue.issue_objects.filter(
                (Q(assignees__in=[user_id]) & Q(issue_assignee__deleted_at__isnull=True)),
                workspace__slug=slug,
                project__project_projectmember__member=request.user,
                project__project_projectmember__is_active=True,
                completed_at__date__gte=week_start,
                completed_at__date__lte=week_end,
            )
            .filter(**filters)
            .count()
        )

        upcoming_cycles = CycleIssue.objects.filter(
            workspace__slug=slug,
            cycle__start_date__gt=timezone.now(),
            issue__assignees__in=[user_id],
        ).values("cycle__name", "cycle__id", "cycle__project_id")

        present_cycle = CycleIssue.objects.filter(
            workspace__slug=slug,
            cycle__start_date__lt=timezone.now(),
            cycle__end_date__gt=timezone.now(),
            issue__assignees__in=[user_id],
        ).values("cycle__name", "cycle__id", "cycle__project_id")

        return Response(
            {
                "state_distribution": state_distribution,
                "priority_distribution": priority_distribution,
                "created_issues": metric_counts["created_issues"],
                "assigned_issues": metric_counts["assigned_issues"],
                "completed_issues": completed_issues_count,
                "pending_issues": pending_issues_count,
                "subscribed_issues": metric_counts["subscribed_issues"],
                "open_assigned_issues": metric_counts["open_assigned_issues"],
                "open_created_issues": metric_counts["open_created_issues"],
                "open_subscribed_issues": metric_counts["open_subscribed_issues"],
                "overdue_issues": metric_counts["overdue_issues"],
                "today_pending_issues": metric_counts["today_pending_issues"],
                "week_pending_issues": metric_counts["week_pending_issues"],
                "high_priority_pending_issues": high_priority_pending_issues_count,
                "completed_today_issues": completed_today_issues_count,
                "completed_this_week_issues": completed_this_week_issues_count,
                "unscheduled_pending_issues": metric_counts["unscheduled_pending_issues"],
                "responsible_cycles": metric_counts["responsible_cycles"],
                "responsible_releases": metric_counts["responsible_releases"],
                "pending_approval_issues": metric_counts["pending_approval_issues"],
                "pending_execution_cases": metric_counts["pending_execution_cases"],
                "pending_review_cases": metric_counts["pending_review_cases"],
                "present_cycles": present_cycle,
                "upcoming_cycles": upcoming_cycles,
            }
        )


class WorkspaceUserProfileMetricTreeEndpoint(BaseAPIView):
    @allow_workspace_self_or_permission(PermissionKey.WORKSPACE_USER_PROFILE_VIEW)
    def get(self, request, slug, user_id, metric):
        query_serializer = WorkspaceUserMetricQuerySerializer(
            data=request.query_params,
            context={"metric": metric},
        )
        query_serializer.is_valid(raise_exception=True)

        queryset = get_profile_metric_queryset(metric, slug, user_id, request.user)
        return Response(
            {
                "count": queryset.count(),
                "nodes": build_profile_metric_tree(queryset, metric),
            },
            status=status.HTTP_200_OK,
        )


class WorkspaceUserProfileMetricItemsEndpoint(BaseAPIView):
    @allow_workspace_self_or_permission(PermissionKey.WORKSPACE_USER_PROFILE_VIEW)
    def get(self, request, slug, user_id, metric):
        query_serializer = WorkspaceUserMetricQuerySerializer(
            data=request.query_params,
            context={"metric": metric},
        )
        query_serializer.is_valid(raise_exception=True)
        params = query_serializer.validated_data

        queryset = get_profile_metric_queryset(metric, slug, user_id, request.user)
        queryset = apply_profile_metric_filters(
            queryset,
            metric,
            project_id=params.get("project_id"),
            plan_id=params.get("plan_id"),
            review_id=params.get("review_id"),
        ).order_by("-created_at")

        total_count = queryset.count()
        start = (params["page"] - 1) * params["page_size"]
        end = start + params["page_size"]
        items = queryset[start:end]
        data = WorkspaceUserMetricItemSerializer(
            items,
            many=True,
            context={"metric": metric},
        ).data

        return Response(
            {"count": total_count, "data": data},
            status=status.HTTP_200_OK,
        )


class UserActivityGraphEndpoint(BaseAPIView):
    @allow_workspace_member
    def get(self, request, slug):
        issue_activities = (
            IssueActivity.objects.filter(
                actor=request.user,
                workspace__slug=slug,
                created_at__date__gte=date.today() + relativedelta(months=-6),
            )
            .annotate(created_date=Cast("created_at", DateField()))
            .values("created_date")
            .annotate(activity_count=Count("created_date"))
            .order_by("created_date")
        )

        return Response(issue_activities, status=status.HTTP_200_OK)


class UserIssueCompletedGraphEndpoint(BaseAPIView):
    @allow_workspace_member
    def get(self, request, slug):
        month = request.GET.get("month", 1)

        issues = (
            Issue.issue_objects.filter(
                assignees__in=[request.user],
                workspace__slug=slug,
                completed_at__month=month,
                completed_at__isnull=False,
            )
            .annotate(completed_week=ExtractWeek("completed_at"))
            .annotate(week=F("completed_week") % 4)
            .values("week")
            .annotate(completed_count=Count("completed_week"))
            .order_by("week")
        )

        return Response(issues, status=status.HTTP_200_OK)
