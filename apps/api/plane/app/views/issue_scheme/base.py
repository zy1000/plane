"""工作项方案：模板中心看模式方案、项目切换为项目自定义（docs/issue-scheme/ 4、5.3）。

方案下的类型 / 字段 / 状态 / 工作流接口复用项目级的视图，路由见 app/urls/issue_scheme.py。
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers.issue_scheme import IssueSchemeLiteSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import DevMode, IssueScheme, Project
from plane.db.models import IssueType, Workspace
from plane.utils.issue_scheme import (
    ISSUE_SCHEME_DETACH_BLOCKED_BY_PENDING_APPROVALS,
    DetachBlocked,
    detach_project_scheme,
    ensure_issue_type_library,
    following_project_count,
)

#: 读研发模式（含类型库、字段库）：查看或维护任一即可
DEV_MODE_READ_KEYS = (PermissionKey.WORKSPACE_DEV_MODE_VIEW, PermissionKey.WORKSPACE_DEV_MODE_MANAGE)


def _library_payload(scheme):
    return {
        "id": str(scheme.id),
        "name": scheme.name,
        "type_count": IssueType.objects.filter(scheme=scheme).count(),
        "following_project_count": following_project_count(scheme.id),
        "dev_modes": [
            {"id": str(mode["id"]), "name": mode["name"]}
            for mode in DevMode.objects.filter(issue_scheme=scheme).order_by("created_at").values("id", "name")
        ],
    }


class IssueTypeLibraryEndpoint(BaseAPIView):
    """GET workspaces/<slug>/issue-type-library/：本工作区的工作项类型库（没有就建并生成种子）。"""

    @allow_fine_permission(*DEV_MODE_READ_KEYS, level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND)
        library = ensure_issue_type_library(workspace.id, created_by=request.user)
        return Response(_library_payload(library), status=status.HTTP_200_OK)


class IssueSchemeDetailEndpoint(BaseAPIView):
    """GET workspaces/<slug>/issue-schemes/<issue_scheme_id>/：类型库概况。"""

    @allow_fine_permission(PermissionKey.WORKSPACE_DEV_MODE_VIEW)
    def get(self, request, slug, issue_scheme_id):
        scheme = IssueScheme.objects.get(pk=issue_scheme_id, workspace__slug=slug, project__isnull=True)
        ensure_issue_type_library(scheme.workspace_id, created_by=request.user)
        return Response(
            {
                **IssueSchemeLiteSerializer(scheme).data,
                "following_project_count": following_project_count(scheme.id),
                "dev_modes": list(DevMode.objects.filter(issue_scheme=scheme).values("id", "name")),
            },
            status=status.HTTP_200_OK,
        )


class ProjectIssueSchemeDetachEndpoint(BaseAPIView):
    """POST workspaces/<slug>/projects/<project_id>/issue-scheme/detach/：切换为项目自定义（单向）。"""

    @allow_fine_permission(PermissionKey.PROJECT_SETTINGS_EDIT)
    def post(self, request, slug, project_id):
        if not Project.objects.filter(pk=project_id, workspace__slug=slug).exists():
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        try:
            scheme, detached = detach_project_scheme(project_id, actor=request.user)
        except DetachBlocked as exc:
            return Response(
                {
                    "error": f"本项目还有 {exc.pending_count} 条待审批的状态变更，处理完才能切换为项目自定义",
                    "code": ISSUE_SCHEME_DETACH_BLOCKED_BY_PENDING_APPROVALS,
                    "pending_count": exc.pending_count,
                },
                status=status.HTTP_409_CONFLICT,
            )
        return Response(
            {"issue_scheme": str(scheme.id), "issue_scheme_detail": IssueSchemeLiteSerializer(scheme).data,
             "detached": detached},
            status=status.HTTP_200_OK,
        )
