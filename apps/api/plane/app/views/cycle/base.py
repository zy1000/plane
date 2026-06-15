# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json
import pytz

# Django imports
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models import (
    Case,
    CharField,
    Count,
    Exists,
    F,
    Func,
    OuterRef,
    Prefetch,
    Q,
    Subquery,
    UUIDField,
    Value,
    When,
    Sum,
    FloatField,
)
from django.db import models
from django.db.models.functions import Coalesce, Cast, Concat
from django.utils import timezone
from django.core.serializers.json import DjangoJSONEncoder

# Third party imports
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from plane.app.permissions import allow_permission, ROLE, allow_fine_permission, PermissionKey
from plane.app.serializers import (
    CycleOverdueRecordSerializer,
    CycleSerializer,
    CycleUserPropertiesSerializer,
    CycleWriteSerializer,
)
from plane.app.serializers.qa import TestPlanDetailSerializer
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import (
    Cycle,
    CycleIssue,
    CycleOverduePhase,
    CycleOverdueRecord,
    UserFavorite,
    CycleUserProperties,
    Issue,
    IssueAssignee,
    Label,
    User,
    Project,
    ProjectMember,
    UserRecentVisit,
    TestPlan,
)
from plane.utils.analytics_plot import burndown_plot
from plane.bgtasks.recent_visited_task import recent_visited_task
from plane.utils.host import base_host
from plane.utils.cycle_transfer_issues import transfer_cycle_issues
from plane.utils.cycle_status import CYCLE_STATUS_EMAIL_WHITELIST
from .. import BaseAPIView, BaseViewSet
from plane.bgtasks.webhook_task import model_activity
from plane.bgtasks.cycle_activities_task import cycle_activity as cycle_activity_task
from plane.bgtasks.entity_status_email_task import (
    dispatch_cycle_created_email,
    dispatch_cycle_owner_email,
    dispatch_cycle_schedule_email,
    dispatch_cycle_status_email,
)
from plane.utils.cycle.overdue_strategy import (
    scan_cycles_for_overdue,
    sync_overdue_on_date_change,
    sync_overdue_on_status_change,
)
from plane.utils.timezone_converter import convert_to_utc, user_timezone_converter


