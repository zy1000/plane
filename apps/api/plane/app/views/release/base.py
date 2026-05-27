# Python imports
import json

# Django Imports
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models import (
    BooleanField,
    Case,
    CharField,
    Count,
    Exists,
    F,
    FloatField,
    Func,
    IntegerField,
    OuterRef,
    Prefetch,
    Q,
    Subquery,
    Sum,
    UUIDField,
    Value,
    When,
)
from django.db import models, transaction
from django.db.models.functions import Coalesce, Cast, Concat
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

# Module imports
from plane.app.permissions import (
    ProjectEntityPermission,
    ProjectLitePermission,
    allow_permission,
    ROLE,
    allow_fine_permission,
    PermissionKey,
)

from plane.app.serializers import (
    ReleaseDetailSerializer,
    ReleaseLinkSerializer,
    ReleaseSerializer,
    ReleaseUserPropertiesSerializer,
    ReleaseWriteSerializer,
    ReleaseOverdueRecordSerializer,
    CycleSerializer,
)
from plane.app.serializers.qa import TestPlanDetailSerializer
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import (
    Issue,
    IssueAssignee,
    Release,
    UserFavorite,
    ReleaseIssue,
    ReleaseLink,
    ReleaseUserProperties,
    ReleaseOverdueRecord,
    ReleaseOverduePhase,
    Project,
    ProjectMember,
    User,
    UserRecentVisit,
    Cycle,
    CycleIssue,
    TestPlan,
    PlanCase,
)
from plane.utils.release.overdue_strategy import (
    sync_overdue_on_status_change,
    sync_overdue_on_date_change,
)
from plane.utils.analytics_plot import burndown_plot
from plane.utils.paginator import CustomPaginator
from plane.utils.response import list_response
from plane.utils.timezone_converter import user_timezone_converter
from plane.bgtasks.webhook_task import model_activity
from plane.bgtasks.entity_status_email_task import (
    dispatch_release_status_email,
    RELEASE_STATUS_EMAIL_WHITELIST,
)
from .. import BaseAPIView, BaseViewSet
from plane.bgtasks.recent_visited_task import recent_visited_task
from plane.utils.host import base_host


