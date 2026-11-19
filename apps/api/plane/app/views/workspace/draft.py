# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import json

# Django imports
from django.utils import timezone
from django.core import serializers
from django.core.exceptions import FieldError
from django.core.serializers.json import DjangoJSONEncoder
from django.db.models import Subquery, OuterRef
from django.utils.decorators import method_decorator
from django.views.decorators.gzip import gzip_page

# Third Party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import allow_workspace_member, allow_creator_or
from plane.app.serializers import (
    IssueCreateSerializer,
    DraftIssueCreateSerializer,
    DraftIssueSerializer,
    DraftIssueDetailSerializer,
)
from plane.db.models import (
    DraftIssue,
    CycleIssue,
    ModuleIssue,
    DraftIssueCycle,
    Workspace,
    FileAsset,
)
from .. import BaseViewSet
from plane.bgtasks.issue_activities_task import issue_activity
from plane.utils.issue_filters import issue_filters
from plane.utils.host import base_host
from plane.utils.issue_id_arrays import draft_issue_id_array_annotations


# issue_filters 按工作项表生成条件；草稿的关联表名字不同，换成草稿的
DRAFT_RELATION_NAMES = {
    "label_issue__": "draft_label_issue__",
    "issue_assignee__": "draft_issue_assignee__",
    "issue_cycle__": "draft_issue_cycle__",
    "issue_module__": "draft_issue_module__",
}


def draft_issue_filters(filters):
    """把工作项筛选条件换成草稿能用的；草稿没有的条件（提及、订阅、产品、阶段等）跳过，不再报 500。"""
    result = {}
    for key, value in filters.items():
        for issue_name, draft_name in DRAFT_RELATION_NAMES.items():
            if key.startswith(issue_name):
                key = draft_name + key[len(issue_name) :]
                break
        try:
            DraftIssue.objects.filter(**{key: value})
        except FieldError:
            continue
        result[key] = value
    return result


