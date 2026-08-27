# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import copy
import csv
import io
import json
import time
from urllib.parse import quote

import pytz

# Django imports
from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import (
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
)
from django.db.models.functions import Coalesce
from django.http import FileResponse, HttpResponse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.gzip import gzip_page

# Third Party imports
from openpyxl import Workbook
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import (
    PermissionKey,
    ROLE,
    allow_permission,
    has_project_issue_permission,
    resolve_project_issue_type_name,
)
from plane.app.permissions.base import _get_user_project_permission_keys
from plane.app.serializers import (
    IssueCreateSerializer,
    IssueDetailSerializer,
    IssueListDetailSerializer,
    IssueSerializer,
    ProjectUserPropertySerializer,
)
from plane.bgtasks.issue_activities_task import issue_activity
from plane.bgtasks.issue_description_version_task import issue_description_version_task
from plane.bgtasks.recent_visited_task import recent_visited_task
from plane.bgtasks.webhook_task import model_activity
from plane.db.models import (
    CycleIssue,
    FileAsset,
    IntakeIssue,
    Issue,
    IssueAssignee,
    IssueLabel,
    IssueLink,
    IssueReaction,
    IssueRelation,
    IssueSubscriber,
    IssueTransitionRecord,
    ProjectUserProperty,
    ModuleIssue,
    ReleaseIssue,
    RequirementIssue,
    Project,
    ProjectMember,
    TransitionRecordStatus,
    TypeExtraField,
    UserRecentVisit,
    IssueType,
    State,
)
from plane.utils.filters import (
    ComplexFilterBackend,
    IssueComplexFilterBackend,
    IssueFilterSet,
)
from plane.utils.global_paginator import paginate
from plane.utils.grouper import (
    issue_group_values,
    issue_on_results,
    issue_queryset_grouper,
)
from plane.utils.host import base_host
from plane.utils.issue_filters import issue_filters
from plane.utils.order_queryset import order_issue_queryset
from plane.utils.paginator import GroupedOffsetPaginator, SubGroupedOffsetPaginator
from plane.utils.timezone_converter import user_timezone_converter
from plane.utils.extra_field_value import serialize_extra_field_values
from plane.settings.redis import redis_instance
from plane.utils.workflow import (
    check_update_state_permission,
    check_added_assignee_constraint,
    cancel_issue_pending_transitions,
    capture_issue_content_snapshot,
    reset_pending_transition_votes_if_content_changed,
)
from plane.db.models import State as StateModel

from .. import BaseAPIView, BaseViewSet


# scope 的取值由前端 TProjectIssueScope 直接发过来（issue.store.ts 把它当查询参数
# 拼进 GET /issues）。「研发需求」页从 /requirements 迁到 /dev-requirements 时，这里
# 的键必须跟着改 —— 否则 _resolve_project_issue_page_scope 认不出新 scope，会**同时**
# 跳过权限校验和类别过滤，页面静默列出项目全部工作项。
# permission key 本身刻意保持 project.requirements.view 不变（它已写进线上角色配置）。
PROJECT_ISSUE_PAGE_SCOPE_PERMISSION_KEYS = {
    "issues": PermissionKey.PROJECT_WORK_ITEMS_VIEW,
    "dev_requirements": PermissionKey.PROJECT_REQUIREMENTS_VIEW,
    "defects": PermissionKey.PROJECT_DEFECTS_VIEW,
}

PROJECT_ISSUE_PAGE_SCOPE_CATEGORY_FILTERS = {
    "dev_requirements": "需求",
    "defects": "缺陷",
}


def _resolve_project_issue_page_scope(request):
    scope = request.query_params.get("scope")
    if scope in PROJECT_ISSUE_PAGE_SCOPE_PERMISSION_KEYS:
        return scope
    return None


def _check_project_issue_page_scope_permission(request, slug, project_id):
    scope = _resolve_project_issue_page_scope(request)
    if scope is None:
        return None, None

    permission_key = PROJECT_ISSUE_PAGE_SCOPE_PERMISSION_KEYS[scope].value
    user_keys = _get_user_project_permission_keys(request.user, slug, str(project_id))
    if permission_key in user_keys:
        return scope, None

    return scope, Response(
        {"error": "您没有所需的项目权限。"},
        status=status.HTTP_403_FORBIDDEN,
    )


def _apply_project_issue_page_scope_filter(queryset, scope):
    category_name = PROJECT_ISSUE_PAGE_SCOPE_CATEGORY_FILTERS.get(scope)
    if not category_name:
        return queryset
    return queryset.filter(type__category__name=category_name)