class ReleaseViewSet(BaseViewSet):
    model = Release
    webhook_event = "release"

    def get_serializer_class(self):
        return ReleaseWriteSerializer if self.action in ["create", "update", "partial_update"] else ReleaseSerializer

    def get_queryset(self):
        favorite_subquery = UserFavorite.objects.filter(
            user=self.request.user,
            entity_type="release",
            entity_identifier=OuterRef("pk"),
            project_id=self.kwargs.get("project_id"),
            workspace__slug=self.kwargs.get("slug"),
        )
        cancelled_issues = (
            Issue.issue_objects.filter(
                state__group="cancelled",
                issue_release__release_id=OuterRef("pk"),
                issue_release__deleted_at__isnull=True,
            )
            .values("issue_release__release_id")
            .annotate(cnt=Count("pk"))
            .values("cnt")
        )
        completed_issues = (
            Issue.issue_objects.filter(
                state__group="completed",
                issue_release__release_id=OuterRef("pk"),
                issue_release__deleted_at__isnull=True,
            )
            .values("issue_release__release_id")
            .annotate(cnt=Count("pk"))
            .values("cnt")
        )
        started_issues = (
            Issue.issue_objects.filter(
                state__group="started",
                issue_release__release_id=OuterRef("pk"),
                issue_release__deleted_at__isnull=True,
            )
            .values("issue_release__release_id")
            .annotate(cnt=Count("pk"))
            .values("cnt")
        )
        unstarted_issues = (
            Issue.issue_objects.filter(
                state__group="unstarted",
                issue_release__release_id=OuterRef("pk"),
                issue_release__deleted_at__isnull=True,
            )
            .values("issue_release__release_id")
            .annotate(cnt=Count("pk"))
            .values("cnt")
        )
        backlog_issues = (
            Issue.issue_objects.filter(
                state__group="backlog",
                issue_release__release_id=OuterRef("pk"),
                issue_release__deleted_at__isnull=True,
            )
            .values("issue_release__release_id")
            .annotate(cnt=Count("pk"))
            .values("cnt")
        )
        total_issues = (
            Issue.issue_objects.filter(
                issue_release__release_id=OuterRef("pk"),
                issue_release__deleted_at__isnull=True,
            )
            .values("issue_release__release_id")
            .annotate(cnt=Count("pk"))
            .values("cnt")
        )
        completed_estimate_point = (
            Issue.issue_objects.filter(
                estimate_point__estimate__type="points",
                state__group="completed",
                issue_release__release_id=OuterRef("pk"),
                issue_release__deleted_at__isnull=True,
            )
            .values("issue_release__release_id")
            .annotate(completed_estimate_points=Sum(Cast("estimate_point__value", FloatField())))
            .values("completed_estimate_points")[:1]
        )

        total_estimate_point = (
            Issue.issue_objects.filter(
                estimate_point__estimate__type="points",
                issue_release__release_id=OuterRef("pk"),
                issue_release__deleted_at__isnull=True,
            )
            .values("issue_release__release_id")
            .annotate(total_estimate_points=Sum(Cast("estimate_point__value", FloatField())))
            .values("total_estimate_points")[:1]
        )
        backlog_estimate_point = (
            Issue.issue_objects.filter(
                estimate_point__estimate__type="points",
                state__group="backlog",
                issue_release__release_id=OuterRef("pk"),
                issue_release__deleted_at__isnull=True,
            )
            .values("issue_release__release_id")
            .annotate(backlog_estimate_point=Sum(Cast("estimate_point__value", FloatField())))
            .values("backlog_estimate_point")[:1]
        )
        unstarted_estimate_point = (
            Issue.issue_objects.filter(
                estimate_point__estimate__type="points",
                state__group="unstarted",
                issue_release__release_id=OuterRef("pk"),
                issue_release__deleted_at__isnull=True,
            )
            .values("issue_release__release_id")
            .annotate(unstarted_estimate_point=Sum(Cast("estimate_point__value", FloatField())))
            .values("unstarted_estimate_point")[:1]
        )
        started_estimate_point = (
            Issue.issue_objects.filter(
                estimate_point__estimate__type="points",
                state__group="started",
                issue_release__release_id=OuterRef("pk"),
                issue_release__deleted_at__isnull=True,
            )
            .values("issue_release__release_id")
            .annotate(started_estimate_point=Sum(Cast("estimate_point__value", FloatField())))
            .values("started_estimate_point")[:1]
        )
        cancelled_estimate_point = (
            Issue.issue_objects.filter(
                estimate_point__estimate__type="points",
                state__group="cancelled",
                issue_release__release_id=OuterRef("pk"),
                issue_release__deleted_at__isnull=True,
            )
            .values("issue_release__release_id")
            .annotate(cancelled_estimate_point=Sum(Cast("estimate_point__value", FloatField())))
            .values("cancelled_estimate_point")[:1]
        )
        active_overdue_subquery = ReleaseOverdueRecord.objects.filter(
            release_id=OuterRef("pk"),
            ended_at__isnull=True,
            deleted_at__isnull=True,
        )
        any_overdue_subquery = ReleaseOverdueRecord.objects.filter(
            release_id=OuterRef("pk"),
            deleted_at__isnull=True,
        )
        active_overdue_phase_subquery = (
            ReleaseOverdueRecord.objects.filter(
                release_id=OuterRef("pk"),
                ended_at__isnull=True,
                deleted_at__isnull=True,
            )
            .order_by("-started_at")
            .values("phase")[:1]
        )
        active_dev_overdue_subquery = ReleaseOverdueRecord.objects.filter(
            release_id=OuterRef("pk"),
            phase=ReleaseOverduePhase.DEV,
            ended_at__isnull=True,
            deleted_at__isnull=True,
        )
        active_test_overdue_subquery = ReleaseOverdueRecord.objects.filter(
            release_id=OuterRef("pk"),
            phase=ReleaseOverduePhase.TEST,
            ended_at__isnull=True,
            deleted_at__isnull=True,
        )
        any_dev_overdue_subquery = ReleaseOverdueRecord.objects.filter(
            release_id=OuterRef("pk"),
            phase=ReleaseOverduePhase.DEV,
            deleted_at__isnull=True,
        )
        any_test_overdue_subquery = ReleaseOverdueRecord.objects.filter(
            release_id=OuterRef("pk"),
            phase=ReleaseOverduePhase.TEST,
            deleted_at__isnull=True,
        )
        return (
            super()
            .get_queryset()
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(workspace__slug=self.kwargs.get("slug"))
            .annotate(is_favorite=Exists(favorite_subquery))
            .annotate(has_active_overdue=Exists(active_overdue_subquery))
            .annotate(has_overdue_history=Exists(any_overdue_subquery))
            .annotate(has_active_dev_overdue=Exists(active_dev_overdue_subquery))
            .annotate(has_active_test_overdue=Exists(active_test_overdue_subquery))
            .annotate(has_dev_overdue_history=Exists(any_dev_overdue_subquery))
            .annotate(has_test_overdue_history=Exists(any_test_overdue_subquery))
            .annotate(
                active_overdue_phase=Coalesce(
                    Subquery(active_overdue_phase_subquery, output_field=CharField()),
                    Value(None, output_field=CharField()),
                )
            )
            .prefetch_related("members")
            .prefetch_related(
                Prefetch(
                    "link_release",
                    queryset=ReleaseLink.objects.select_related("release", "created_by"),
                )
            )
            .annotate(
                completed_issues=Coalesce(
                    Subquery(completed_issues[:1]),
                    Value(0, output_field=IntegerField()),
                )
            )
            .annotate(
                cancelled_issues=Coalesce(
                    Subquery(cancelled_issues[:1]),
                    Value(0, output_field=IntegerField()),
                )
            )
            .annotate(started_issues=Coalesce(Subquery(started_issues[:1]), Value(0, output_field=IntegerField())))
            .annotate(
                unstarted_issues=Coalesce(
                    Subquery(unstarted_issues[:1]),
                    Value(0, output_field=IntegerField()),
                )
            )
            .annotate(backlog_issues=Coalesce(Subquery(backlog_issues[:1]), Value(0, output_field=IntegerField())))
            .annotate(total_issues=Coalesce(Subquery(total_issues[:1]), Value(0, output_field=IntegerField())))
            .annotate(
                backlog_estimate_points=Coalesce(
                    Subquery(backlog_estimate_point),
                    Value(0, output_field=FloatField()),
                )
            )
            .annotate(
                unstarted_estimate_points=Coalesce(
                    Subquery(unstarted_estimate_point),
                    Value(0, output_field=FloatField()),
                )
            )
            .annotate(
                started_estimate_points=Coalesce(
                    Subquery(started_estimate_point),
                    Value(0, output_field=FloatField()),
                )
            )
            .annotate(
                cancelled_estimate_points=Coalesce(
                    Subquery(cancelled_estimate_point),
                    Value(0, output_field=FloatField()),
                )
            )
            .annotate(
                completed_estimate_points=Coalesce(
                    Subquery(completed_estimate_point),
                    Value(0, output_field=FloatField()),
                )
            )
            .annotate(
                total_estimate_points=Coalesce(Subquery(total_estimate_point), Value(0, output_field=FloatField()))
            )
            .annotate(
                member_ids=Coalesce(
                    ArrayAgg(
                        "members__id",
                        distinct=True,
                        filter=Q(
                            members__id__isnull=False,
                            releasemember__deleted_at__isnull=True,
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                )
            )
            .order_by("-is_favorite", "-created_at")
        )

    @allow_fine_permission(PermissionKey.RELEASES_CREATE)
    def create(self, request, slug, project_id):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)
        serializer = ReleaseWriteSerializer(data=request.data, context={"project": project})

        if serializer.is_valid():
            serializer.save()

            release = (
                self.get_queryset()
                .filter(pk=serializer.data["id"])
                .values(
                    "id",
                    "workspace_id",
                    "project_id",
                    "name",
                    "description",
                    "description_text",
                    "description_html",
                    "start_date",
                    "target_date",
                    "test_handoff_date",
                    "status",
                    "lead_id",
                    "member_ids",
                    "view_props",
                    "sort_order",
                    "external_source",
                    "external_id",
                    "logo_props",
                    "is_favorite",
                    "cancelled_issues",
                    "completed_issues",
                    "total_issues",
                    "started_issues",
                    "unstarted_issues",
                    "completed_estimate_points",
                    "total_estimate_points",
                    "backlog_issues",
                    "created_at",
                    "updated_at",
                    "has_active_overdue",
                    "has_overdue_history",
                    "active_overdue_phase",
                    "has_active_dev_overdue",
                    "has_active_test_overdue",
                    "has_dev_overdue_history",
                    "has_test_overdue_history",
                )
            ).first()
            model_activity.delay(
                model_name="release",
                model_id=str(release["id"]),
                requested_data=request.data,
                current_instance=None,
                actor_id=request.user.id,
                slug=slug,
                origin=base_host(request=request, is_app=True),
            )
            datetime_fields = ["created_at", "updated_at"]
            release = user_timezone_converter(release, datetime_fields, request.user.user_timezone)
            return Response(release, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_fine_permission(PermissionKey.RELEASES_VIEW)
    def list(self, request, slug, project_id):
        queryset = self.get_queryset().filter(archived_at__isnull=True)
        from plane.utils.release.overdue_strategy import scan_releases_for_overdue
        scan_releases_for_overdue(queryset)
        if self.fields:
            releases = ReleaseSerializer(queryset, many=True, fields=self.fields).data
        else:
            releases = queryset.values(
                "id",
                "workspace_id",
                "project_id",
                "name",
                "description",
                "description_text",
                "description_html",
                "start_date",
                "target_date",
                "status",
                "lead_id",
                "member_ids",
                "view_props",
                "sort_order",
                "external_source",
                "external_id",
                "logo_props",
                "completed_estimate_points",
                "total_estimate_points",
                "total_issues",
                "is_favorite",
                "cancelled_issues",
                "completed_issues",
                "started_issues",
                "unstarted_issues",
                "backlog_issues",
                "created_at",
                "updated_at",
                "test_handoff_date",
                "has_active_overdue",
                "has_overdue_history",
                "active_overdue_phase",
                "has_active_dev_overdue",
                "has_active_test_overdue",
                "has_dev_overdue_history",
                "has_test_overdue_history",
            )
            datetime_fields = ["created_at", "updated_at"]
            releases = user_timezone_converter(releases, datetime_fields, request.user.user_timezone)
        return Response(releases, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.RELEASES_VIEW)
    def retrieve(self, request, slug, project_id, pk):
        queryset = (
            self.get_queryset()
            .filter(archived_at__isnull=True)
            .filter(pk=pk)
            .annotate(
                sub_issues=Issue.issue_objects.filter(
                    project_id=self.kwargs.get("project_id"),
                    parent__isnull=False,
                    issue_release__release_id=pk,
                    issue_release__deleted_at__isnull=True,
                )
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
        )

        if not queryset.exists():
            return Response({"error": "Release not found"}, status=status.HTTP_404_NOT_FOUND)

        estimate_type = Project.objects.filter(
            workspace__slug=slug,
            pk=project_id,
            estimate__isnull=False,
            estimate__type="points",
        ).exists()

        data = ReleaseDetailSerializer(queryset.first()).data
        release_obj = queryset.first()

        data["estimate_distribution"] = {}

        if estimate_type:
            assignee_distribution = (
                Issue.issue_objects.filter(
                    issue_release__release_id=pk,
                    issue_release__deleted_at__isnull=True,
                    workspace__slug=slug,
                    project_id=project_id,
                )
                .annotate(first_name=F("assignees__first_name"))
                .annotate(last_name=F("assignees__last_name"))
                .annotate(assignee_id=F("assignees__id"))
                .annotate(display_name=F("assignees__display_name"))
                .annotate(
                    avatar_url=Case(
                        When(
                            assignees__avatar_asset__isnull=False,
                            then=Concat(
                                Value("/api/assets/v2/static/"),
                                "assignees__avatar_asset",
                                Value("/"),
                            ),
                        ),
                        When(
                            assignees__avatar_asset__isnull=True,
                            then="assignees__avatar",
                        ),
                        default=Value(None),
                        output_field=models.CharField(),
                    )
                )
                .values(
                    "first_name",
                    "last_name",
                    "assignee_id",
                    "avatar_url",
                    "display_name",
                )
                .annotate(total_estimates=Sum(Cast("estimate_point__value", FloatField())))
                .annotate(
                    completed_estimates=Sum(
                        Cast("estimate_point__value", FloatField()),
                        filter=Q(
                            completed_at__isnull=False,
                            archived_at__isnull=True,
                            is_draft=False,
                        ),
                    )
                )
                .annotate(
                    pending_estimates=Sum(
                        Cast("estimate_point__value", FloatField()),
                        filter=Q(
                            completed_at__isnull=True,
                            archived_at__isnull=True,
                            is_draft=False,
                        ),
                    )
                )
                .order_by("first_name", "last_name")
            )

            label_distribution = (
                Issue.issue_objects.filter(
                    issue_release__release_id=pk,
                    issue_release__deleted_at__isnull=True,
                    workspace__slug=slug,
                    project_id=project_id,
                )
                .annotate(label_name=F("labels__name"))
                .annotate(color=F("labels__color"))
                .annotate(label_id=F("labels__id"))
                .values("label_name", "color", "label_id")
                .annotate(total_estimates=Sum(Cast("estimate_point__value", FloatField())))
                .annotate(
                    completed_estimates=Sum(
                        Cast("estimate_point__value", FloatField()),
                        filter=Q(
                            completed_at__isnull=False,
                            archived_at__isnull=True,
                            is_draft=False,
                        ),
                    )
                )
                .annotate(
                    pending_estimates=Sum(
                        Cast("estimate_point__value", FloatField()),
                        filter=Q(
                            completed_at__isnull=True,
                            archived_at__isnull=True,
                            is_draft=False,
                        ),
                    )
                )
                .order_by("label_name")
            )
            data["estimate_distribution"]["assignees"] = assignee_distribution
            data["estimate_distribution"]["labels"] = label_distribution

            if release_obj and release_obj.start_date and release_obj.target_date:
                data["estimate_distribution"]["completion_chart"] = burndown_plot(
                    queryset=release_obj,
                    slug=slug,
                    project_id=project_id,
                    plot_type="points",
                    module_id=pk,
                )

        assignee_distribution = (
            Issue.issue_objects.filter(
                issue_release__release_id=pk,
                issue_release__deleted_at__isnull=True,
                workspace__slug=slug,
                project_id=project_id,
            )
            .annotate(first_name=F("assignees__first_name"))
            .annotate(last_name=F("assignees__last_name"))
            .annotate(assignee_id=F("assignees__id"))
            .annotate(display_name=F("assignees__display_name"))
            .annotate(
                avatar_url=Case(
                    When(
                        assignees__avatar_asset__isnull=False,
                        then=Concat(
                            Value("/api/assets/v2/static/"),
                            "assignees__avatar_asset",
                            Value("/"),
                        ),
                    ),
                    When(assignees__avatar_asset__isnull=True, then="assignees__avatar"),
                    default=Value(None),
                    output_field=models.CharField(),
                )
            )
            .values("first_name", "last_name", "assignee_id", "avatar_url", "display_name")
            .annotate(total_issues=Count("id", filter=Q(archived_at__isnull=True, is_draft=False)))
            .annotate(
                completed_issues=Count(
                    "id",
                    filter=Q(
                        completed_at__isnull=False,
                        archived_at__isnull=True,
                        is_draft=False,
                    ),
                )
            )
            .annotate(
                pending_issues=Count(
                    "id",
                    filter=Q(
                        completed_at__isnull=True,
                        archived_at__isnull=True,
                        is_draft=False,
                    ),
                )
            )
            .order_by("first_name", "last_name")
        )

        label_distribution = (
            Issue.issue_objects.filter(
                issue_release__release_id=pk,
                issue_release__deleted_at__isnull=True,
                workspace__slug=slug,
                project_id=project_id,
            )
            .annotate(label_name=F("labels__name"))
            .annotate(color=F("labels__color"))
            .annotate(label_id=F("labels__id"))
            .values("label_name", "color", "label_id")
            .annotate(total_issues=Count("id", filter=Q(archived_at__isnull=True, is_draft=False)))
            .annotate(
                completed_issues=Count(
                    "id",
                    filter=Q(
                        completed_at__isnull=False,
                        archived_at__isnull=True,
                        is_draft=False,
                    ),
                )
            )
            .annotate(
                pending_issues=Count(
                    "id",
                    filter=Q(
                        completed_at__isnull=True,
                        archived_at__isnull=True,
                        is_draft=False,
                    ),
                )
            )
            .order_by("label_name")
        )

        data["distribution"] = {
            "assignees": assignee_distribution,
            "labels": label_distribution,
            "completion_chart": {},
        }

        if release_obj and release_obj.start_date and release_obj.target_date and release_obj.total_issues > 0:
            data["distribution"]["completion_chart"] = burndown_plot(
                queryset=release_obj,
                slug=slug,
                project_id=project_id,
                plot_type="issues",
                module_id=pk,
            )

        recent_visited_task.delay(
            slug=slug,
            entity_name="release",
            entity_identifier=pk,
            user_id=request.user.id,
            project_id=project_id,
        )

        return Response(data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.RELEASES_EDIT)
    def partial_update(self, request, slug, project_id, pk):
        release_queryset = self.get_queryset().filter(pk=pk)

        current_release = release_queryset.first()

        if not current_release:
            return Response(
                {"error": "Release not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        if current_release.archived_at:
            return Response(
                {"error": "Archived release cannot be updated"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        current_instance = json.dumps(ReleaseSerializer(current_release).data, cls=DjangoJSONEncoder)
        previous_status = current_release.status
        previous_test_handoff_date = current_release.test_handoff_date
        previous_target_date = current_release.target_date
        serializer = ReleaseWriteSerializer(current_release, data=request.data, partial=True,context={'user': request.user})


        if serializer.is_valid():
            updated_release = serializer.save()

            new_status = updated_release.status
            if new_status and new_status != previous_status:
                sync_overdue_on_status_change(updated_release, previous_status, new_status)
            sync_overdue_on_date_change(
                updated_release,
                prev_handoff=previous_test_handoff_date,
                prev_target=previous_target_date,
            )

            release = release_queryset.values(
                "id",
                "workspace_id",
                "project_id",
                "name",
                "description",
                "description_text",
                "description_html",
                "start_date",
                "target_date",
                "test_handoff_date",
                "status",
                "lead_id",
                "member_ids",
                "view_props",
                "sort_order",
                "external_source",
                "external_id",
                "logo_props",
                "completed_estimate_points",
                "total_estimate_points",
                "is_favorite",
                "cancelled_issues",
                "completed_issues",
                "started_issues",
                "total_issues",
                "unstarted_issues",
                "backlog_issues",
                "created_at",
                "updated_at",
                "has_active_overdue",
                "has_overdue_history",
                "active_overdue_phase",
                "has_active_dev_overdue",
                "has_active_test_overdue",
                "has_dev_overdue_history",
                "has_test_overdue_history",
            ).first()

            model_activity.delay(
                model_name="release",
                model_id=str(release["id"]),
                requested_data=request.data,
                current_instance=current_instance,
                actor_id=request.user.id,
                slug=slug,
                origin=base_host(request=request, is_app=True),
            )

            if (
                new_status
                and new_status != previous_status
                and new_status in RELEASE_STATUS_EMAIL_WHITELIST
            ):
                dispatch_release_status_email.delay(
                    release_id=str(release["id"]),
                    actor_id=str(request.user.id),
                    old_status=previous_status,
                    new_status=new_status,
                    origin=base_host(request=request, is_app=True),
                )

            datetime_fields = ["created_at", "updated_at"]
            release = user_timezone_converter(release, datetime_fields, request.user.user_timezone)
            return Response(release, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_fine_permission(PermissionKey.RELEASES_VIEW)
    def overdues(self, request, slug, project_id, pk):
        """返回该发布的逾期记录列表（含已结束记录），最新优先。"""
        if not Release.objects.filter(
            workspace__slug=slug, project_id=project_id, pk=pk
        ).exists():
            return Response({"error": "Release not found"}, status=status.HTTP_404_NOT_FOUND)

        records = ReleaseOverdueRecord.objects.filter(
            release_id=pk,
            project_id=project_id,
            workspace__slug=slug,
            deleted_at__isnull=True,
        ).order_by("-started_at")
        serializer = ReleaseOverdueRecordSerializer(records, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.RELEASES_DELETE)
    def destroy(self, request, slug, project_id, pk):
        release = Release.objects.get(workspace__slug=slug, project_id=project_id, pk=pk)

        release_issues = list(ReleaseIssue.objects.filter(release_id=pk).values_list("issue", flat=True))
        _ = [
            issue_activity.delay(
                type="release.activity.deleted",
                requested_data=json.dumps({"release_id": str(pk)}),
                actor_id=str(request.user.id),
                issue_id=str(issue),
                project_id=project_id,
                current_instance=json.dumps({"release_name": str(release.name)}),
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
            )
            for issue in release_issues
        ]
        release.delete()
        ReleaseIssue.objects.filter(release=pk, project_id=project_id).delete()
        UserFavorite.objects.filter(
            user=request.user,
            entity_type="release",
            entity_identifier=pk,
            project_id=project_id,
        ).delete()
        UserRecentVisit.objects.filter(
            project_id=project_id,
            workspace__slug=slug,
            entity_identifier=pk,
            entity_name="release",
        ).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReleaseLinkViewSet(BaseViewSet):
    permission_classes = [ProjectEntityPermission]

    model = ReleaseLink
    serializer_class = ReleaseLinkSerializer

    def perform_create(self, serializer):
        serializer.save(
            project_id=self.kwargs.get("project_id"),
            release_id=self.kwargs.get("release_id"),
        )

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(release_id=self.kwargs.get("release_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .order_by("-created_at")
            .distinct()
        )


class ReleaseFavoriteViewSet(BaseViewSet):
    model = UserFavorite
    permission_classes = [ProjectLitePermission]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(user=self.request.user)
            .select_related("release")
        )

    def create(self, request, slug, project_id):
        _ = UserFavorite.objects.create(
            project_id=project_id,
            user=request.user,
            entity_type="release",
            entity_identifier=request.data.get("release"),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    def destroy(self, request, slug, project_id, release_id):
        release_favorite = UserFavorite.objects.get(
            project_id=project_id,
            user=request.user,
            workspace__slug=slug,
            entity_type="release",
            entity_identifier=release_id,
        )
        release_favorite.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReleaseUserPropertiesEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def patch(self, request, slug, project_id, release_id):
        release_properties = ReleaseUserProperties.objects.get(
            user=request.user,
            release_id=release_id,
            project_id=project_id,
            workspace__slug=slug,
        )

        release_properties.filters = request.data.get("filters", release_properties.filters)
        release_properties.rich_filters = request.data.get("rich_filters", release_properties.rich_filters)
        release_properties.display_filters = request.data.get("display_filters", release_properties.display_filters)
        release_properties.display_properties = request.data.get(
            "display_properties", release_properties.display_properties
        )
        release_properties.save()

        serializer = ReleaseUserPropertiesSerializer(release_properties)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, release_id):
        release_properties, _ = ReleaseUserProperties.objects.get_or_create(
            user=request.user,
            project_id=project_id,
            release_id=release_id,
            workspace__slug=slug,
        )
        serializer = ReleaseUserPropertiesSerializer(release_properties)
        return Response(serializer.data, status=status.HTTP_200_OK)


class ReleaseAPI(BaseViewSet):
    pagination_class = CustomPaginator

    @allow_fine_permission(PermissionKey.RELEASES_EDIT)
    @action(detail=False, methods=["post"], url_path="associate-cycle")
    def associate_cycle(self, request, slug, project_id):
        release_id = request.data.get("release_id")
        cycle_id = request.data.get("cycle_id")

        if not release_id or not cycle_id:
            return Response({"error": "release_id and cycle_id are required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            cycle_info = Cycle.objects.values("project_id", "workspace_id").get(id=cycle_id)
        except Cycle.DoesNotExist:
            return Response({"error": "Cycle not found"}, status=status.HTTP_404_NOT_FOUND)

        if not Release.objects.filter(id=release_id, project_id=cycle_info["project_id"]).exists():
            return Response({"error": "Release not found in cycle's project"}, status=status.HTTP_404_NOT_FOUND)

        with transaction.atomic():
            Cycle.objects.filter(id=cycle_id).update(release_id=release_id)

            issue_rows = list(
                CycleIssue.objects.filter(cycle_id=cycle_id).values("issue_id", "project_id", "workspace_id")
            )

            if not issue_rows:
                return Response(
                    {"release_id": release_id, "cycle_id": cycle_id, "created": 0},
                    status=status.HTTP_201_CREATED,
                )

            existing_issue_ids = set(
                ReleaseIssue.objects.filter(release_id=release_id, project_id=cycle_info["project_id"]).values_list(
                    "issue_id", flat=True
                )
            )

            to_create = [
                ReleaseIssue(
                    project_id=row["project_id"],
                    workspace_id=row["workspace_id"],
                    issue_id=row["issue_id"],
                    release_id=release_id,
                )
                for row in issue_rows
                if row["issue_id"] not in existing_issue_ids
            ]

            if to_create:
                ReleaseIssue.objects.bulk_create(to_create, batch_size=1000)

        return Response(
            {"release_id": release_id, "cycle_id": cycle_id, "created": len(to_create)},
            status=status.HTTP_201_CREATED,
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    @action(detail=False, methods=["get"], url_path="select-cycle-list")
    def select_cycle_list(self, request, slug, project_id):
        query = Cycle.objects.filter(workspace__slug=slug, project=project_id, release__isnull=True)
        paginator = self.pagination_class()
        paginated_queryset = paginator.paginate_queryset(query, request)
        serializer = CycleSerializer(paginated_queryset, many=True)
        return list_response(data=serializer.data, count=query.count())

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    @action(detail=False, methods=["get"], url_path="cycles")
    def cycle_list(self, request, slug, project_id):
        release_id = request.query_params.get("release_id")
        query = Cycle.objects.filter(workspace__slug=slug, project=project_id, release_id=release_id)
        serializer = CycleSerializer(query, many=True)
        return Response(data=serializer.data)

    @allow_fine_permission(PermissionKey.RELEASES_EDIT)
    @action(detail=False, methods=["post"], url_path="cancel-cycle")
    def cancel_cycle(self, request, slug, project_id):
        release_id = request.data.get("release_id")
        cycle_id = request.data.get("cycle_id")

        Cycle.objects.filter(id=cycle_id).update(release_id=None)

        cycle_issue_query = CycleIssue.objects.filter(cycle_id=cycle_id).values_list('issue_id', flat=True)
        ReleaseIssue.objects.filter(release_id=release_id, issue_id__in=cycle_issue_query).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    @action(detail=False, methods=["get"], url_path="statistics")
    def statistics(self, request, slug, project_id):
        release_id = request.GET.get("release_id")
        if not release_id:
            return Response(
                {"error": "Release ID is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        issues = Issue.objects.filter(
            issue_release__release_id=release_id,
            issue_release__deleted_at__isnull=True,
            project_id=project_id,
            workspace__slug=slug,
            archived_at__isnull=True,
            is_draft=False,
            deleted_at__isnull=True,
        ).select_related('state', 'type').distinct()

        total_count = issues.count()
        state_distribution = issues.aggregate(
            backlog=Count('id', filter=Q(state__group='backlog'), distinct=True),
            unstarted=Count('id', filter=Q(state__group='unstarted'), distinct=True),
            started=Count('id', filter=Q(state__group='started'), distinct=True),
            completed=Count('id', filter=Q(state__group='completed'), distinct=True),
            cancelled=Count('id', filter=Q(state__group='cancelled'), distinct=True),
        )

        type_stats = (
            issues.values('type__id', 'type__name')
            .annotate(
                total=Count('id', distinct=True),
                backlog=Count('id', filter=Q(state__group='backlog'), distinct=True),
                unstarted=Count('id', filter=Q(state__group='unstarted'), distinct=True),
                started=Count('id', filter=Q(state__group='started'), distinct=True),
                completed=Count('id', filter=Q(state__group='completed'), distinct=True),
                cancelled=Count('id', filter=Q(state__group='cancelled'), distinct=True),
            )
            .order_by('type__name')
        )

        response_data = {
            "total_issues": total_count,
            "state_distribution": state_distribution,
            "type_distribution": list(type_stats),
        }

        return Response(response_data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    @action(detail=False, methods=["post"], url_path="note")
    def update_note(self, request, slug, project_id):
        release_id = request.data.get("release_id")
        note = request.data.get("note")
        Release.objects.filter(pk=release_id).update(note=note)
        return Response(status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    @action(detail=False, methods=["get"], url_path="plans")
    def plan_list(self, request, slug, project_id):
        release_id = request.query_params.get("release_id")
        if not release_id:
            return Response({"error": "release_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        plans = TestPlan.objects.filter(
            releases__id=release_id,
            deleted_at__isnull=True,
        )
        result = []
        for plan in plans:
            stats = dict(
                PlanCase.objects.filter(plan=plan)
                .values_list("result")
                .annotate(count=Count("result"))
                .values_list("result", "count")
            )
            pass_rate = {label: stats.get(label, 0) for label in PlanCase.Result.values}
            result.append(
                {
                    "id": str(plan.id),
                    "name": plan.name,
                    "state": plan.state,
                    "result": plan.result,
                    "begin_time": plan.begin_time,
                    "end_time": plan.end_time,
                    "pass_rate": pass_rate,
                }
            )
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=["get"], url_path="select-plan-list")
    def select_plan_list(self, request, slug, project_id):
        """返回当前项目下尚未关联到指定 release 的测试计划（用于发布 -> 关联测试计划弹窗）。"""
        release_id = request.query_params.get("release_id")
        if not release_id:
            return Response({"error": "release_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        plans = TestPlan.objects.filter(
            project_id=project_id,
            deleted_at__isnull=True,
        ).exclude(releases__id=release_id)

        serializer = TestPlanDetailSerializer(plans, many=True)
        return Response({"data": serializer.data, "count": plans.count()}, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.RELEASES_EDIT)
    @action(detail=False, methods=["post"], url_path="associate-plans")
    def associate_plans(self, request, slug, project_id):
        release_id = request.data.get("release_id")
        plan_ids = request.data.get("plan_ids") or []
        if not release_id:
            return Response({"error": "release_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(plan_ids, list) or len(plan_ids) == 0:
            return Response(
                {"error": "plan_ids must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        release = Release.objects.filter(id=release_id, project_id=project_id).first()
        if not release:
            return Response({"error": "Release not found"}, status=status.HTTP_404_NOT_FOUND)

        plans = list(
            TestPlan.objects.filter(
                project_id=project_id,
                deleted_at__isnull=True,
                id__in=plan_ids,
            )
        )
        if plans:
            release.plans.add(*plans)

        return Response({"release_id": str(release_id), "updated": len(plans)}, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.RELEASES_EDIT)
    @action(detail=False, methods=["post"], url_path="cancel-plan-association")
    def cancel_plan_association(self, request, slug, project_id):
        release_id = request.data.get("release_id")
        plan_ids = request.data.get("plan_ids") or []
        if not release_id:
            return Response({"error": "release_id is required"}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(plan_ids, list) or len(plan_ids) == 0:
            return Response(
                {"error": "plan_ids must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        release = Release.objects.filter(id=release_id, project_id=project_id).first()
        if not release:
            return Response({"error": "Release not found"}, status=status.HTTP_404_NOT_FOUND)

        plans = list(TestPlan.objects.filter(id__in=plan_ids))
        if plans:
            release.plans.remove(*plans)

        return Response({"release_id": str(release_id), "updated": len(plans)}, status=status.HTTP_200_OK)


class ReleaseOverdueByAssigneeEndpoint(BaseAPIView):
    """
    指定发布下：截止时间早于今天且未完成/未取消的工作项，按负责人聚合。
    响应结构与迭代 CycleOverdueByAssignee、项目统计 overdue_by_assignee 一致。
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, release_id):
        if not ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            member_id=request.user.id,
            is_active=True,
        ).exists():
            return Response({"error": "forbidden"}, status=status.HTTP_403_FORBIDDEN)

        if not Release.objects.filter(id=release_id, project_id=project_id, workspace__slug=slug).exists():
            return Response({"error": "Release not found"}, status=status.HTTP_404_NOT_FOUND)

        today = timezone.now().date()

        overdue_issue_qs = (
            Issue.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                issue_release__release_id=release_id,
                issue_release__deleted_at__isnull=True,
                archived_at__isnull=True,
                is_draft=False,
                deleted_at__isnull=True,
                target_date__isnull=False,
                target_date__lt=today,
            )
            .exclude(state__group__in=["completed", "cancelled"])
        )

        overdue_rows = list(
            overdue_issue_qs.filter(
                assignees__isnull=False,
                issue_assignee__deleted_at__isnull=True,
            )
            .values("assignees__id")
            .annotate(count=Count("id", distinct=True))
            .order_by("-count")
        )
        overdue_user_ids = [row["assignees__id"] for row in overdue_rows if row.get("assignees__id")]
        overdue_users = {
            str(user.id): user
            for user in User.objects.filter(id__in=overdue_user_ids).only(
                "id", "display_name", "first_name", "last_name", "avatar", "avatar_asset_id"
            )
        }

        overdue_by_assignee = []
        for row in overdue_rows:
            assignee_id = row.get("assignees__id")
            if not assignee_id:
                continue
            user = overdue_users.get(str(assignee_id))
            if not user:
                continue
            display_name = (
                user.display_name
                or f"{user.first_name or ''} {user.last_name or ''}".strip()
                or "-"
            )
            overdue_by_assignee.append(
                {
                    "assignee_id": str(user.id),
                    "display_name": display_name,
                    "avatar_url": user.avatar_url or "",
                    "count": row.get("count") or 0,
                }
            )

        active_assignee_exists = IssueAssignee.objects.filter(
            issue_id=OuterRef("pk"),
            deleted_at__isnull=True,
        )
        overdue_unassigned_count = overdue_issue_qs.filter(~Exists(active_assignee_exists)).count()
        if overdue_unassigned_count > 0:
            overdue_by_assignee.append(
                {
                    "assignee_id": None,
                    "display_name": "未指定负责人",
                    "avatar_url": "",
                    "count": overdue_unassigned_count,
                }
            )

        overdue_total = sum(item["count"] for item in overdue_by_assignee)

        return Response(
            {
                "total": overdue_total,
                "data": overdue_by_assignee,
            },
            status=status.HTTP_200_OK,
        )