class WorkspaceDraftIssueViewSet(BaseViewSet):
    model = DraftIssue

    def get_queryset(self):
        return (
            DraftIssue.objects.filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace", "project", "state", "parent")
            .prefetch_related("assignees", "labels", "draft_issue_module__module")
            .annotate(
                cycle_id=Subquery(
                    DraftIssueCycle.objects.filter(draft_issue=OuterRef("id"), deleted_at__isnull=True).values(
                        "cycle_id"
                    )[:1]
                )
            )
            # id 数组走关联子查询，不 JOIN + GROUP BY（见 issue_id_arrays 模块说明）
            .annotate(**draft_issue_id_array_annotations())
        ).distinct()

    @method_decorator(gzip_page)
    @allow_workspace_member
    def list(self, request, slug):
        filters = draft_issue_filters(issue_filters(request.query_params, "GET"))
        issues = self.get_queryset().filter(created_by=request.user).order_by("-created_at")

        issues = issues.filter(**filters)
        # List Paginate
        return self.paginate(
            request=request,
            queryset=(issues),
            on_results=lambda issues: DraftIssueSerializer(issues, many=True).data,
        )

    @allow_workspace_member
    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)

        serializer = DraftIssueCreateSerializer(
            data=request.data,
            context={
                "workspace_id": workspace.id,
                "project_id": request.data.get("project_id", None),
            },
        )
        if serializer.is_valid():
            serializer.save()
            issue = (
                self.get_queryset()
                .filter(pk=serializer.data.get("id"))
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
                    "project_id",
                    "parent_id",
                    "cycle_id",
                    "module_ids",
                    "label_ids",
                    "assignee_ids",
                    "created_at",
                    "updated_at",
                    "created_by",
                    "updated_by",
                    "type_id",
                    "description_html",
                )
                .first()
            )

            return Response(issue, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_creator_or(model=DraftIssue, level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        issue = self.get_queryset().filter(pk=pk, created_by=request.user).first()

        if not issue:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)

        project_id = request.data.get("project_id", issue.project_id)

        serializer = DraftIssueCreateSerializer(
            issue,
            data=request.data,
            partial=True,
            context={
                "project_id": project_id,
                "cycle_id": request.data.get("cycle_id", "not_provided"),
            },
        )

        if serializer.is_valid():
            serializer.save()

            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_creator_or(model=DraftIssue, level="WORKSPACE")
    def retrieve(self, request, slug, pk=None):
        issue = self.get_queryset().filter(pk=pk, created_by=request.user).first()

        if not issue:
            return Response(
                {"error": "The required object does not exist."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = DraftIssueDetailSerializer(issue)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_creator_or(model=DraftIssue, level="WORKSPACE")
    def destroy(self, request, slug, pk=None):
        draft_issue = DraftIssue.objects.get(workspace__slug=slug, pk=pk)
        draft_issue.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_workspace_member
    def create_draft_to_issue(self, request, slug, draft_id):
        draft_issue = self.get_queryset().filter(pk=draft_id).first()

        if not draft_issue.project_id:
            return Response(
                {"error": "Project is required to create an issue."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = IssueCreateSerializer(
            data=request.data,
            context={
                "project_id": draft_issue.project_id,
                "workspace_id": draft_issue.project.workspace_id,
                "default_assignee_id": draft_issue.project.default_assignee_id,
            },
        )

        if serializer.is_valid():
            serializer.save()

            issue_activity.delay(
                type="issue.activity.created",
                requested_data=json.dumps(self.request.data, cls=DjangoJSONEncoder),
                actor_id=str(request.user.id),
                issue_id=str(serializer.data.get("id", None)),
                project_id=str(draft_issue.project_id),
                current_instance=None,
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=base_host(request=request, is_app=True),
            )

            if request.data.get("cycle_id", None):
                created_records = CycleIssue.objects.create(
                    cycle_id=request.data.get("cycle_id", None),
                    issue_id=serializer.data.get("id", None),
                    project_id=draft_issue.project_id,
                    workspace_id=draft_issue.workspace_id,
                    created_by_id=draft_issue.created_by_id,
                    updated_by_id=draft_issue.updated_by_id,
                )
                # Capture Issue Activity
                issue_activity.delay(
                    type="cycle.activity.created",
                    requested_data=None,
                    actor_id=str(self.request.user.id),
                    issue_id=None,
                    project_id=str(self.kwargs.get("project_id", None)),
                    current_instance=json.dumps(
                        {
                            "updated_cycle_issues": None,
                            "created_cycle_issues": serializers.serialize("json", [created_records]),
                        }
                    ),
                    epoch=int(timezone.now().timestamp()),
                    notification=True,
                    origin=base_host(request=request, is_app=True),
                )

            if request.data.get("module_ids", []):
                # bulk create the module
                ModuleIssue.objects.bulk_create(
                    [
                        ModuleIssue(
                            module_id=module,
                            issue_id=serializer.data.get("id", None),
                            workspace_id=draft_issue.workspace_id,
                            project_id=draft_issue.project_id,
                            created_by_id=draft_issue.created_by_id,
                            updated_by_id=draft_issue.updated_by_id,
                        )
                        for module in request.data.get("module_ids", [])
                    ],
                    batch_size=10,
                )
                # Update the activity
                _ = [
                    issue_activity.delay(
                        type="module.activity.created",
                        requested_data=json.dumps({"module_id": str(module)}),
                        actor_id=str(request.user.id),
                        issue_id=serializer.data.get("id", None),
                        project_id=draft_issue.project_id,
                        current_instance=None,
                        epoch=int(timezone.now().timestamp()),
                        notification=True,
                        origin=base_host(request=request, is_app=True),
                    )
                    for module in request.data.get("module_ids", [])
                ]

            # Update file assets
            file_assets = FileAsset.objects.filter(draft_issue_id=draft_id)
            file_assets.update(
                issue_id=serializer.data.get("id", None),
                entity_type=FileAsset.EntityTypeContext.ISSUE_DESCRIPTION,
                draft_issue_id=None,
            )

            # delete the draft issue
            draft_issue.delete()

            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