class IssueListEndpoint(BaseAPIView):
    filter_backends = (IssueComplexFilterBackend,)
    filterset_class = IssueFilterSet

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        issue_ids = request.GET.get("issues", False)

        if not issue_ids:
            return Response(
                {"error": "Issues are required"}, status=status.HTTP_400_BAD_REQUEST
            )

        issue_ids = [issue_id for issue_id in issue_ids.split(",") if issue_id != ""]

        # Base queryset with basic filters
        queryset = Issue.issue_objects.filter(
            workspace__slug=slug, project_id=project_id, pk__in=issue_ids
        )

        # Apply filtering from filterset
        queryset = self.filter_queryset(queryset)

        # Apply legacy filters
        filters = issue_filters(request.query_params, "GET")
        issue_queryset = queryset.filter(**filters)

        # Add select_related, prefetch_related if fields or expand is not None
        if self.fields or self.expand:
            issue_queryset = issue_queryset.select_related(
                "workspace", "project", "state", "parent", "type"
            ).prefetch_related(
                "assignees", "labels", "issue_module__module", "issue_release__release"
            )

        # Add annotations
        issue_queryset = (
            issue_queryset.annotate(
                cycle_id=Subquery(
                    CycleIssue.objects.filter(
                        issue=OuterRef("id"), deleted_at__isnull=True
                    ).values("cycle_id")[:1]
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
            .distinct()
        )

        order_by_param = request.GET.get("order_by", "-created_at")
        # Issue queryset
        issue_queryset, _ = order_issue_queryset(
            issue_queryset=issue_queryset, order_by_param=order_by_param
        )

        # Group by
        group_by = request.GET.get("group_by", False)
        sub_group_by = request.GET.get("sub_group_by", False)

        # issue queryset
        issue_queryset = issue_queryset_grouper(
            queryset=issue_queryset, group_by=group_by, sub_group_by=sub_group_by
        )

        recent_visited_task.delay(
            slug=slug,
            project_id=project_id,
            entity_name="project",
            entity_identifier=project_id,
            user_id=request.user.id,
        )

        if self.fields or self.expand:
            issues = IssueSerializer(
                issue_queryset, many=True, fields=self.fields, expand=self.expand
            ).data
        else:
            issues = issue_queryset.annotate(type_name=F("type__name")).values(
                "id",
                "name",
                "state_id",
                "sort_order",
                "completed_at",
                "estimate_point",
                "priority",
                "start_date",
                "target_date",
                "sequence_id",
                "project_id",
                "parent_id",
                "cycle_id",
                "module_ids",
                "release_ids",
                "label_ids",
                "assignee_ids",
                "sub_issues_count",
                "created_at",
                "updated_at",
                "created_by",
                "updated_by",
                "attachment_count",
                "link_count",
                "is_draft",
                "archived_at",
                "deleted_at",
                "type_id",
                "type_name",
            )
            datetime_fields = ["created_at", "updated_at"]
            issues = user_timezone_converter(
                issues, datetime_fields, request.user.user_timezone
            )
        return Response(issues, status=status.HTTP_200_OK)


class IssueViewSet(BaseViewSet):
    model = Issue
    webhook_event = "issue"
    search_fields = ["name"]
    filter_backends = (IssueComplexFilterBackend,)
    filterset_class = IssueFilterSet

    def get_serializer_class(self):
        return (
            IssueCreateSerializer
            if self.action in ["create", "update", "partial_update"]
            else IssueSerializer
        )

    def get_queryset(self):
        issues = Issue.issue_objects.filter(
            project_id=self.kwargs.get("project_id"),
            workspace__slug=self.kwargs.get("slug"),
        ).distinct()

        return issues

    def apply_annotations(self, issues):
        issues = (
            issues.annotate(
                cycle_id=Subquery(
                    CycleIssue.objects.filter(
                        issue=OuterRef("id"), deleted_at__isnull=True
                    ).values("cycle_id")[:1]
                )
            )
            .annotate(
                link_count=Subquery(
                    IssueLink.objects.filter(issue=OuterRef("id"))
                    .values("issue")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                attachment_count=Subquery(
                    FileAsset.objects.filter(
                        issue_id=OuterRef("id"),
                        entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                    )
                    .values("issue_id")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                sub_issues_count=Subquery(
                    Issue.issue_objects.filter(parent=OuterRef("id"))
                    .values("parent")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
        )

        return issues

    @method_decorator(gzip_page)
    def list(self, request, slug, project_id):
        scope, permission_error = _check_project_issue_page_scope_permission(
            request, slug, project_id
        )
        if permission_error:
            return permission_error

        extra_filters = {}
        if request.GET.get("updated_at__gt", None) is not None:
            extra_filters = {"updated_at__gt": request.GET.get("updated_at__gt")}

        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        query_params = request.query_params.copy()

        filters = issue_filters(query_params, "GET")
        order_by_param = request.GET.get("order_by", "-created_at")

        issue_queryset = self.get_queryset()
        issue_queryset = _apply_project_issue_page_scope_filter(issue_queryset, scope)

        # Apply rich filters
        issue_queryset = self.filter_queryset(issue_queryset)

        # Apply legacy filters
        issue_queryset = issue_queryset.filter(**filters, **extra_filters)

        # Keeping a copy of the queryset before applying annotations
        filtered_issue_queryset = copy.deepcopy(issue_queryset)

        # Applying annotations to the issue queryset
        issue_queryset = self.apply_annotations(issue_queryset)

        # Issue queryset
        issue_queryset, order_by_param = order_issue_queryset(
            issue_queryset=issue_queryset, order_by_param=order_by_param
        )

        # Group by
        group_by = request.GET.get("group_by", False)
        sub_group_by = request.GET.get("sub_group_by", False)

        # issue queryset
        issue_queryset = issue_queryset_grouper(
            queryset=issue_queryset, group_by=group_by, sub_group_by=sub_group_by
        )

        recent_visited_task.delay(
            slug=slug,
            project_id=project_id,
            entity_name="project",
            entity_identifier=project_id,
            user_id=request.user.id,
        )
        if (
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member=request.user,
                role=5,
                is_active=True,
            ).exists()
            and not project.guest_view_all_features
        ):
            issue_queryset = issue_queryset.filter(created_by=request.user)
            filtered_issue_queryset = filtered_issue_queryset.filter(
                created_by=request.user
            )

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
                        total_count_queryset=filtered_issue_queryset,
                        on_results=lambda issues: issue_on_results(
                            group_by=group_by, issues=issues, sub_group_by=sub_group_by
                        ),
                        paginator_cls=SubGroupedOffsetPaginator,
                        group_by_fields=issue_group_values(
                            field=group_by,
                            slug=slug,
                            project_id=project_id,
                            filters=filters,
                            queryset=filtered_issue_queryset,
                        ),
                        sub_group_by_fields=issue_group_values(
                            field=sub_group_by,
                            slug=slug,
                            project_id=project_id,
                            filters=filters,
                            queryset=filtered_issue_queryset,
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
                    total_count_queryset=filtered_issue_queryset,
                    on_results=lambda issues: issue_on_results(
                        group_by=group_by, issues=issues, sub_group_by=sub_group_by
                    ),
                    paginator_cls=GroupedOffsetPaginator,
                    group_by_fields=issue_group_values(
                        field=group_by,
                        slug=slug,
                        project_id=project_id,
                        filters=filters,
                        queryset=filtered_issue_queryset,
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
                total_count_queryset=filtered_issue_queryset,
                on_results=lambda issues: issue_on_results(
                    group_by=group_by, issues=issues, sub_group_by=sub_group_by
                ),
            )

    def create(self, request, slug, project_id):
        project = Project.objects.get(pk=project_id)
        data = dict(request.data)
        if not data.get("type_id"):
            default_issue_type = (
                IssueType.objects.filter(
                    project=project, is_default=True, deleted_at__isnull=True
                ).first()
                or IssueType.objects.filter(
                    project=project, name="任务", deleted_at__isnull=True
                ).first()
            )
            if default_issue_type is None:
                return Response(
                    {"error": "Issue type is not valid please pass a valid type_id"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            data["type_id"] = str(default_issue_type.id)

        issue_type_id = str(data["type_id"])
        if resolve_project_issue_type_name(str(project_id), issue_type_id) is None:
            return Response(
                {"error": "Issue type is not valid please pass a valid type_id"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not has_project_issue_permission(
            user=request.user,
            workspace_slug=slug,
            project_id=str(project_id),
            action="create",
            issue_type_id=issue_type_id,
        ):
            return Response(
                {"error": f"您没有所需的项目权限。"},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = IssueCreateSerializer(
            data=data,
            context={
                "project_id": project_id,
                "type_id": data["type_id"],
                "workspace_id": project.workspace_id,
                "default_assignee_id": project.default_assignee_id,
            },
        )

        if serializer.is_valid():
            serializer.save()

            # Track the issue
            issue_activity.delay(
                type="issue.activity.created",
                requested_data=json.dumps(self.request.data, cls=DjangoJSONEncoder),
                actor_id=str(request.user.id),
                issue_id=str(serializer.data.get("id", None)),
                project_id=str(project_id),
                current_instance=None,
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
            )
            queryset = self.get_queryset()
            queryset = self.apply_annotations(queryset)
            issue = (
                issue_queryset_grouper(
                    queryset=queryset.filter(pk=serializer.data["id"]),
                    group_by=None,
                    sub_group_by=None,
                )
                .values(
                    "id",
                    "name",
                    "state_id",
                    "sort_order",
                    "completed_at",
                    "estimate_point",
                    "priority",
                    "start_date",
                    "target_date",
                    "sequence_id",
                    "project_id",
                    "parent_id",
                    "cycle_id",
                    "module_ids",
                    "release_ids",
                    "label_ids",
                    "assignee_ids",
                    "sub_issues_count",
                    "created_at",
                    "updated_at",
                    "created_by",
                    "updated_by",
                    "attachment_count",
                    "link_count",
                    "is_draft",
                    "archived_at",
                    "deleted_at",
                    "type_id",
                )
                .first()
            )
            datetime_fields = ["created_at", "updated_at"]
            issue = user_timezone_converter(
                issue, datetime_fields, request.user.user_timezone
            )
            issue["extra_field_values"] = serialize_extra_field_values(
                serializer.instance
            )
            # Send the model activity
            model_activity.delay(
                model_name="issue",
                model_id=str(serializer.data["id"]),
                requested_data=data,
                current_instance=None,
                actor_id=request.user.id,
                slug=slug,
                origin=base_host(request=request, is_app=True),
            )
            # updated issue description version
            issue_description_version_task.delay(
                updated_issue=json.dumps(data, cls=DjangoJSONEncoder),
                issue_id=str(serializer.data["id"]),
                user_id=request.user.id,
                is_creating=True,
            )
            return Response(issue, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_permission(
        allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], creator=True, model=Issue
    )
    def retrieve(self, request, slug, project_id, pk=None):
        project = Project.objects.get(pk=project_id, workspace__slug=slug)

        issue = (
            Issue.objects.filter(
                project_id=self.kwargs.get("project_id"),
                workspace__slug=self.kwargs.get("slug"),
                pk=pk,
            )
            .select_related("state", "type")
            .prefetch_related(
                Prefetch(
                    "type__extra_fields",
                    queryset=TypeExtraField.objects.filter(
                        is_active=True, deleted_at__isnull=True
                    ).order_by("sort_order", "created_at"),
                )
            )
            .annotate(
                cycle_id=Subquery(
                    CycleIssue.objects.filter(issue=OuterRef("id")).values("cycle_id")[
                        :1
                    ]
                )
            )
            .annotate(
                link_count=Subquery(
                    IssueLink.objects.filter(issue=OuterRef("id"))
                    .values("issue")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                attachment_count=Subquery(
                    FileAsset.objects.filter(
                        issue_id=OuterRef("id"),
                        entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                    )
                    .values("issue_id")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                sub_issues_count=Subquery(
                    Issue.issue_objects.filter(parent=OuterRef("id"))
                    .values("parent")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                label_ids=Coalesce(
                    Subquery(
                        IssueLabel.objects.filter(issue_id=OuterRef("pk"))
                        .values("issue_id")
                        .annotate(arr=ArrayAgg("label_id", distinct=True))
                        .values("arr")
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                assignee_ids=Coalesce(
                    Subquery(
                        IssueAssignee.objects.filter(
                            issue_id=OuterRef("pk"),
                            assignee__member_project__is_active=True,
                        )
                        .values("issue_id")
                        .annotate(arr=ArrayAgg("assignee_id", distinct=True))
                        .values("arr")
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                module_ids=Coalesce(
                    Subquery(
                        ModuleIssue.objects.filter(
                            issue_id=OuterRef("pk"),
                            module__archived_at__isnull=True,
                        )
                        .values("issue_id")
                        .annotate(arr=ArrayAgg("module_id", distinct=True))
                        .values("arr")
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                release_ids=Coalesce(
                    Subquery(
                        ReleaseIssue.objects.filter(
                            issue_id=OuterRef("pk"),
                            deleted_at__isnull=True,
                            release__archived_at__isnull=True,
                        )
                        .values("issue_id")
                        .annotate(arr=ArrayAgg("release_id", distinct=True))
                        .values("arr")
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
            )
            .prefetch_related(
                Prefetch(
                    "issue_reactions",
                    queryset=IssueReaction.objects.select_related("issue", "actor"),
                )
            )
            .prefetch_related(
                Prefetch(
                    "issue_link",
                    queryset=IssueLink.objects.select_related("created_by"),
                )
            )
            .annotate(
                is_subscribed=Exists(
                    IssueSubscriber.objects.filter(
                        workspace__slug=slug,
                        project_id=project_id,
                        issue_id=OuterRef("pk"),
                        subscriber=request.user,
                    )
                )
            )
        ).first()
        if not issue:
            return Response(
                {"error": "The required object does not exist."},
                status=status.HTTP_404_NOT_FOUND,
            )

        """
        if the role is guest and guest_view_all_features is false and owned by is not
        the requesting user then dont show the issue
        """

        if (
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                member=request.user,
                role=5,
                is_active=True,
            ).exists()
            and not project.guest_view_all_features
            and not issue.created_by == request.user
        ):
            return Response(
                {"error": "You are not allowed to view this issue"},
                status=status.HTTP_403_FORBIDDEN,
            )

        recent_visited_task.delay(
            slug=slug,
            entity_name="issue",
            entity_identifier=pk,
            user_id=request.user.id,
            project_id=project_id,
        )

        serializer = IssueDetailSerializer(issue, expand=self.expand)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def partial_update(self, request, slug, project_id, pk=None):
        redis_client = redis_instance()
        lock_id = f"{project_id}-{pk}"
        while redis_client.set(lock_id, "true", nx=True, ex=5) is None:
            time.sleep(0.1)

        queryset = self.get_queryset()
        queryset = self.apply_annotations(queryset)

        skip_activity = request.data.pop("skip_activity", False)
        approval_reason = request.data.pop("approval_reason", "")
        is_description_update = request.data.get("description_html") is not None

        issue = (
            queryset.annotate(
                label_ids=Coalesce(
                    ArrayAgg(
                        "labels__id",
                        distinct=True,
                        filter=Q(
                            ~Q(labels__id__isnull=True)
                            & Q(label_issue__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                assignee_ids=Coalesce(
                    ArrayAgg(
                        "assignees__id",
                        distinct=True,
                        filter=Q(
                            ~Q(assignees__id__isnull=True)
                            & Q(assignees__member_project__is_active=True)
                            & Q(issue_assignee__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                module_ids=Coalesce(
                    ArrayAgg(
                        "issue_module__module_id",
                        distinct=True,
                        filter=Q(
                            ~Q(issue_module__module_id__isnull=True)
                            & Q(issue_module__module__archived_at__isnull=True)
                            & Q(issue_module__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                release_ids=Coalesce(
                    ArrayAgg(
                        "issue_release__release_id",
                        distinct=True,
                        filter=Q(
                            ~Q(issue_release__release_id__isnull=True)
                            & Q(issue_release__release__archived_at__isnull=True)
                            & Q(issue_release__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
            )
            .filter(pk=pk)
            .first()
        )

        if not issue:
            redis_client.delete(lock_id)
            return Response(
                {"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND
            )

        if not has_project_issue_permission(
            user=request.user,
            workspace_slug=slug,
            project_id=str(project_id),
            action="edit",
            issue_type_id=str(issue.type_id) if issue.type_id else None,
            issue_assignee_ids=issue.assignee_ids,
        ):
            redis_client.delete(lock_id)
            return Response(
                {"error": "您没有所需的项目权限。"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # 工作流审批检查
        state_id = request.data.get("state_id")
        has_assignee_update = "assignee_ids" in request.data
        desired_assignee_ids = (
            request.data.get("assignee_ids")
            if has_assignee_update
            else getattr(issue, "assignee_ids", None)
        )
        if state_id and str(state_id) != str(issue.state_id):
            try:
                to_state = StateModel.objects.get(pk=state_id, project_id=project_id)
                allowed, error_msg, transition_record = check_update_state_permission(
                    issue=issue,
                    to_state=to_state,
                    user=request.user,
                    project_id=project_id,
                    target_assignee_ids=desired_assignee_ids,
                    approval_reason=approval_reason,
                )
                if not allowed:
                    redis_client.delete(lock_id)
                    resp_data = {"error": error_msg, "workflow_blocked": True}
                    if transition_record:
                        resp_data["transition_record_id"] = str(transition_record.id)
                    return Response(resp_data, status=status.HTTP_403_FORBIDDEN)
                # 直接放行时，取消该工作项所有进行中的审批流程
                cancel_issue_pending_transitions(
                    issue=issue,
                    cancelled_by=request.user,
                    project_id=str(project_id),
                )
            except StateModel.DoesNotExist:
                pass
        elif has_assignee_update and issue.state_id:
            allowed, error_msg = check_added_assignee_constraint(
                issue=issue,
                state=issue.state,
                desired_assignee_ids=desired_assignee_ids,
                current_assignee_ids=issue.assignee_ids,
            )
            if not allowed:
                redis_client.delete(lock_id)
                return Response(
                    {"error": error_msg, "workflow_blocked": True},
                    status=status.HTTP_403_FORBIDDEN,
                )

        # 评审期间内容变更检测：仅在存在 PENDING 审批时捕获快照，避免无谓查询
        approval_before_snapshot = None
        if IssueTransitionRecord.objects.filter(
            issue=issue, status=TransitionRecordStatus.PENDING
        ).exists():
            approval_before_snapshot = capture_issue_content_snapshot(
                issue=issue, assignee_ids=issue.assignee_ids
            )

        current_instance = json.dumps(
            IssueDetailSerializer(issue).data, cls=DjangoJSONEncoder
        )

        # 规则检查，是否有权限修改状态
        # if to_state_id := request.data.get('state_id'):
        #     to_state = State.objects.get(pk=to_state_id)
        #     result, reason = check_update_state_permission(issue=issue, to_state=to_state, user=request.user)
        #     if not result:
        #         return Response(
        #             {"error": reason},
        #             status=status.HTTP_400_BAD_REQUEST,
        #         )

        requested_data = json.dumps(self.request.data, cls=DjangoJSONEncoder)

        serializer = IssueCreateSerializer(
            issue, data=request.data, partial=True, context={"project_id": project_id}
        )
        if serializer.is_valid():
            serializer.save()
            # 评审期间核心字段或必填字段变更，重置已投票
            if approval_before_snapshot is not None:
                issue.refresh_from_db()
                reset_pending_transition_votes_if_content_changed(
                    issue=issue,
                    before_snapshot=approval_before_snapshot,
                    actor=request.user,
                    project_id=str(project_id),
                )
            # 仅当本次 PATCH 是描述迁移（编辑器补全 unique-id / 追加空段落等
            # 非用户语义修改）时跳过活动记录，避免误报 "updated the description"
            is_migration_description_update = skip_activity and is_description_update
            if not is_migration_description_update:
                issue_activity.delay(
                    type="issue.activity.updated",
                    requested_data=requested_data,
                    actor_id=str(request.user.id),
                    issue_id=str(pk),
                    project_id=str(project_id),
                    current_instance=current_instance,
                    epoch=int(timezone.now().timestamp()),
                    notification=True,
                    origin=base_host(request=request, is_app=True),
                )
            model_activity.delay(
                model_name="issue",
                model_id=str(serializer.data.get("id", None)),
                requested_data=request.data,
                current_instance=current_instance,
                actor_id=request.user.id,
                slug=slug,
                origin=base_host(request=request, is_app=True),
            )
            # updated issue description version
            issue_description_version_task.delay(
                updated_issue=current_instance,
                issue_id=str(serializer.data.get("id", None)),
                user_id=request.user.id,
            )
            redis_client.delete(lock_id)
            return Response(status=status.HTTP_204_NO_CONTENT)
        redis_client.delete(lock_id)
        return Response(
            {"error": serializer.errors}, status=status.HTTP_400_BAD_REQUEST
        )

    def destroy(self, request, slug, project_id, pk=None):
        issue = Issue.objects.select_related("type").get(
            workspace__slug=slug, project_id=project_id, pk=pk
        )

        if not has_project_issue_permission(
            user=request.user,
            workspace_slug=slug,
            project_id=str(project_id),
            action="delete",
            issue_type_id=str(issue.type_id) if issue.type_id else None,
        ):
            return Response(
                {"error": f"您没有所需的项目权限。"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # 同步软删关联行，保证需求侧工作项计数准确 —— 不能等 Celery 级联清理
        RequirementIssue.objects.filter(issue_id=pk).delete()
        issue.delete()
        # delete the issue from recent visits
        UserRecentVisit.objects.filter(
            project_id=project_id,
            workspace__slug=slug,
            entity_identifier=pk,
            entity_name="issue",
        ).delete(soft=False)
        issue_activity.delay(
            type="issue.activity.deleted",
            requested_data=json.dumps({"issue_id": str(pk)}),
            actor_id=str(request.user.id),
            issue_id=str(pk),
            project_id=str(project_id),
            current_instance={},
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=True),
            subscriber=False,
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectUserDisplayPropertyEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def patch(self, request, slug, project_id):
        try:
            issue_property = ProjectUserProperty.objects.get(
                user=request.user, project_id=project_id
            )
        except ProjectUserProperty.DoesNotExist:
            issue_property = ProjectUserProperty.objects.create(
                user=request.user, project_id=project_id
            )

        serializer = ProjectUserPropertySerializer(
            issue_property, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        issue_property, _ = ProjectUserProperty.objects.get_or_create(
            user=request.user, project_id=project_id
        )
        serializer = ProjectUserPropertySerializer(issue_property)
        return Response(serializer.data, status=status.HTTP_200_OK)


class BulkDeleteIssuesEndpoint(BaseAPIView):

    def delete(self, request, slug, project_id):
        issue_ids = request.data.get("issue_ids", [])

        if not len(issue_ids):
            return Response(
                {"error": "Issue IDs are required"}, status=status.HTTP_400_BAD_REQUEST
            )

        issues = Issue.issue_objects.filter(
            workspace__slug=slug, project_id=project_id, pk__in=issue_ids
        )
        issue_type_ids = set(
            issues.filter(type__isnull=False)
            .values_list("type_id", flat=True)
            .distinct()
        )

        for issue_type_id in issue_type_ids:
            if not has_project_issue_permission(
                user=request.user,
                workspace_slug=slug,
                project_id=str(project_id),
                action="delete",
                issue_type_id=str(issue_type_id),
            ):
                return Response(
                    {"error": f"您没有所需的项目权限。"},
                    status=status.HTTP_403_FORBIDDEN,
                )

        total_issues = len(issues)

        # First, delete all related cycle issues
        CycleIssue.objects.filter(issue_id__in=issue_ids).delete()

        # Then, delete all related module issues
        ModuleIssue.objects.filter(issue_id__in=issue_ids).delete()

        # Finally, delete the issues themselves
        issues.delete()

        return Response(
            {"message": f"{total_issues} issues were deleted"},
            status=status.HTTP_200_OK,
        )


# ---------------------------------------------------------------------------
# 工作项导出相关常量与工具
# ---------------------------------------------------------------------------

# 有序 manifest：顺序即默认列顺序
EXPORT_ALL_FIELDS = [
    "key",
    "name",
    "description",
    "state",
    "state_group",
    "priority",
    "issue_type",
    "is_draft",
    "assignees",
    "created_by",
    "updated_by",
    "labels",
    "cycles",
    "modules",
    "parent_key",
    "parent_name",
    "project",
    "start_date",
    "target_date",
    "completed_at",
    "created_at",
    "updated_at",
    "id",
    "estimate",
    "sub_issues_count",
    "link_count",
    "attachment_count",
]

EXPORT_FIELD_LABELS = {
    "id": "ID",
    "key": "标识",
    "name": "标题",
    "description": "描述",
    "state": "状态",
    "state_group": "状态分组",
    "priority": "优先级",
    "issue_type": "工作项类型",
    "is_draft": "草稿",
    "assignees": "负责人",
    "created_by": "创建人",
    "updated_by": "最后更新人",
    "labels": "标签",
    "cycles": "迭代",
    "modules": "模块",
    "parent_key": "父工作项标识",
    "parent_name": "父工作项标题",
    "project": "项目",
    "start_date": "开始日期",
    "target_date": "截止日期",
    "completed_at": "完成时间",
    "created_at": "创建时间",
    "updated_at": "更新时间",
    "estimate": "预估",
    "sub_issues_count": "子项数",
    "link_count": "链接数",
    "attachment_count": "附件数",
}

PRIORITY_CN_MAP = {
    "urgent": "紧急",
    "high": "高",
    "medium": "中",
    "low": "低",
    "none": "无",
}

STATE_GROUP_CN_MAP = {
    "backlog": "待处理",
    "unstarted": "未开始",
    "started": "进行中",
    "completed": "已完成",
    "cancelled": "已取消",
}

# 导出时多值字段在 CSV/XLSX 中的连接符
_LIST_JOIN_SEP = "、"


def _fmt_dt(value, tz=None):
    """将时间字段格式化为 YYYY-MM-DD HH:mm:ss。

    若传入 tz（pytz.tzinfo），会先 astimezone 到目标时区再格式化，
    用于按当前用户的时区导出；否则按原时区原样打印。
    """
    if not value:
        return None
    try:
        if tz is not None and getattr(value, "tzinfo", None) is not None:
            value = value.astimezone(tz)
        return value.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return str(value)


def _fmt_date(value):
    if not value:
        return None
    return str(value)


def _resolve_user_tz(user_timezone):
    """解析用户时区为 pytz tz 对象；解析失败回退到 UTC。"""
    if not user_timezone:
        return pytz.UTC
    try:
        return pytz.timezone(user_timezone)
    except Exception:
        return pytz.UTC


def _build_issue_export_row(issue, fields, tz=None):
    """根据 fields 白名单构造单条工作项导出行。返回有序字典 {key: value}。

    value 保持原始 Python 类型（list / str / int / bool / None），
    具体格式化（join、None -> 空字符串）由各 format 分支决定。
    """
    labels = [il.label.name for il in issue.label_issue.all() if il.label]
    assignees = [
        ia.assignee.display_name for ia in issue.issue_assignee.all() if ia.assignee
    ]
    cycles = [ci.cycle.name for ci in issue.issue_cycle.all() if ci.cycle]
    modules = [mi.module.name for mi in issue.issue_module.all() if mi.module]

    project = issue.project
    project_identifier = project.identifier if project else None
    issue_key = (
        f"{project_identifier}-{issue.sequence_id}"
        if project_identifier and issue.sequence_id is not None
        else None
    )
    parent = issue.parent
    parent_key = None
    if parent is not None:
        parent_project_identifier = (
            parent.project.identifier if parent.project_id and parent.project else None
        )
        if parent_project_identifier and parent.sequence_id is not None:
            parent_key = f"{parent_project_identifier}-{parent.sequence_id}"

    resolvers = {
        "id": lambda: str(issue.id),
        "key": lambda: issue_key,
        "name": lambda: issue.name,
        "description": lambda: issue.description_stripped or "",
        "state": lambda: issue.state.name if issue.state else None,
        "state_group": lambda: (
            STATE_GROUP_CN_MAP.get(issue.state.group, issue.state.group)
            if issue.state
            else None
        ),
        "priority": lambda: PRIORITY_CN_MAP.get(issue.priority, issue.priority),
        "issue_type": lambda: issue.type.name if issue.type else None,
        "is_draft": lambda: bool(issue.is_draft),
        "assignees": lambda: assignees,
        "created_by": lambda: (
            issue.created_by.display_name if issue.created_by else None
        ),
        "updated_by": lambda: (
            issue.updated_by.display_name if issue.updated_by else None
        ),
        "labels": lambda: labels,
        "cycles": lambda: cycles,
        "modules": lambda: modules,
        "parent_key": lambda: parent_key,
        "parent_name": lambda: parent.name if parent else None,
        "project": lambda: project.name if project else None,
        "start_date": lambda: _fmt_date(issue.start_date),
        "target_date": lambda: _fmt_date(issue.target_date),
        "completed_at": lambda: _fmt_dt(issue.completed_at, tz),
        "created_at": lambda: _fmt_dt(issue.created_at, tz),
        "updated_at": lambda: _fmt_dt(issue.updated_at, tz),
        "estimate": lambda: (
            issue.estimate_point.value if issue.estimate_point else None
        ),
        "sub_issues_count": lambda: issue.sub_issues_count or 0,
        "link_count": lambda: issue.link_count or 0,
        "attachment_count": lambda: issue.attachment_count or 0,
    }

    row = {}
    for key in fields:
        resolver = resolvers.get(key)
        row[key] = resolver() if resolver else None
    return row


def _cell_str(value):
    """将单元格值转为字符串（CSV/XLSX 表格展示用）。"""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "是" if value else "否"
    if isinstance(value, (list, tuple)):
        return _LIST_JOIN_SEP.join(str(v) for v in value if v is not None)
    return str(value)


def _attach_download_filename(response, filename):
    """设置下载文件名，兼容中文。"""
    response["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(filename)}"
    # 允许前端读取 Content-Disposition（跨域或拦截器场景）
    existing_expose = response.get("Access-Control-Expose-Headers", "")
    headers_to_expose = {h.strip() for h in existing_expose.split(",") if h.strip()}
    headers_to_expose.add("Content-Disposition")
    response["Access-Control-Expose-Headers"] = ", ".join(sorted(headers_to_expose))
    return response


class BulkExportIssuesEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def post(self, request, slug, project_id):
        scope = request.data.get("scope", "selected")
        raw_fields = request.data.get("fields") or []
        export_format = (request.data.get("format") or "json").lower()

        if scope not in ("selected", "filtered", "cycles"):
            return Response(
                {"error": "scope must be 'selected', 'filtered' or 'cycles'"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if export_format not in ("json", "csv", "xlsx"):
            return Response(
                {"error": "format must be 'json', 'csv' or 'xlsx'"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 字段白名单：未传则使用全部，传了则按用户顺序并去掉未知字段
        if raw_fields:
            fields = [f for f in raw_fields if f in EXPORT_FIELD_LABELS]
            if not fields:
                return Response(
                    {"error": "fields contains no valid column"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            fields = list(EXPORT_ALL_FIELDS)

        queryset = Issue.issue_objects.filter(
            workspace__slug=slug, project_id=project_id
        )

        if scope == "selected":
            issue_ids = request.data.get("issue_ids") or []
            if not issue_ids:
                return Response(
                    {"error": "issue_ids is required when scope=selected"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            queryset = queryset.filter(pk__in=issue_ids)
        elif scope == "filtered":
            # 复用列表接口的筛选逻辑，参数仍从 query string 读取
            legacy_filters = issue_filters(request.query_params, "GET")
            if legacy_filters:
                queryset = queryset.filter(**legacy_filters)
        else:
            cycle_ids = request.data.get("cycle_ids") or []
            if not cycle_ids:
                return Response(
                    {"error": "cycle_ids is required when scope=cycles"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            queryset = queryset.filter(
                issue_cycle__cycle_id__in=cycle_ids,
                issue_cycle__deleted_at__isnull=True,
            )

        issues = (
            queryset.select_related(
                "state",
                "type",
                "estimate_point",
                "project",
                "parent",
                "parent__project",
                "created_by",
                "updated_by",
            )
            .prefetch_related(
                Prefetch(
                    "label_issue",
                    queryset=IssueLabel.objects.filter(
                        deleted_at__isnull=True
                    ).select_related("label"),
                ),
                Prefetch(
                    "issue_assignee",
                    queryset=IssueAssignee.objects.filter(
                        deleted_at__isnull=True
                    ).select_related("assignee"),
                ),
                Prefetch(
                    "issue_cycle",
                    queryset=CycleIssue.objects.filter(
                        deleted_at__isnull=True
                    ).select_related("cycle"),
                ),
                Prefetch(
                    "issue_module",
                    queryset=ModuleIssue.objects.filter(
                        deleted_at__isnull=True
                    ).select_related("module"),
                ),
            )
            .annotate(
                sub_issues_count=Subquery(
                    Issue.issue_objects.filter(parent=OuterRef("id"))
                    .values("parent")
                    .annotate(count=Count("id"))
                    .values("count")
                ),
                link_count=Subquery(
                    IssueLink.objects.filter(issue=OuterRef("id"))
                    .values("issue")
                    .annotate(count=Count("id"))
                    .values("count")
                ),
                attachment_count=Subquery(
                    FileAsset.objects.filter(
                        issue_id=OuterRef("id"),
                        entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                    )
                    .values("issue_id")
                    .annotate(count=Count("id"))
                    .values("count")
                ),
            )
            .order_by("-created_at")
            .distinct()
        )

        user_tz = _resolve_user_tz(getattr(request.user, "user_timezone", None))
        rows = [_build_issue_export_row(issue, fields, user_tz) for issue in issues]

        timestamp = timezone.now().strftime("%Y%m%d%H%M%S")
        filename_base = f"工作项导出_{timestamp}"
        headers_cn = [EXPORT_FIELD_LABELS.get(k, k) for k in fields]

        if export_format == "json":
            response = Response(rows, status=status.HTTP_200_OK)
            # 纯 JSON 下载由前端以 blob 形式触发，给出建议文件名
            _attach_download_filename(response, f"{filename_base}.json")
            return response

        if export_format == "csv":
            buffer = io.StringIO()
            writer = csv.writer(buffer)
            writer.writerow(headers_cn)
            for row in rows:
                writer.writerow([_cell_str(row.get(k)) for k in fields])
            # utf-8-sig 让 Excel 直接识别中文
            content = "\ufeff" + buffer.getvalue()
            response = HttpResponse(
                content.encode("utf-8"),
                content_type="text/csv; charset=utf-8",
            )
            return _attach_download_filename(response, f"{filename_base}.csv")

        # xlsx
        workbook = Workbook()
        ws = workbook.active
        ws.title = "工作项"
        ws.append(headers_cn)
        for row in rows:
            ws.append([_cell_str(row.get(k)) for k in fields])

        # 简易列宽自适应
        for idx, key in enumerate(fields, start=1):
            base_width = max(len(EXPORT_FIELD_LABELS.get(key, key)) * 2 + 4, 12)
            ws.column_dimensions[ws.cell(row=1, column=idx).column_letter].width = min(
                base_width, 40
            )

        bio = io.BytesIO()
        workbook.save(bio)
        bio.seek(0)
        response = FileResponse(
            bio,
            as_attachment=True,
            content_type=(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ),
        )
        return _attach_download_filename(response, f"{filename_base}.xlsx")


class DeletedIssuesListViewSet(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        filters = {}
        if request.GET.get("updated_at__gt", None) is not None:
            filters = {"updated_at__gt": request.GET.get("updated_at__gt")}
        deleted_issues = (
            Issue.all_objects.filter(workspace__slug=slug, project_id=project_id)
            .filter(Q(archived_at__isnull=False) | Q(deleted_at__isnull=False))
            .filter(**filters)
            .values_list("id", flat=True)
        )

        return Response(deleted_issues, status=status.HTTP_200_OK)


class IssuePaginatedViewSet(BaseViewSet):
    def get_queryset(self):
        workspace_slug = self.kwargs.get("slug")
        project_id = self.kwargs.get("project_id")

        issue_queryset = Issue.issue_objects.filter(
            workspace__slug=workspace_slug, project_id=project_id
        )

        return (
            issue_queryset.select_related("state")
            .annotate(
                cycle_id=Subquery(
                    CycleIssue.objects.filter(issue=OuterRef("id")).values("cycle_id")[
                        :1
                    ]
                )
            )
            .annotate(
                link_count=Subquery(
                    IssueLink.objects.filter(issue=OuterRef("id"))
                    .values("issue")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                attachment_count=Subquery(
                    FileAsset.objects.filter(
                        issue_id=OuterRef("id"),
                        entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
                    )
                    .values("issue_id")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
            .annotate(
                sub_issues_count=Subquery(
                    Issue.issue_objects.filter(parent=OuterRef("id"))
                    .values("parent")
                    .annotate(count=Count("id"))
                    .values("count")
                )
            )
        )

    def process_paginated_result(self, fields, results, timezone):
        paginated_data = results.values(*fields)

        # converting the datetime fields in paginated data
        datetime_fields = ["created_at", "updated_at"]
        paginated_data = user_timezone_converter(
            paginated_data, datetime_fields, timezone
        )

        return paginated_data

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        scope, permission_error = _check_project_issue_page_scope_permission(
            request, slug, project_id
        )
        if permission_error:
            return permission_error

        cursor = request.GET.get("cursor", None)
        is_description_required = request.GET.get("description", "false")
        updated_at = request.GET.get("updated_at__gt", None)

        # required fields
        required_fields = [
            "id",
            "name",
            "state_id",
            "state__group",
            "sort_order",
            "completed_at",
            "estimate_point",
            "priority",
            "start_date",
            "target_date",
            "sequence_id",
            "project_id",
            "parent_id",
            "cycle_id",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
            "is_draft",
            "archived_at",
            "module_ids",
            "release_ids",
            "label_ids",
            "assignee_ids",
            "link_count",
            "attachment_count",
            "sub_issues_count",
        ]

        if str(is_description_required).lower() == "true":
            required_fields.append("description_html")

        # querying issues
        base_queryset = Issue.issue_objects.filter(
            workspace__slug=slug, project_id=project_id
        )
        base_queryset = _apply_project_issue_page_scope_filter(base_queryset, scope)

        base_queryset = base_queryset.order_by("updated_at")
        queryset = _apply_project_issue_page_scope_filter(
            self.get_queryset(), scope
        ).order_by("updated_at")

        # validation for guest user
        project = Project.objects.get(pk=project_id, workspace__slug=slug)
        project_member = ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            member=request.user,
            role=5,
            is_active=True,
        )
        if project_member.exists() and not project.guest_view_all_features:
            base_queryset = base_queryset.filter(created_by=request.user)
            queryset = queryset.filter(created_by=request.user)

        # filtering issues by greater then updated_at given by the user
        if updated_at:
            base_queryset = base_queryset.filter(updated_at__gt=updated_at)
            queryset = queryset.filter(updated_at__gt=updated_at)

        queryset = queryset.annotate(
            label_ids=Coalesce(
                Subquery(
                    IssueLabel.objects.filter(issue_id=OuterRef("pk"))
                    .values("issue_id")
                    .annotate(arr=ArrayAgg("label_id", distinct=True))
                    .values("arr")
                ),
                Value([], output_field=ArrayField(UUIDField())),
            ),
            assignee_ids=Coalesce(
                Subquery(
                    IssueAssignee.objects.filter(
                        issue_id=OuterRef("pk"),
                        assignee__member_project__is_active=True,
                    )
                    .values("issue_id")
                    .annotate(arr=ArrayAgg("assignee_id", distinct=True))
                    .values("arr")
                ),
                Value([], output_field=ArrayField(UUIDField())),
            ),
            module_ids=Coalesce(
                Subquery(
                    ModuleIssue.objects.filter(
                        issue_id=OuterRef("pk"),
                        module__archived_at__isnull=True,
                    )
                    .values("issue_id")
                    .annotate(arr=ArrayAgg("module_id", distinct=True))
                    .values("arr")
                ),
                Value([], output_field=ArrayField(UUIDField())),
            ),
            release_ids=Coalesce(
                Subquery(
                    ReleaseIssue.objects.filter(
                        issue_id=OuterRef("pk"),
                        deleted_at__isnull=True,
                        release__archived_at__isnull=True,
                    )
                    .values("issue_id")
                    .annotate(arr=ArrayAgg("release_id", distinct=True))
                    .values("arr")
                ),
                Value([], output_field=ArrayField(UUIDField())),
            ),
        )

        paginated_data = paginate(
            base_queryset=base_queryset,
            queryset=queryset,
            cursor=cursor,
            on_result=lambda results: self.process_paginated_result(
                required_fields, results, request.user.user_timezone
            ),
        )

        return Response(paginated_data, status=status.HTTP_200_OK)


class IssueDetailEndpoint(BaseAPIView):
    filter_backends = (IssueComplexFilterBackend,)
    filterset_class = IssueFilterSet

    def apply_annotations(self, issues):
        return (
            issues.annotate(
                cycle_id=Subquery(
                    CycleIssue.objects.filter(
                        issue=OuterRef("id"), deleted_at__isnull=True
                    ).values("cycle_id")[:1]
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
            .prefetch_related(
                Prefetch(
                    "issue_assignee",
                    queryset=IssueAssignee.objects.all(),
                )
            )
            .prefetch_related(
                Prefetch(
                    "label_issue",
                    queryset=IssueLabel.objects.all(),
                )
            )
            .prefetch_related(
                Prefetch(
                    "issue_module",
                    queryset=ModuleIssue.objects.all(),
                )
            )
            .prefetch_related(
                Prefetch(
                    "issue_release",
                    queryset=ReleaseIssue.objects.filter(
                        deleted_at__isnull=True,
                        release__archived_at__isnull=True,
                    ).select_related("release"),
                )
            )
            .prefetch_related(
                Prefetch(
                    "type__extra_fields",
                    queryset=TypeExtraField.objects.filter(
                        is_active=True, deleted_at__isnull=True
                    ).order_by("sort_order", "created_at"),
                )
            )
        )

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        scope, permission_error = _check_project_issue_page_scope_permission(
            request, slug, project_id
        )
        if permission_error:
            return permission_error

        filters = issue_filters(request.query_params, "GET")

        # check for the project member role, if the role is 5 then check for the guest_view_all_features
        #  if it is true then show all the issues else show only the issues created by the user
        permission_subquery = (
            Issue.issue_objects.filter(
                workspace__slug=slug, project_id=project_id, id=OuterRef("id")
            )
            .filter(
                Q(
                    project__project_projectmember__member=self.request.user,
                    project__project_projectmember__is_active=True,
                    project__project_projectmember__role__gt=ROLE.GUEST.value,
                )
                | Q(
                    project__project_projectmember__member=self.request.user,
                    project__project_projectmember__is_active=True,
                    project__project_projectmember__role=ROLE.GUEST.value,
                    project__guest_view_all_features=True,
                )
                | Q(
                    project__project_projectmember__member=self.request.user,
                    project__project_projectmember__is_active=True,
                    project__project_projectmember__role=ROLE.GUEST.value,
                    project__guest_view_all_features=False,
                    created_by=self.request.user,
                )
            )
            .values("id")
        )
        # Main issue query
        issue = Issue.issue_objects.filter(
            workspace__slug=slug, project_id=project_id
        ).filter(Exists(permission_subquery))
        issue = _apply_project_issue_page_scope_filter(issue, scope)

        # Add additional prefetch based on expand parameter
        if self.expand:
            if "issue_relation" in self.expand:
                issue = issue.prefetch_related(
                    Prefetch(
                        "issue_relation",
                        queryset=IssueRelation.objects.select_related("related_issue"),
                    )
                )
            if "issue_related" in self.expand:
                issue = issue.prefetch_related(
                    Prefetch(
                        "issue_related",
                        queryset=IssueRelation.objects.select_related("issue"),
                    )
                )

        # Apply filtering from filterset
        issue = self.filter_queryset(issue)

        # Apply legacy filters
        issue = issue.filter(**filters)

        # Total count queryset
        total_issue_queryset = copy.deepcopy(issue)

        # Applying annotations to the issue queryset
        issue = self.apply_annotations(issue)

        order_by_param = request.GET.get("order_by", "-created_at")

        # Issue queryset
        issue, order_by_param = order_issue_queryset(
            issue_queryset=issue, order_by_param=order_by_param
        )
        return self.paginate(
            request=request,
            order_by=order_by_param,
            queryset=issue,
            total_count_queryset=total_issue_queryset,
            on_results=lambda issue: IssueListDetailSerializer(
                issue, many=True, fields=self.fields, expand=self.expand
            ).data,
        )


class IssueBulkUpdateDateEndpoint(BaseAPIView):
    def validate_dates(self, current_start, current_target, new_start, new_target):
        """
        Validate that start date is before target date.
        """
        from datetime import datetime

        start = new_start or current_start
        target = new_target or current_target

        # Convert string dates to datetime objects if they're strings
        if isinstance(start, str):
            start = datetime.strptime(start, "%Y-%m-%d").date()
        if isinstance(target, str):
            target = datetime.strptime(target, "%Y-%m-%d").date()

        if start and target and start > target:
            return False
        return True

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER])
    def post(self, request, slug, project_id):
        updates = request.data.get("updates", [])

        issue_ids = [update["id"] for update in updates]
        epoch = int(timezone.now().timestamp())

        # Fetch all relevant issues in a single query
        issues = list(Issue.objects.filter(id__in=issue_ids))
        issues_dict = {str(issue.id): issue for issue in issues}
        issues_to_update = []

        for update in updates:
            issue_id = update["id"]
            issue = issues_dict.get(issue_id)

            if not issue:
                continue

            start_date = update.get("start_date")
            target_date = update.get("target_date")
            validate_dates = self.validate_dates(
                issue.start_date, issue.target_date, start_date, target_date
            )
            if not validate_dates:
                return Response(
                    {"message": "Start date cannot exceed target date"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if start_date:
                issue_activity.delay(
                    type="issue.activity.updated",
                    requested_data=json.dumps({"start_date": update.get("start_date")}),
                    current_instance=json.dumps({"start_date": str(issue.start_date)}),
                    issue_id=str(issue_id),
                    actor_id=str(request.user.id),
                    project_id=str(project_id),
                    epoch=epoch,
                )
                issue.start_date = start_date
                issues_to_update.append(issue)

            if target_date:
                issue_activity.delay(
                    type="issue.activity.updated",
                    requested_data=json.dumps(
                        {"target_date": update.get("target_date")}
                    ),
                    current_instance=json.dumps(
                        {"target_date": str(issue.target_date)}
                    ),
                    issue_id=str(issue_id),
                    actor_id=str(request.user.id),
                    project_id=str(project_id),
                    epoch=epoch,
                )
                issue.target_date = target_date
                issues_to_update.append(issue)

        # Bulk update issues
        Issue.objects.bulk_update(issues_to_update, ["start_date", "target_date"])

        return Response(
            {"message": "Issues updated successfully"}, status=status.HTTP_200_OK
        )


class IssueMetaEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="PROJECT")
    def get(self, request, slug, project_id, issue_id):
        issue = Issue.issue_objects.only("sequence_id", "project__identifier").get(
            id=issue_id, project_id=project_id, workspace__slug=slug
        )
        return Response(
            {
                "sequence_id": issue.sequence_id,
                "project_identifier": issue.project.identifier,
            },
            status=status.HTTP_200_OK,
        )


class IssueDetailIdentifierEndpoint(BaseAPIView):
    def strict_str_to_int(self, s):
        if not s.isdigit() and not (s.startswith("-") and s[1:].isdigit()):
            raise ValueError("Invalid integer string")
        return int(s)

    def get(self, request, slug, project_identifier, issue_identifier):
        # Check if the issue identifier is a valid integer
        try:
            issue_identifier = self.strict_str_to_int(issue_identifier)
        except ValueError:
            return Response(
                {"error": "Invalid issue identifier"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Fetch the project
        project = Project.objects.get(
            identifier__iexact=project_identifier, workspace__slug=slug
        )

        # Check if the user is a member of the project
        if not ProjectMember.objects.filter(
            workspace__slug=slug,
            project_id=project.id,
            member=request.user,
            is_active=True,
        ).exists():
            return Response(
                {"error": "You are not allowed to view this issue"},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Fetch the issue
        issue = (
            Issue.objects.filter(project_id=project.id)
            .filter(workspace__slug=slug)
            .select_related("workspace", "project", "state", "parent", "type")
            .prefetch_related(
                "assignees", "labels", "issue_module__module", "issue_release__release"
            )
            .prefetch_related(
                Prefetch(
                    "type__extra_fields",
                    queryset=TypeExtraField.objects.filter(
                        is_active=True, deleted_at__isnull=True
                    ).order_by("sort_order", "created_at"),
                )
            )
            .annotate(
                cycle_id=Subquery(
                    CycleIssue.objects.filter(issue=OuterRef("id")).values("cycle_id")[
                        :1
                    ]
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
            .filter(sequence_id=issue_identifier)
            .annotate(
                label_ids=Coalesce(
                    ArrayAgg(
                        "labels__id",
                        distinct=True,
                        filter=Q(
                            ~Q(labels__id__isnull=True)
                            & Q(label_issue__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                assignee_ids=Coalesce(
                    ArrayAgg(
                        "assignees__id",
                        distinct=True,
                        filter=Q(
                            ~Q(assignees__id__isnull=True)
                            & Q(assignees__member_project__is_active=True)
                            & Q(issue_assignee__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                module_ids=Coalesce(
                    ArrayAgg(
                        "issue_module__module_id",
                        distinct=True,
                        filter=Q(
                            ~Q(issue_module__module_id__isnull=True)
                            & Q(issue_module__module__archived_at__isnull=True)
                            & Q(issue_module__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
                release_ids=Coalesce(
                    ArrayAgg(
                        "issue_release__release_id",
                        distinct=True,
                        filter=Q(
                            ~Q(issue_release__release_id__isnull=True)
                            & Q(issue_release__release__archived_at__isnull=True)
                            & Q(issue_release__deleted_at__isnull=True)
                        ),
                    ),
                    Value([], output_field=ArrayField(UUIDField())),
                ),
            )
            .prefetch_related(
                Prefetch(
                    "issue_reactions",
                    queryset=IssueReaction.objects.select_related("issue", "actor"),
                )
            )
            .prefetch_related(
                Prefetch(
                    "issue_link",
                    queryset=IssueLink.objects.select_related("created_by"),
                )
            )
            .annotate(
                is_subscribed=Exists(
                    IssueSubscriber.objects.filter(
                        workspace__slug=slug,
                        project_id=project.id,
                        issue__sequence_id=issue_identifier,
                        subscriber=request.user,
                    )
                )
            )
            .annotate(
                is_intake=Exists(
                    IntakeIssue.objects.filter(
                        issue=OuterRef("id"),
                        status__in=[-2, 0],
                        workspace__slug=slug,
                        project_id=project.id,
                    )
                )
            )
        ).first()

        # Check if the issue exists
        if not issue:
            return Response(
                {"error": "The required object does not exist."},
                status=status.HTTP_404_NOT_FOUND,
            )

        """
        if the role is guest and guest_view_all_features is false and owned by is not
        the requesting user then dont show the issue
        """

        if (
            ProjectMember.objects.filter(
                workspace__slug=slug,
                project_id=project.id,
                member=request.user,
                role=5,
                is_active=True,
            ).exists()
            and not project.guest_view_all_features
            and not issue.created_by == request.user
        ):
            return Response(
                {"error": "You are not allowed to view this issue"},
                status=status.HTTP_403_FORBIDDEN,
            )

        recent_visited_task.delay(
            slug=slug,
            entity_name="issue",
            entity_identifier=str(issue.id),
            user_id=str(request.user.id),
            project_id=str(project.id),
        )

        # Serialize the issue
        serializer = IssueDetailSerializer(issue, expand=self.expand)
        return Response(serializer.data, status=status.HTTP_200_OK)
