"""研发模式关联的工作项类型：workspaces/<slug>/dev-modes/<dev_mode_id>/issue-types/。

类型都在工作区的类型库方案里（``DevMode.issue_scheme``），模式只决定用其中哪些、按什么顺序。
跟随该模式的项目只看得到这里关联的类型。

- GET  关联列表（带状态 / 字段 / 工作流数、跟随项目里的工作项数）
- PUT  ``{issue_type_ids: [...]}`` 按顺序整体替换关联；要取消的类型在跟随项目里还有工作项 → 409
- POST 类型字段（同类型库新建）：在类型库新建类型并追加关联到本模式
"""

from django.db import transaction
from django.db.models import Count
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers.issue_type import IssueTypeSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import DevMode, DevModeIssueType, IssueType, State, TypeExtraField
from plane.db.models.workflow import Workflow
from plane.utils.issue_scheme import (
    LINK_SORT_STEP,
    ensure_issue_type_library,
    ensure_mode_type_links,
    mode_type_issue_counts,
)
from plane.utils.project.defaults import bulk_create_issue_state

DEV_MODE_READ_KEYS = (PermissionKey.WORKSPACE_DEV_MODE_VIEW, PermissionKey.WORKSPACE_DEV_MODE_MANAGE)

#: 要取消关联的类型在跟随项目里还有工作项
DEV_MODE_TYPE_IN_USE = "DEV_MODE_TYPE_IN_USE"


def _count_by_type(model, type_ids, extra=None):
    rows = (
        model.objects.filter(issue_type_id__in=type_ids, **(extra or {}))
        .values("issue_type_id")
        .annotate(n=Count("id"))
    )
    return {row["issue_type_id"]: row["n"] for row in rows}


def serialize_links(dev_mode, links):
    type_ids = [link.issue_type_id for link in links]
    states = _count_by_type(State, type_ids)
    fields = _count_by_type(TypeExtraField, type_ids)
    workflows = _count_by_type(Workflow, type_ids)
    issues = mode_type_issue_counts(dev_mode.id, type_ids)
    data = []
    for link in links:
        issue_type = link.issue_type
        data.append(
            {
                "id": str(link.id),
                "issue_type_id": str(issue_type.id),
                "sort_order": link.sort_order,
                "issue_type": {
                    "id": str(issue_type.id),
                    "name": issue_type.name,
                    "description": issue_type.description,
                    "logo_props": issue_type.logo_props,
                    "category_id": issue_type.category_id,
                    "category_name": issue_type.category.name if issue_type.category_id else None,
                    "is_default": issue_type.is_default,
                    "system_key": issue_type.system_key,
                },
                "state_count": states.get(issue_type.id, 0),
                "field_count": fields.get(issue_type.id, 0),
                "workflow_count": workflows.get(issue_type.id, 0),
                "issue_count": issues.get(issue_type.id, 0),
            }
        )
    return data