class CycleViewSet(BaseViewSet):
    serializer_class = CycleSerializer
    model = Cycle
    webhook_event = "cycle"

    def get_queryset(self):
        favorite_subquery = UserFavorite.objects.filter(
            user=self.request.user,
            entity_identifier=OuterRef("pk"),
            entity_type="cycle",
            project_id=self.kwargs.get("project_id"),
            workspace__slug=self.kwargs.get("slug"),
        )
        active_overdue_subquery = CycleOverdueRecord.objects.filter(
            cycle_id=OuterRef("pk"),
            ended_at__isnull=True,
            deleted_at__isnull=True,
        )
        any_overdue_subquery = CycleOverdueRecord.objects.filter(
            cycle_id=OuterRef("pk"),
            deleted_at__isnull=True,
        )
        active_overdue_phase_subquery = (
            CycleOverdueRecord.objects.filter(
                cycle_id=OuterRef("pk"),
                ended_at__isnull=True,
                deleted_at__isnull=True,
            )
            .order_by("-started_at")
            .values("phase")[:1]
        )
        active_dev_overdue_subquery = CycleOverdueRecord.objects.filter(
            cycle_id=OuterRef("pk"),
            phase=CycleOverduePhase.DEV,
            ended_at__isnull=True,
            deleted_at__isnull=True,
        )
        active_test_overdue_subquery = CycleOverdueRecord.objects.filter(
            cycle_id=OuterRef("pk"),
            phase=CycleOverduePhase.TEST,
            ended_at__isnull=True,
            deleted_at__isnull=True,
        )
        any_dev_overdue_subquery = CycleOverdueRecord.objects.filter(
            cycle_id=OuterRef("pk"),
            phase=CycleOverduePhase.DEV,
            deleted_at__isnull=True,
        )
        any_test_overdue_subquery = CycleOverdueRecord.objects.filter(
            cycle_id=OuterRef("pk"),
            phase=CycleOverduePhase.TEST,
            deleted_at__isnull=True,
        )

        project = Project.objects.get(id=self.kwargs.get("project_id"))

        # Fetch project for the specific record or pass project_id dynamically
        project_timezone = project.timezone

        # Convert the current time (timezone.now()) to the project's timezone
        local_tz = pytz.timezone(project_timezone)
        current_time_in_project_tz = timezone.now().astimezone(local_tz)

        # Convert project local time back to UTC for comparison (start_date is stored in UTC)
        current_time_in_utc = current_time_in_project_tz.astimezone(pytz.utc)

        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
            )
            .filter(project__archived_at__isnull=True)
            .select_related("project", "workspace", "owned_by")
            .prefetch_related(
                Prefetch(
                    "issue_cycle__issue__assignees",
                    queryset=User.objects.only("avatar_asset", "first_name", "id").distinct(),
                )
            )
            .prefetch_related(
                Prefetch(
                    "issue_cycle__issue__labels",
                    queryset=Label.objects.only("name", "color", "id").distinct(),
                )
            )
            .prefetch_related("plans")
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
            .annotate(
                total_issues=Count(
                    "issue_cycle__issue__id",
                    distinct=True,
                    filter=Q(
                        issue_cycle__issue__archived_at__isnull=True,
                        issue_cycle__issue__is_draft=False,
                        issue_cycle__deleted_at__isnull=True,
                        issue_cycle__issue__deleted_at__isnull=True,
                    ),
                )
            )
            .annotate(
                completed_issues=Count(
                    "issue_cycle__issue__id",
                    distinct=True,
                    filter=Q(
                        issue_cycle__issue__state__group="completed",
                        issue_cycle__issue__archived_at__isnull=True,
                        issue_cycle__issue__is_draft=False,
                        issue_cycle__deleted_at__isnull=True,
                        issue_cycle__issue__deleted_at__isnull=True,
                    ),
                )
            )
            .annotate(
                cancelled_issues=Count(
                    "issue_cycle__issue__id",
                    distinct=True,
                    filter=Q(
                        issue_cycle__issue__state__group__in=["cancelled"],
                        issue_cycle__issue__archived_at__isnull=True,
                        issue_cycle__issue__is_draft=False,
                        issue_cycle__deleted_at__isnull=True,
                        issue_cycle__issue__deleted_at__isnull=True,
                    ),
                )
            )
            .annotate(
                assignee_ids=Coalesce(
                    ArrayAgg(
                        "issue_cycle__issue__assignees__id",
                        distinct=True,
                        filter=~Q(issue_cycle__issue__assignees__id__isnull=True)
                        & (Q(issue_cycle__issue__issue_assignee__deleted_at__isnull=True)),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                )
            )
            .annotate(
                plan_ids=Coalesce(
                    ArrayAgg("plans__id", distinct=True),
                    Value([], output_field=ArrayField(UUIDField())),
                )
            )
            .order_by("-is_favorite", "name")
            .distinct()
        )

    @allow_fine_permission(PermissionKey.SPRINTS_VIEW)
    def list(self, request, slug, project_id):
        cycle_status = request.query_params.getlist('status')
        queryset = self.get_queryset().filter(archived_at__isnull=True)
        scan_cycles_for_overdue(queryset)
        if cycle_status:
            queryset = queryset.filter(status__in=cycle_status)
        cycle_view = request.GET.get("cycle_view", "all")

        # Update the order by
        queryset = queryset.order_by("-is_favorite", "-created_at")

        project = Project.objects.get(id=self.kwargs.get("project_id"))

        # Fetch project for the specific record or pass project_id dynamically
        project_timezone = project.timezone

        # Convert the current time (timezone.now()) to the project's timezone
        local_tz = pytz.timezone(project_timezone)
        current_time_in_project_tz = timezone.now().astimezone(local_tz)

        # Convert project local time back to UTC for comparison (start_date is stored in UTC)
        current_time_in_utc = current_time_in_project_tz.astimezone(pytz.utc)

        # Current Cycle
        if cycle_view == "current":
            queryset = queryset.filter(start_date__lte=current_time_in_utc, end_date__gte=current_time_in_utc)

            data = queryset.values(
                # necessary fields
                "id",
                "workspace_id",
                "project_id",
                # model fields
                "name",
                "description",
                "suggested_test_scope",
                "start_date",
                "end_date",
                "test_handoff_date",
                "owned_by_id",
                "view_props",
                "sort_order",
                "external_source",
                "external_id",
                "progress_snapshot",
                "logo_props",
                "release_id",
                "is_favorite",
                "total_issues",
                "completed_issues",
                "cancelled_issues",
                "assignee_ids",
                "status",
                "has_active_overdue",
                "has_overdue_history",
                "has_active_dev_overdue",
                "has_active_test_overdue",
                "has_dev_overdue_history",
                "has_test_overdue_history",
                "active_overdue_phase",
                "plan_ids",
                "version",
                "created_by",
            )
            datetime_fields = ["start_date", "end_date", "test_handoff_date"]
            data = user_timezone_converter(data, datetime_fields, project_timezone)

            # enrich with plans
            all_plan_ids = set()
            for item in data:
                for pid in item.get("plan_ids", []) or []:
                    all_plan_ids.add(str(pid))
            plans_map = {}
            if all_plan_ids:
                plans_qs = TestPlan.objects.filter(id__in=list(all_plan_ids), deleted_at__isnull=True)
                plans_serialized = TestPlanDetailSerializer(plans_qs, many=True).data
                plans_map = {str(p.get("id")): p for p in plans_serialized}
            for item in data:
                item["plans"] = [plans_map[str(pid)] for pid in item.get("plan_ids", []) if str(pid) in plans_map]

            if data:
                return Response(data, status=status.HTTP_200_OK)

        data = queryset.values(
            # necessary fields
            "id",
            "workspace_id",
            "project_id",
            # model fields
            "name",
            "description",
            "suggested_test_scope",
            "start_date",
            "end_date",
            "test_handoff_date",
            "owned_by_id",
            "view_props",
            "sort_order",
            "external_source",
            "external_id",
            "progress_snapshot",
            "logo_props",
            "release_id",
            # meta fields
            "is_favorite",
            "total_issues",
            "cancelled_issues",
            "completed_issues",
            "assignee_ids",
            "plan_ids",
            "status",
            "has_active_overdue",
            "has_overdue_history",
            "has_active_dev_overdue",
            "has_active_test_overdue",
            "has_dev_overdue_history",
            "has_test_overdue_history",
            "active_overdue_phase",
            "version",
            "created_by",
        )
        datetime_fields = ["start_date", "end_date", "test_handoff_date"]
        data = user_timezone_converter(data, datetime_fields, project_timezone)

        # enrich with plans
        all_plan_ids = set()
        for item in data:
            for pid in item.get("plan_ids", []) or []:
                if not pid:
                    continue
                all_plan_ids.add(str(pid))
        plans_map = {}
        if all_plan_ids:
            plans_qs = TestPlan.objects.filter(id__in=list(all_plan_ids), deleted_at__isnull=True)
            plans_serialized = TestPlanDetailSerializer(plans_qs, many=True).data
            plans_map = {str(p.get("id")): p for p in plans_serialized}
        for item in data:
            item["plans"] = [plans_map[str(pid)] for pid in item.get("plan_ids", []) if str(pid) in plans_map]

        return Response(data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.SPRINTS_CREATE)
    def create(self, request, slug, project_id):
        if request.data.get("end_date", None) is not None:
            serializer = CycleWriteSerializer(
                data=request.data, context={"project_id": project_id}
            )
            if serializer.is_valid():
                serializer.save(project_id=project_id, owned_by=request.user)
                cycle = (
                    self.get_queryset()
                    .filter(pk=serializer.data["id"])
                    .values(
                        # necessary fields
                        "id",
                        "workspace_id",
                        "project_id",
                        # model fields
                        "name",
                        "description",
                        "suggested_test_scope",
                        "start_date",
                        "end_date",
                        "test_handoff_date",
                        "owned_by_id",
                        "view_props",
                        "sort_order",
                        "external_source",
                        "external_id",
                        "progress_snapshot",
                        "logo_props",
                        "version",
                        # meta fields
                        "is_favorite",
                        "total_issues",
                        "completed_issues",
                        "assignee_ids",
                        "status",
                        "has_active_overdue",
                        "has_overdue_history",
                        "has_active_dev_overdue",
                        "has_active_test_overdue",
                        "has_dev_overdue_history",
                        "has_test_overdue_history",
                        "active_overdue_phase",
                        "created_by",
                    )
                    .first()
                )

                # Fetch the project timezone
                project = Project.objects.get(id=self.kwargs.get("project_id"))
                project_timezone = project.timezone

                datetime_fields = ["start_date", "end_date", "test_handoff_date"]
                cycle = user_timezone_converter(
                    cycle, datetime_fields, project_timezone
                )
                origin = base_host(request=request, is_app=True)

                # Send the model activity
                model_activity.delay(
                    model_name="cycle",
                    model_id=str(cycle["id"]),
                    requested_data=request.data,
                    current_instance=None,
                    actor_id=request.user.id,
                    slug=slug,
                    origin=origin,
                )
                cycle_activity_task.delay(
                    type="cycle.activity.created",
                    requested_data=json.dumps(request.data, cls=DjangoJSONEncoder),
                    current_instance=None,
                    cycle_id=str(cycle["id"]),
                    actor_id=str(request.user.id),
                    project_id=str(project_id),
                    epoch=int(timezone.now().timestamp()),
                )
                dispatch_cycle_created_email.delay(
                    cycle_id=str(cycle["id"]),
                    actor_id=str(request.user.id),
                    origin=origin,
                )
                return Response(cycle, status=status.HTTP_201_CREATED)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        else:
            return Response(
                {"error": "结束时间为必填项"},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @allow_fine_permission(PermissionKey.SPRINTS_EDIT)
    def partial_update(self, request, slug, project_id, pk):
        queryset = self.get_queryset().filter(workspace__slug=slug, project_id=project_id, pk=pk)
        cycle = queryset.first()
        if cycle.archived_at:
            return Response(
                {"error": "Archived cycle cannot be updated"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        current_instance = json.dumps(CycleSerializer(cycle).data, cls=DjangoJSONEncoder)
        previous_status = cycle.status
        previous_owner_id = cycle.owned_by_id
        previous_start_date = cycle.start_date
        previous_end_date = cycle.end_date
        previous_test_handoff_date = cycle.test_handoff_date

        request_data = request.data

        # if cycle.end_date is not None and cycle.end_date < timezone.now():
        #     if "sort_order" in request_data:
        #         # Can only change sort order for a completed cycle``
        #         request_data = {"sort_order": request_data.get("sort_order", cycle.sort_order)}
        #     else:
        #         return Response(
        #             {"error": "The Cycle has already been completed so it cannot be edited"},
        #             status=status.HTTP_400_BAD_REQUEST,
        #         )

        serializer = CycleWriteSerializer(
            cycle,
            data=request.data,
            partial=True,
            context={"project_id": project_id, "user": request.user},
        )
        if serializer.is_valid():
            updated_cycle = serializer.save()
            new_owner_id = updated_cycle.owned_by_id
            new_status = updated_cycle.status
            if new_status and new_status != previous_status:
                sync_overdue_on_status_change(updated_cycle, previous_status, new_status)
            sync_overdue_on_date_change(
                updated_cycle,
                prev_handoff=previous_test_handoff_date,
                prev_end=previous_end_date,
            )

            cycle = queryset.values(
                # necessary fields
                "id",
                "workspace_id",
                "project_id",
                # model fields
                "name",
                "description",
                "suggested_test_scope",
                "start_date",
                "end_date",
                "test_handoff_date",
                "owned_by_id",
                "view_props",
                "sort_order",
                "external_source",
                "external_id",
                "progress_snapshot",
                "logo_props",
                "release_id",
                "version",
                # meta fields
                "is_favorite",
                "total_issues",
                "completed_issues",
                "assignee_ids",
                "status",
                "has_active_overdue",
                "has_overdue_history",
                "has_active_dev_overdue",
                "has_active_test_overdue",
                "has_dev_overdue_history",
                "has_test_overdue_history",
                "active_overdue_phase",
                "created_by",
            ).first()

            # Fetch the project timezone
            project = Project.objects.get(id=self.kwargs.get("project_id"))
            project_timezone = project.timezone

            datetime_fields = ["start_date", "end_date", "test_handoff_date"]
            cycle = user_timezone_converter(cycle, datetime_fields, project_timezone)
            origin = base_host(request=request, is_app=True)

            # Send the model activity
            model_activity.delay(
                model_name="cycle",
                model_id=str(cycle["id"]),
                requested_data=request.data,
                current_instance=current_instance,
                actor_id=request.user.id,
                slug=slug,
                origin=origin,
            )
            cycle_activity_task.delay(
                type="cycle.activity.updated",
                requested_data=json.dumps(request.data, cls=DjangoJSONEncoder),
                current_instance=current_instance,
                cycle_id=str(cycle["id"]),
                actor_id=str(request.user.id),
                project_id=str(project_id),
                epoch=int(timezone.now().timestamp()),
            )
            if str(new_owner_id or "") != str(previous_owner_id or ""):
                dispatch_cycle_owner_email.delay(
                    cycle_id=str(cycle["id"]),
                    actor_id=str(request.user.id),
                    old_owner_id=str(previous_owner_id) if previous_owner_id else None,
                    new_owner_id=str(new_owner_id) if new_owner_id else None,
                    origin=origin,
                )

            if (
                updated_cycle.start_date != previous_start_date
                or updated_cycle.end_date != previous_end_date
            ):
                dispatch_cycle_schedule_email.delay(
                    cycle_id=str(cycle["id"]),
                    actor_id=str(request.user.id),
                    origin=origin,
                    old_start_date=(
                        previous_start_date.isoformat() if previous_start_date else None
                    ),
                    old_end_date=previous_end_date.isoformat() if previous_end_date else None,
                )

            new_status = cycle.get("status")
            if (
                new_status
                and new_status != previous_status
                and new_status in CYCLE_STATUS_EMAIL_WHITELIST
            ):
                dispatch_cycle_status_email.delay(
                    cycle_id=str(cycle["id"]),
                    actor_id=str(request.user.id),
                    old_status=previous_status,
                    new_status=new_status,
                    origin=origin,
                )

            return Response(cycle, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_fine_permission(PermissionKey.SPRINTS_VIEW)
    def retrieve(self, request, slug, project_id, pk):
        queryset = self.get_queryset().filter(archived_at__isnull=True).filter(pk=pk)

        data = (
            self.get_queryset()
            .filter(pk=pk)
            .filter(archived_at__isnull=True)
            .annotate(
                sub_issues=Issue.issue_objects.filter(
                    project_id=self.kwargs.get("project_id"),
                    parent__isnull=False,
                    issue_cycle__cycle_id=pk,
                    issue_cycle__deleted_at__isnull=True,
                )
                .order_by()
                .annotate(count=Func(F("id"), function="Count"))
                .values("count")
            )
            .values(
                # necessary fields
                "id",
                "workspace_id",
                "project_id",
                # model fields
                "name",
                "description",
            "suggested_test_scope",
            "start_date",
            "end_date",
            "test_handoff_date",
            "owned_by_id",
            "view_props",
            "sort_order",
            "external_source",
            "external_id",
            "progress_snapshot",
            "sub_issues",
            "logo_props",
            "version",
            # meta fields
            "is_favorite",
            "total_issues",
            "completed_issues",
            "assignee_ids",
            "status",
            "has_active_overdue",
            "has_overdue_history",
            "has_active_dev_overdue",
            "has_active_test_overdue",
            "has_dev_overdue_history",
            "has_test_overdue_history",
            "active_overdue_phase",
            "created_by",
        )
        .first()
        )

        if data is None:
            return Response({"error": "Cycle not found"}, status=status.HTTP_404_NOT_FOUND)

        queryset = queryset.first()
        # Fetch the project timezone
        project = Project.objects.get(id=self.kwargs.get("project_id"))
        project_timezone = project.timezone
        datetime_fields = ["start_date", "end_date", "test_handoff_date"]
        data = user_timezone_converter(data, datetime_fields, project_timezone)

        recent_visited_task.delay(
            slug=slug,
            entity_name="cycle",
            entity_identifier=pk,
            user_id=request.user.id,
            project_id=project_id,
        )
        return Response(data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.SPRINTS_VIEW)
    def overdues(self, request, slug, project_id, pk):
        if not Cycle.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            pk=pk,
        ).exists():
            return Response({"error": "Cycle not found"}, status=status.HTTP_404_NOT_FOUND)

        records = CycleOverdueRecord.objects.filter(
            cycle_id=pk,
            project_id=project_id,
            workspace__slug=slug,
            deleted_at__isnull=True,
        ).order_by("-started_at")
        serializer = CycleOverdueRecordSerializer(records, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.SPRINTS_DELETE)
    def destroy(self, request, slug, project_id, pk):
        cycle = Cycle.objects.get(workspace__slug=slug, project_id=project_id, pk=pk)

        cycle_issues = list(CycleIssue.objects.filter(cycle_id=self.kwargs.get("pk")).values_list("issue", flat=True))

        issue_activity.delay(
            type="cycle.activity.deleted",
            requested_data=json.dumps(
                {
                    "cycle_id": str(pk),
                    "cycle_name": str(cycle.name),
                    "issues": [str(issue_id) for issue_id in cycle_issues],
                }
            ),
            actor_id=str(request.user.id),
            issue_id=str(pk),
            project_id=str(project_id),
            current_instance=None,
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
        )
        cycle_activity_task.delay(
            type="cycle.activity.deleted",
            requested_data=None,
            current_instance=json.dumps({"name": cycle.name}),
            cycle_id=str(pk),
            actor_id=str(request.user.id),
            project_id=str(project_id),
            epoch=int(timezone.now().timestamp()),
        )
        # TODO: Soft delete the cycle break the onetoone relationship with cycle issue
        cycle.delete()

        # Delete the user favorite cycle
        UserFavorite.objects.filter(
            user=request.user,
            entity_type="cycle",
            entity_identifier=pk,
            project_id=project_id,
        ).delete()
        # Delete the cycle from recent visits
        UserRecentVisit.objects.filter(
            project_id=project_id,
            workspace__slug=slug,
            entity_identifier=pk,
            entity_name="cycle",
        ).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class CycleDateCheckEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        start_date = request.data.get("start_date", False)
        end_date = request.data.get("end_date", False)
        cycle_id = request.data.get("cycle_id")
        if not start_date or not end_date:
            return Response(
                {"error": "Start date and end date both are required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        start_date = convert_to_utc(date=str(start_date), project_id=project_id, is_start_date=True)
        end_date = convert_to_utc(
            date=str(end_date),
            project_id=project_id,
        )

        # Check if any cycle intersects in the given interval
        cycles = Cycle.objects.filter(
            Q(workspace__slug=slug)
            & Q(project_id=project_id)
            & (
                    Q(start_date__lte=start_date, end_date__gte=start_date)
                    | Q(start_date__lte=end_date, end_date__gte=end_date)
                    | Q(start_date__gte=start_date, end_date__lte=end_date)
            )
        ).exclude(pk=cycle_id)
        # if cycles.exists():
        #     return Response(
        #         {
        #             "error": "You have a cycle already on the given dates, if you want to create a draft cycle you can do that by removing dates",  # noqa: E501
        #             "status": False,
        #         }
        #     )
        # else:
        return Response({"status": True}, status=status.HTTP_200_OK)


class CycleFavoriteViewSet(BaseViewSet):
    model = UserFavorite

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(user=self.request.user)
            .select_related("cycle", "cycle__owned_by")
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def create(self, request, slug, project_id):
        _ = UserFavorite.objects.create(
            project_id=project_id,
            user=request.user,
            entity_type="cycle",
            entity_identifier=request.data.get("cycle"),
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def destroy(self, request, slug, project_id, cycle_id):
        cycle_favorite = UserFavorite.objects.get(
            project=project_id,
            entity_type="cycle",
            user=request.user,
            workspace__slug=slug,
            entity_identifier=cycle_id,
        )
        cycle_favorite.delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TransferCycleIssueEndpoint(BaseAPIView):
    @allow_fine_permission(PermissionKey.SPRINTS_ISSUE_MANAGE)
    def post(self, request, slug, project_id, cycle_id):
        new_cycle_id = request.data.get("new_cycle_id", False)

        if not new_cycle_id:
            return Response(
                {"error": "New Cycle Id is required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Transfer cycle issues and create progress snapshot
        result = transfer_cycle_issues(
            slug=slug,
            project_id=project_id,
            cycle_id=cycle_id,
            new_cycle_id=new_cycle_id,
            request=request,
            user_id=request.user.id,
        )

        # Handle error response
        if result.get("error"):
            return Response(
                {"error": result["error"]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({"message": "Success"}, status=status.HTTP_200_OK)


class CycleUserPropertiesEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def patch(self, request, slug, project_id, cycle_id):
        cycle_properties = CycleUserProperties.objects.get(
            user=request.user,
            cycle_id=cycle_id,
            project_id=project_id,
            workspace__slug=slug,
        )

        cycle_properties.filters = request.data.get("filters", cycle_properties.filters)
        cycle_properties.rich_filters = request.data.get("rich_filters", cycle_properties.rich_filters)
        cycle_properties.display_filters = request.data.get("display_filters", cycle_properties.display_filters)
        cycle_properties.display_properties = request.data.get(
            "display_properties", cycle_properties.display_properties
        )
        cycle_properties.save()

        serializer = CycleUserPropertiesSerializer(cycle_properties)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, cycle_id):
        cycle_properties, _ = CycleUserProperties.objects.get_or_create(
            user=request.user,
            project_id=project_id,
            cycle_id=cycle_id,
            workspace__slug=slug,
        )
        serializer = CycleUserPropertiesSerializer(cycle_properties)
        return Response(serializer.data, status=status.HTTP_200_OK)


class CycleProgressEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, cycle_id):
        cycle = Cycle.objects.filter(workspace__slug=slug, project_id=project_id, id=cycle_id).first()
        if not cycle:
            return Response({"error": "Cycle not found"}, status=status.HTTP_404_NOT_FOUND)
        aggregate_estimates = (
            Issue.issue_objects.filter(
                estimate_point__estimate__type="points",
                issue_cycle__cycle_id=cycle_id,
                issue_cycle__deleted_at__isnull=True,
                workspace__slug=slug,
                project_id=project_id,
            )
            .annotate(value_as_float=Cast("estimate_point__value", FloatField()))
            .aggregate(
                backlog_estimate_point=Sum(
                    Case(
                        When(state__group="backlog", then="value_as_float"),
                        default=Value(0),
                        output_field=FloatField(),
                    )
                ),
                unstarted_estimate_point=Sum(
                    Case(
                        When(state__group="unstarted", then="value_as_float"),
                        default=Value(0),
                        output_field=FloatField(),
                    )
                ),
                started_estimate_point=Sum(
                    Case(
                        When(state__group="started", then="value_as_float"),
                        default=Value(0),
                        output_field=FloatField(),
                    )
                ),
                cancelled_estimate_point=Sum(
                    Case(
                        When(state__group="cancelled", then="value_as_float"),
                        default=Value(0),
                        output_field=FloatField(),
                    )
                ),
                completed_estimate_points=Sum(
                    Case(
                        When(state__group="completed", then="value_as_float"),
                        default=Value(0),
                        output_field=FloatField(),
                    )
                ),
                total_estimate_points=Sum("value_as_float", default=Value(0), output_field=FloatField()),
            )
        )
        if cycle.progress_snapshot:
            backlog_issues = cycle.progress_snapshot.get("backlog_issues", 0)
            unstarted_issues = cycle.progress_snapshot.get("unstarted_issues", 0)
            started_issues = cycle.progress_snapshot.get("started_issues", 0)
            cancelled_issues = cycle.progress_snapshot.get("cancelled_issues", 0)
            completed_issues = cycle.progress_snapshot.get("completed_issues", 0)
            total_issues = cycle.progress_snapshot.get("total_issues", 0)
        else:
            backlog_issues = Issue.issue_objects.filter(
                issue_cycle__cycle_id=cycle_id,
                issue_cycle__deleted_at__isnull=True,
                workspace__slug=slug,
                project_id=project_id,
                state__group="backlog",
            ).count()

            unstarted_issues = Issue.issue_objects.filter(
                issue_cycle__cycle_id=cycle_id,
                issue_cycle__deleted_at__isnull=True,
                workspace__slug=slug,
                project_id=project_id,
                state__group="unstarted",
            ).count()

            started_issues = Issue.issue_objects.filter(
                issue_cycle__cycle_id=cycle_id,
                issue_cycle__deleted_at__isnull=True,
                workspace__slug=slug,
                project_id=project_id,
                state__group="started",
            ).count()

            cancelled_issues = Issue.issue_objects.filter(
                issue_cycle__cycle_id=cycle_id,
                issue_cycle__deleted_at__isnull=True,
                workspace__slug=slug,
                project_id=project_id,
                state__group="cancelled",
            ).count()

            completed_issues = Issue.issue_objects.filter(
                issue_cycle__cycle_id=cycle_id,
                issue_cycle__deleted_at__isnull=True,
                workspace__slug=slug,
                project_id=project_id,
                state__group="completed",
            ).count()

            total_issues = Issue.issue_objects.filter(
                issue_cycle__cycle_id=cycle_id,
                issue_cycle__deleted_at__isnull=True,
                workspace__slug=slug,
                project_id=project_id,
            ).count()

        return Response(
            {
                "backlog_estimate_points": aggregate_estimates["backlog_estimate_point"] or 0,
                "unstarted_estimate_points": aggregate_estimates["unstarted_estimate_point"] or 0,
                "started_estimate_points": aggregate_estimates["started_estimate_point"] or 0,
                "cancelled_estimate_points": aggregate_estimates["cancelled_estimate_point"] or 0,
                "completed_estimate_points": aggregate_estimates["completed_estimate_points"] or 0,
                "total_estimate_points": aggregate_estimates["total_estimate_points"],
                "backlog_issues": backlog_issues,
                "total_issues": total_issues,
                "completed_issues": completed_issues,
                "cancelled_issues": cancelled_issues,
                "started_issues": started_issues,
                "unstarted_issues": unstarted_issues,
            },
            status=status.HTTP_200_OK,
        )


class CycleAnalyticsEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, cycle_id):
        analytic_type = request.GET.get("type", "issues")
        cycle = (
            Cycle.objects.filter(workspace__slug=slug, project_id=project_id, id=cycle_id)
            .annotate(
                total_issues=Count(
                    "issue_cycle__issue__id",
                    distinct=True,
                    filter=Q(
                        issue_cycle__issue__archived_at__isnull=True,
                        issue_cycle__issue__is_draft=False,
                        issue_cycle__issue__deleted_at__isnull=True,
                        issue_cycle__deleted_at__isnull=True,
                    ),
                )
            )
            .first()
        )



        # this will tell whether the issues were transferred to the new cycle
        """ 
        if the issues were transferred to the new cycle, then the progress_snapshot will be present
        return the progress_snapshot data in the analytics for each date
            
        else issues were not transferred to the new cycle then generate the stats from the cycle issue bridge tables
        """

        if cycle.progress_snapshot:
            distribution = cycle.progress_snapshot.get("distribution", {})
            return Response(
                {
                    "labels": distribution.get("labels", []),
                    "assignees": distribution.get("assignees", []),
                    "completion_chart": distribution.get("completion_chart", {}),
                },
                status=status.HTTP_200_OK,
            )

        estimate_type = Project.objects.filter(
            workspace__slug=slug,
            pk=project_id,
            estimate__isnull=False,
            estimate__type="points",
        ).exists()

        assignee_distribution = []
        label_distribution = []
        completion_chart = {}

        if analytic_type == "points" and estimate_type:
            assignee_distribution = (
                Issue.issue_objects.filter(
                    issue_cycle__cycle_id=cycle_id,
                    issue_cycle__deleted_at__isnull=True,
                    workspace__slug=slug,
                    project_id=project_id,
                )
                # 排除已软删的 IssueAssignee；LEFT JOIN 下无负责人行的 deleted_at 为 NULL，同样满足此条件，仍会被保留
                .filter(issue_assignee__deleted_at__isnull=True)
                .annotate(display_name=F("assignees__display_name"))
                .annotate(assignee_id=F("assignees__id"))
                .annotate(
                    avatar_url=Case(
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
                .values("display_name", "assignee_id", "avatar_url")
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
                .order_by("display_name")
            )

            label_distribution = (
                Issue.issue_objects.filter(
                    issue_cycle__cycle_id=cycle_id,
                    issue_cycle__deleted_at__isnull=True,
                    workspace__slug=slug,
                    project_id=project_id,
                )
                # 排除已软删的 IssueLabel；LEFT JOIN 下无标签行同样被保留
                .filter(label_issue__deleted_at__isnull=True)
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
            completion_chart = burndown_plot(
                queryset=cycle,
                slug=slug,
                project_id=project_id,
                plot_type="points",
                cycle_id=cycle_id,
            )

        if analytic_type == "issues":
            assignee_distribution = (
                Issue.issue_objects.filter(
                    issue_cycle__cycle_id=cycle_id,
                    issue_cycle__deleted_at__isnull=True,
                    project_id=project_id,
                    workspace__slug=slug,
                )
                # 排除已软删的 IssueAssignee；LEFT JOIN 下无负责人行的 deleted_at 为 NULL，同样满足此条件，仍会被保留
                .filter(issue_assignee__deleted_at__isnull=True)
                .annotate(display_name=F("assignees__display_name"))
                .annotate(assignee_id=F("assignees__id"))
                .annotate(
                    avatar_url=Case(
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
                .values("display_name", "assignee_id", "avatar_url")
                # 统计每个负责人对应的工作项数；改用 "id" 以正确统计 assignee_id 为 NULL 的“无负责人”分组
                .annotate(
                    total_issues=Count(
                        "id",
                        filter=Q(archived_at__isnull=True, is_draft=False),
                    )
                )
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
                .order_by("display_name")
            )

            label_distribution = (
                Issue.issue_objects.filter(
                    issue_cycle__cycle_id=cycle_id,
                    issue_cycle__deleted_at__isnull=True,
                    project_id=project_id,
                    workspace__slug=slug,
                )
                # 排除已软删的 IssueLabel；LEFT JOIN 下无标签行同样被保留
                .filter(label_issue__deleted_at__isnull=True)
                .annotate(label_name=F("labels__name"))
                .annotate(color=F("labels__color"))
                .annotate(label_id=F("labels__id"))
                .values("label_name", "color", "label_id")
                # 改用 "id" 以正确统计 label_id 为 NULL 的“无标签”分组
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
            completion_chart = burndown_plot(
                queryset=cycle,
                slug=slug,
                project_id=project_id,
                cycle_id=cycle_id,
                plot_type="issues",
            )

        return Response(
            {
                "assignees": assignee_distribution,
                "labels": label_distribution,
                "completion_chart": completion_chart,
            },
            status=status.HTTP_200_OK,
        )


class CycleOverdueByAssigneeEndpoint(BaseAPIView):
    """
    返回指定迭代中延期工作项（截止时间早于今天且未完成/未取消）按负责人聚合的结果。

    响应结构与项目统计中的 overdue_by_assignee 保持一致，便于前端复用 UI。
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, cycle_id):
        if not ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            member_id=request.user.id,
            is_active=True,
        ).exists():
            return Response({"error": "forbidden"}, status=status.HTTP_403_FORBIDDEN)

        today = timezone.now().date()

        overdue_issue_qs = (
            Issue.issue_objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                issue_cycle__cycle_id=cycle_id,
                issue_cycle__deleted_at__isnull=True,
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


class CycleIssueTypeDistributionEndpoint(BaseAPIView):
    """
    返回指定迭代中按工作项类型聚合的分布数据。
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, cycle_id):
        if not ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            member_id=request.user.id,
            is_active=True,
        ).exists():
            return Response({"error": "forbidden"}, status=status.HTTP_403_FORBIDDEN)

        issue_type_rows = list(
            Issue.issue_objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                issue_cycle__cycle_id=cycle_id,
                issue_cycle__deleted_at__isnull=True,
            )
            .values("type_id", "type__name", "type__logo_props")
            .annotate(count=Count("id", distinct=True))
            .order_by("-count")
        )

        data = [
            {
                "type_id": str(row.get("type_id")) if row.get("type_id") else None,
                "name": row.get("type__name") or "未指定类型",
                "logo_props": row.get("type__logo_props") or {},
                "count": row.get("count") or 0,
            }
            for row in issue_type_rows
        ]
        total = sum(item["count"] for item in data)

        return Response(
            {
                "total": total,
                "data": data,
            },
            status=status.HTTP_200_OK,
        )


class CyclePlansEndpoint(BaseAPIView):
    """返回当前迭代已关联的测试计划列表。"""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, cycle_id):
        plans_qs = (
            TestPlan.objects.filter(
                project_id=project_id,
                cycle_id=cycle_id,
                deleted_at__isnull=True,
            )
            .order_by("-created_at")
        )
        serializer = TestPlanDetailSerializer(plans_qs, many=True)
        return Response(
            {"data": serializer.data, "count": plans_qs.count()},
            status=status.HTTP_200_OK,
        )


class CycleSelectablePlansEndpoint(BaseAPIView):
    """返回指定项目下尚未关联到任何迭代的测试计划，用于"迭代 -> 关联测试计划"弹窗选择。"""

    def get(self, request, slug, project_id, cycle_id):
        if not Cycle.objects.filter(
            workspace__slug=slug, project_id=project_id, id=cycle_id
        ).exists():
            return Response({"error": "Cycle not found"}, status=status.HTTP_404_NOT_FOUND)

        plans_qs = (
            TestPlan.objects.filter(
                project_id=project_id,
                deleted_at__isnull=True,
                cycle__isnull=True,
            )
            .order_by("-created_at")
        )
        serializer = TestPlanDetailSerializer(plans_qs, many=True)
        return Response(
            {"data": serializer.data, "count": plans_qs.count()},
            status=status.HTTP_200_OK,
        )


class CycleAssociatePlansEndpoint(BaseAPIView):
    """将一组测试计划的 cycle 字段批量更新为当前迭代。"""

    @allow_fine_permission(PermissionKey.SPRINTS_EDIT)
    def post(self, request, slug, project_id, cycle_id):
        plan_ids = request.data.get("plan_ids") or []
        if not isinstance(plan_ids, list) or len(plan_ids) == 0:
            return Response(
                {"error": "plan_ids must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not Cycle.objects.filter(
            workspace__slug=slug, project_id=project_id, id=cycle_id
        ).exists():
            return Response({"error": "Cycle not found"}, status=status.HTTP_404_NOT_FOUND)

        updated = TestPlan.objects.filter(
            project_id=project_id,
            deleted_at__isnull=True,
            id__in=plan_ids,
        ).update(cycle_id=cycle_id)

        return Response(
            {"cycle_id": str(cycle_id), "updated": updated},
            status=status.HTTP_200_OK,
        )


class CycleCancelPlanAssociationEndpoint(BaseAPIView):
    """解除一组测试计划与当前迭代的关联关系（仅当它们当前归属该迭代时）。"""

    @allow_fine_permission(PermissionKey.SPRINTS_EDIT)
    def post(self, request, slug, project_id, cycle_id):
        plan_ids = request.data.get("plan_ids") or []
        if not isinstance(plan_ids, list) or len(plan_ids) == 0:
            return Response(
                {"error": "plan_ids must be a non-empty list"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        updated = TestPlan.objects.filter(
            project_id=project_id,
            cycle_id=cycle_id,
            deleted_at__isnull=True,
            id__in=plan_ids,
        ).update(cycle=None)

        return Response(
            {"cycle_id": str(cycle_id), "updated": updated},
            status=status.HTTP_200_OK,
        )
