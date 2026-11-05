# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""项目设置 › 权限组（docs/permission-refactor/data-permission-plan.md）。

列表 = 引用了本项目的模板组（白名单命中且未排除；只读、可删）+ 本项目自定义组。
「删除」引用 = 把本项目加进模板的排除列表并解绑；在工作区的模板详情「引用项目」页可以恢复。
没有权限模式，没有脱离。
"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission, allow_project_member
from plane.app.serializers import ProjectRolePermissionBindingSerializer, ProjectRoleSerializer
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import Project, ProjectRole, WorkspaceRole
from plane.utils.data_scope import template_references_project
from plane.utils.permission_groups import (
    PermissionGroupError,
    effective_payload,
    exclude_template_project,
    group_member_ids,
    inherited_workspace_groups,
    project_group_rows,
    project_type_options,
    set_project_role_permissions,
    workspace_type_options,
)

GROUP_MANAGE = PermissionKey.PROJECT_PERMISSION_GROUP_MANAGE


def _error(exc: PermissionGroupError):
    data = {"error": exc.message}
    if exc.code:
        data["code"] = exc.code
    return Response(data, status=status.HTTP_400_BAD_REQUEST)


def _project(slug, project_id):
    return Project.objects.filter(pk=project_id, workspace__slug=slug).select_related("workspace").first()


def _resolve(project, pk):
    """pk 可以是本项目权限组 id，也可以是模板 id（引用中但还没人用的模板没有项目行）。
    返回 (项目行或 None, 模板或 None)。"""
    row = ProjectRole.objects.filter(project=project, pk=pk).select_related("source_template").first()
    if row is not None:
        return row, row.source_template
    template = WorkspaceRole.objects.filter(
        workspace_id=project.workspace_id, kind=WorkspaceRole.KIND_PROJECT_TEMPLATE, pk=pk
    ).first()
    if template is None or not template_references_project(template, project.id):
        return None, None
    reference = ProjectRole.objects.filter(project=project, source_template=template).first()
    return reference, template


def _row_payload(project, pk):
    for row in project_group_rows(project):
        if row["id"] == str(pk) or row["project_role_id"] == str(pk) or (
            row["template_id"] == str(pk) and row["source"] != "project"
        ):
            return row
    return None


class ProjectRoleViewSet(BaseViewSet):
    serializer_class = ProjectRoleSerializer
    model = ProjectRole
    use_read_replica = True

    @allow_project_member
    def list(self, request, slug, project_id):
        project = _project(slug, project_id)
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(
            {
                "groups": project_group_rows(project),
                "inherited_groups": inherited_workspace_groups(project),
            },
            status=status.HTTP_200_OK,
        )

    @allow_project_member
    def retrieve(self, request, slug, project_id, pk):
        project = _project(slug, project_id)
        row = _row_payload(project, pk) if project else None
        if row is None:
            return Response({"error": "Permission group not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(row, status=status.HTTP_200_OK)

    @allow_fine_permission(GROUP_MANAGE)
    def create(self, request, slug, project_id):
        """新建本项目自定义组；``copy_from`` 可给引用中的模板 id 或本项目组 id，照它的权限起步。"""
        project = _project(slug, project_id)
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        name = (request.data.get("name") or "").strip()
        if not name:
            return Response({"error": "名称不能为空。"}, status=status.HTTP_400_BAD_REQUEST)
        if ProjectRole.objects.filter(project=project, name=name).exists():
            return Response({"error": "本项目已有同名权限组。"}, status=status.HTTP_400_BAD_REQUEST)
        role = ProjectRole.objects.create(
            project=project,
            name=name,
            description=request.data.get("description") or "",
            permissions={"permission_keys": []},
        )
        copy_from = request.data.get("copy_from")
        if copy_from:
            source_row, source_template = _resolve(project, copy_from)
            source = source_row or source_template
            if source is not None:
                payload = effective_payload(source)
                role.permissions = {"permission_keys": payload["permission_keys"]}
                if payload["type_limits"]:
                    role.permissions["type_limits"] = payload["type_limits"]
                role.save(update_fields=["permissions"])
        return Response(_row_payload(project, role.id), status=status.HTTP_201_CREATED)

    @allow_fine_permission(GROUP_MANAGE)
    def partial_update(self, request, slug, project_id, pk):
        project = _project(slug, project_id)
        row = ProjectRole.objects.filter(project=project, pk=pk).first() if project else None
        if row is None or row.source_template_id:
            return Response({"error": "只能修改本项目自定义的权限组。"}, status=status.HTTP_400_BAD_REQUEST)
        name = (request.data.get("name") or row.name).strip()
        if name != row.name and ProjectRole.objects.filter(project=project, name=name).exists():
            return Response({"error": "本项目已有同名权限组。"}, status=status.HTTP_400_BAD_REQUEST)
        row.name = name
        if "description" in request.data:
            row.description = request.data.get("description") or ""
        row.save(update_fields=["name", "description", "updated_at", "updated_by"])
        return Response(_row_payload(project, row.id), status=status.HTTP_200_OK)

    @allow_fine_permission(GROUP_MANAGE)
    def destroy(self, request, slug, project_id, pk):
        """本项目组：删除。模板（或它的引用行）：本项目不再引用（记排除、解绑），模板本身不动。"""
        project = _project(slug, project_id)
        row, template = _resolve(project, pk) if project else (None, None)
        if row is None and template is None:
            return Response({"error": "Permission group not found."}, status=status.HTTP_404_NOT_FOUND)
        if template is not None:
            try:
                exclude_template_project(template, project)
            except PermissionGroupError as exc:
                return _error(exc)
        else:
            row.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectRolePermissionAPIView(BaseAPIView):
    """项目权限组的权限内容。引用模板的组只读（is_editable=false）。"""

    def _response(self, project, row, template):
        source = row if (row is not None and row.source_template_id is None) else template
        payload = effective_payload(source)
        editable = row is not None and row.source_template_id is None
        return {
            "group": _row_payload(project, (row or template).id),
            "permission_keys": payload["permission_keys"],
            "type_limits": payload["type_limits"],
            "is_editable": editable,
            "type_options": project_type_options(project)
            if editable
            else workspace_type_options(project.workspace_id),
        }

    @allow_project_member
    def get(self, request, slug, project_id, pk):
        project = _project(slug, project_id)
        row, template = _resolve(project, pk) if project else (None, None)
        if row is None and template is None:
            return Response({"error": "Permission group not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self._response(project, row, template), status=status.HTTP_200_OK)

    @allow_fine_permission(GROUP_MANAGE)
    def patch(self, request, slug, project_id, pk):
        project = _project(slug, project_id)
        row = ProjectRole.objects.filter(project=project, pk=pk).first() if project else None
        if row is None:
            return Response({"error": "Permission group not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProjectRolePermissionBindingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            set_project_role_permissions(
                row, serializer.validated_data["permission_keys"], serializer.validated_data.get("type_limits")
            )
        except PermissionGroupError as exc:
            return _error(exc)
        return Response(self._response(project, row, None), status=status.HTTP_200_OK)


class ProjectRoleMembersAPIView(BaseAPIView):
    """项目权限组详情的「成员」页签（用户 id）。还没人用的模板在本项目没有行，返回空。"""

    @allow_project_member
    def get(self, request, slug, project_id, pk):
        project = _project(slug, project_id)
        row, _ = _resolve(project, pk) if project else (None, None)
        member_ids = group_member_ids(row) if row is not None else []
        return Response({"member_ids": [str(value) for value in member_ids]}, status=status.HTTP_200_OK)