class DevModeIssueTypeEndpoint(BaseAPIView):
    def _get_mode(self, slug, dev_mode_id):
        return DevMode.objects.filter(pk=dev_mode_id, workspace__slug=slug).first()

    def _links(self, dev_mode, link_ids=None):
        queryset = (
            DevModeIssueType.objects.filter(dev_mode_id=dev_mode.id, issue_type__deleted_at__isnull=True)
            .select_related("issue_type", "issue_type__category")
            .order_by("sort_order", "created_at")
        )
        if link_ids is not None:
            queryset = queryset.filter(id__in=link_ids)
        return list(queryset)

    @allow_fine_permission(*DEV_MODE_READ_KEYS, level="WORKSPACE")
    def get(self, request, slug, dev_mode_id):
        dev_mode = self._get_mode(slug, dev_mode_id)
        if dev_mode is None:
            return Response({"error": "Dev mode not found."}, status=status.HTTP_404_NOT_FOUND)
        ensure_issue_type_library(dev_mode.workspace_id, created_by=request.user)
        ensure_mode_type_links(dev_mode)
        return Response(serialize_links(dev_mode, self._links(dev_mode)), status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.WORKSPACE_DEV_MODE_MANAGE, level="WORKSPACE")
    def put(self, request, slug, dev_mode_id):
        dev_mode = self._get_mode(slug, dev_mode_id)
        if dev_mode is None:
            return Response({"error": "Dev mode not found."}, status=status.HTTP_404_NOT_FOUND)
        raw_ids = request.data.get("issue_type_ids")
        if not isinstance(raw_ids, list) or not raw_ids:
            return Response({"error": "研发模式至少要关联一个工作项类型"}, status=status.HTTP_400_BAD_REQUEST)
        type_ids = list(dict.fromkeys(str(type_id) for type_id in raw_ids))
        valid = {
            str(type_id)
            for type_id in IssueType.objects.filter(id__in=type_ids, scheme_id=dev_mode.issue_scheme_id).values_list(
                "id", flat=True
            )
        }
        if len(valid) != len(type_ids):
            return Response({"error": "只能关联工作项类型库里的类型"}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            DevMode.objects.select_for_update().filter(pk=dev_mode.id).first()
            existing = {str(link.issue_type_id): link for link in DevModeIssueType.objects.filter(dev_mode_id=dev_mode.id)}
            removed = [type_id for type_id in existing if type_id not in valid]
            if removed:
                counts = mode_type_issue_counts(dev_mode.id, removed)
                blocked = [
                    {"issue_type_id": str(t.id), "name": t.name, "issue_count": counts.get(t.id, 0)}
                    for t in IssueType.all_objects.filter(id__in=removed)
                    if counts.get(t.id)
                ]
                if blocked:
                    names = "、".join(f"{row['name']}（{row['issue_count']} 条）" for row in blocked)
                    return Response(
                        {
                            "error": f"跟随该模式的项目里还有工作项在用：{names}，不能取消关联",
                            "code": DEV_MODE_TYPE_IN_USE,
                            "blocked": blocked,
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
                DevModeIssueType.objects.filter(dev_mode_id=dev_mode.id, issue_type_id__in=removed).delete(soft=False)
            for index, type_id in enumerate(type_ids):
                sort_order = (index + 1) * LINK_SORT_STEP
                link = existing.get(type_id)
                if link is None:
                    DevModeIssueType.objects.create(dev_mode_id=dev_mode.id, issue_type_id=type_id, sort_order=sort_order)
                elif link.sort_order != sort_order:
                    DevModeIssueType.objects.filter(pk=link.pk).update(sort_order=sort_order)
        return Response(serialize_links(dev_mode, self._links(dev_mode)), status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.WORKSPACE_DEV_MODE_MANAGE, level="WORKSPACE")
    def post(self, request, slug, dev_mode_id):
        dev_mode = self._get_mode(slug, dev_mode_id)
        if dev_mode is None:
            return Response({"error": "Dev mode not found."}, status=status.HTTP_404_NOT_FOUND)
        library = ensure_issue_type_library(dev_mode.workspace_id, created_by=request.user)
        serializer = IssueTypeSerializer(data=request.data, context={"workspace_slug": slug})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            issue_type = serializer.save(scheme_id=library.id)
            bulk_create_issue_state(issue_types=[issue_type], created_by=request.user)
            last = (
                DevModeIssueType.objects.filter(dev_mode_id=dev_mode.id)
                .order_by("-sort_order")
                .values_list("sort_order", flat=True)
                .first()
            )
            link = DevModeIssueType.objects.create(
                dev_mode_id=dev_mode.id, issue_type_id=issue_type.id, sort_order=(last or 0) + LINK_SORT_STEP
            )
        return Response(serialize_links(dev_mode, self._links(dev_mode, [link.id]))[0], status=status.HTTP_201_CREATED)
