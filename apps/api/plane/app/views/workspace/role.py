# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""工作区设置 › 权限组（docs/permission-refactor/data-permission-plan.md）。

一个组 = 工作区权限 + 项目权限 + 数据权限（项目 / 产品白名单）+ 模板开关。模板组被白名单项目自动引用，
「引用项目」页能移除 / 恢复某个项目的引用。"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers import (
    PermissionSerializer,
    WorkspaceRolePermissionBindingSerializer,
    WorkspaceRoleSerializer,
)
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import Permission, Project, Workspace, WorkspaceRole
from plane.utils.data_scope import MODELS, DataScopeError, preview_entry, role_scope, validate_data_scope
from plane.utils.permission_groups import (
    PermissionGroupError,
    bind_workspace_group_members,
    effective_payload,
    exclude_template_project,
    group_member_ids,
    restore_template_project,
    set_workspace_role_permissions,
    template_projects,
    template_usage_counts,
    unbind_workspace_group_member,
    workspace_group_member_counts,
    workspace_group_member_previews,
    workspace_type_options,
)

GROUP_VIEW = PermissionKey.WORKSPACE_PERMISSION_GROUP_VIEW
GROUP_MANAGE = PermissionKey.WORKSPACE_PERMISSION_GROUP_MANAGE
# 成员管理员在成员表里给人分配权限组，要能读到组列表
GROUP_READ_KEYS = (GROUP_VIEW, GROUP_MANAGE, PermissionKey.WORKSPACE_MEMBER_MANAGE)


def _error(exc: PermissionGroupError):
    data = {"error": exc.message}
    if exc.code:
        data["code"] = exc.code
    return Response(data, status=status.HTTP_400_BAD_REQUEST)


class WorkspaceRoleViewSet(BaseViewSet):
    serializer_class = WorkspaceRoleSerializer
    model = WorkspaceRole
    use_read_replica = True
    search_fields = ["name", "description"]
    filterset_fields = ["is_template"]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace", "created_by", "updated_by")
        )

    def _workspace(self, slug):
        return Workspace.objects.filter(slug=slug).first()

    def _with_stats(self, roles, workspace):
        member_counts = workspace_group_member_counts(workspace)
        member_previews = workspace_group_member_previews(workspace)
        usage = template_usage_counts(workspace)
        totals = {kind: MODELS[kind].objects.filter(workspace=workspace).count() for kind in ("projects", "products")}
        data = []
        for role, item in zip(roles, self.get_serializer(roles, many=True).data):
            payload = effective_payload(role)
            item["member_count"] = member_counts.get(role.id, 0)
            item["member_preview_ids"] = member_previews.get(role.id, [])
            item["permission_keys_count"] = len(payload["permission_keys"])
            item["workspace_permission_count"] = len([k for k in payload["permission_keys"] if k.startswith("workspace.")])
            item["project_permission_count"] = len([k for k in payload["permission_keys"] if k.startswith("project.")])
            item["data_scope_summary"] = _scope_summary(role, totals)
            if role.is_template:
                item["referenced_project_count"] = usage.get(role.id, {}).get("referenced", 0)
            data.append(item)
        return data

    @allow_fine_permission(*GROUP_READ_KEYS, level="WORKSPACE")
    def list(self, request, slug):
        workspace = self._workspace(slug)
        roles = sorted(self.get_queryset(), key=lambda role: role.created_at)
        return Response(self._with_stats(roles, workspace), status=status.HTTP_200_OK)

    @allow_fine_permission(*GROUP_READ_KEYS, level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        role = self.get_queryset().filter(pk=pk).first()
        if role is None:
            return Response({"error": "Permission group not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self._with_stats([role], role.workspace)[0], status=status.HTTP_200_OK)

    @allow_fine_permission(GROUP_MANAGE, level="WORKSPACE")
    def create(self, request, slug):
        workspace = self._workspace(slug)
        serializer = self.get_serializer(data=request.data, context={"workspace": workspace})
        serializer.is_valid(raise_exception=True)
        role = serializer.save(workspace=workspace, permissions={"permission_keys": []})
        copy_from = request.data.get("copy_from")
        if copy_from:
            source = WorkspaceRole.objects.filter(workspace=workspace, pk=copy_from).first()
            if source is not None:
                payload = effective_payload(source)
                try:
                    set_workspace_role_permissions(role, payload["permission_keys"], payload["type_limits"])
                except PermissionGroupError:
                    pass
        return Response(self._with_stats([role], workspace)[0], status=status.HTTP_201_CREATED)

    @allow_fine_permission(GROUP_MANAGE, level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        role = self.get_queryset().filter(pk=pk).first()
        if role is None:
            return Response({"error": "Permission group not found."}, status=status.HTTP_404_NOT_FOUND)
        data = {key: request.data[key] for key in ("name", "description", "is_template") if key in request.data}
        serializer = self.get_serializer(role, data=data, partial=True, context={"workspace": role.workspace})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(self._with_stats([role], role.workspace)[0], status=status.HTTP_200_OK)

    @allow_fine_permission(GROUP_MANAGE, level="WORKSPACE")
    def destroy(self, request, slug, pk):
        role = self.get_queryset().filter(pk=pk).first()
        if role is None:
            return Response({"error": "Permission group not found."}, status=status.HTTP_404_NOT_FOUND)
        role.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class PermissionViewSet(BaseViewSet):
    """权限字典（只读）。编辑器的分组 / 行 / 动作用前端生成的 PERMISSION_CATALOG，这里给停用状态。"""

    serializer_class = PermissionSerializer
    model = Permission
    use_read_replica = True
    filterset_fields = ["scope", "module", "category", "is_active"]
    search_fields = ["key", "name", "description"]

    def get_queryset(self):
        return self.filter_queryset(super().get_queryset().order_by("scope", "sort_order", "key"))

    @allow_fine_permission(*GROUP_READ_KEYS, level="WORKSPACE")
    def list(self, request, slug):
        return Response(self.get_serializer(self.get_queryset(), many=True).data, status=status.HTTP_200_OK)

    @allow_fine_permission(*GROUP_READ_KEYS, level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        permission = self.get_queryset().filter(pk=pk).first()
        if permission is None:
            return Response({"error": "Permission not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(permission).data, status=status.HTTP_200_OK)


def _get_role(slug, pk):
    return WorkspaceRole.objects.filter(workspace__slug=slug, pk=pk).select_related("workspace").first()


class WorkspaceRolePermissionAPIView(BaseAPIView):
    """权限组的权限内容：GET 读、PATCH 整份替换（permission_keys + type_limits）。"""

    def _response(self, role):
        payload = effective_payload(role)
        return {
            "role": WorkspaceRoleSerializer(role).data,
            "permission_keys": payload["permission_keys"],
            "type_limits": payload["type_limits"],
            "is_editable": True,
            "type_options": workspace_type_options(role.workspace_id),
        }

    @allow_fine_permission(*GROUP_READ_KEYS, level="WORKSPACE")
    def get(self, request, slug, pk):
        role = _get_role(slug, pk)
        if role is None:
            return Response({"error": "Permission group not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self._response(role), status=status.HTTP_200_OK)

    @allow_fine_permission(GROUP_MANAGE, level="WORKSPACE")
    def patch(self, request, slug, pk):
        role = _get_role(slug, pk)
        if role is None:
            return Response({"error": "Permission group not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = WorkspaceRolePermissionBindingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            set_workspace_role_permissions(
                role, serializer.validated_data["permission_keys"], serializer.validated_data.get("type_limits")
            )
        except PermissionGroupError as exc:
            return _error(exc)
        return Response(self._response(role), status=status.HTTP_200_OK)


class WorkspaceRoleMembersAPIView(BaseAPIView):
    """工作区权限组详情的「成员」页签：列出 / 添加 / 移出。项目权限组模板没有成员（在项目里绑定）。"""

    @allow_fine_permission(*GROUP_READ_KEYS, level="WORKSPACE")
    def get(self, request, slug, pk):
        role = _get_role(slug, pk)
        if role is None:
            return Response({"error": "Permission group not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response({"member_ids": [str(value) for value in group_member_ids(role)]}, status=status.HTTP_200_OK)

    @allow_fine_permission(GROUP_MANAGE, level="WORKSPACE")
    def post(self, request, slug, pk):
        role = _get_role(slug, pk)
        if role is None:
            return Response({"error": "Permission group not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            bind_workspace_group_members(role, request.data.get("member_ids") or [])
        except PermissionGroupError as exc:
            return _error(exc)
        return Response({"member_ids": [str(value) for value in group_member_ids(role)]}, status=status.HTTP_200_OK)

    @allow_fine_permission(GROUP_MANAGE, level="WORKSPACE")
    def delete(self, request, slug, pk, member_id):
        role = _get_role(slug, pk)
        if role is None:
            return Response({"error": "Permission group not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            unbind_workspace_group_member(role, member_id)
        except PermissionGroupError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceRoleTemplateProjectsAPIView(BaseAPIView):
    """模板组详情的「引用项目」页：白名单命中的项目（带已排除标记）；DELETE 排除 / PUT 恢复某个项目。"""

    @allow_fine_permission(*GROUP_READ_KEYS, level="WORKSPACE")
    def get(self, request, slug, pk):
        role = _get_role(slug, pk)
        if role is None or not role.is_template:
            return Response({"error": "Template not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(template_projects(role), status=status.HTTP_200_OK)

    def _project(self, role, project_id):
        return Project.objects.filter(workspace_id=role.workspace_id, pk=project_id).first()

    @allow_fine_permission(GROUP_MANAGE, level="WORKSPACE")
    def delete(self, request, slug, pk, project_id):
        role = _get_role(slug, pk)
        project = self._project(role, project_id) if role else None
        if role is None or not role.is_template or project is None:
            return Response({"error": "Template or project not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            exclude_template_project(role, project)
        except PermissionGroupError as exc:
            return _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_fine_permission(GROUP_MANAGE, level="WORKSPACE")
    def put(self, request, slug, pk, project_id):
        role = _get_role(slug, pk)
        project = self._project(role, project_id) if role else None
        if role is None or not role.is_template or project is None:
            return Response({"error": "Template or project not found."}, status=status.HTTP_404_NOT_FOUND)
        restore_template_project(role, project)
        return Response(template_projects(role), status=status.HTTP_200_OK)


def _scope_summary(role, totals):
    """列表 / 详情卡片一眼能看的数据权限：{"projects": {"mode", "count"}, "products": {...}}。
    count 是当前命中数：全部 = 工作区总数，指定 = 勾选数，按条件 = 现在满足条件的个数。"""
    scope = role.data_scope if isinstance(role.data_scope, dict) else {}
    summary = {}
    for kind in ("projects", "products"):
        entry = scope.get(kind) if isinstance(scope.get(kind), dict) else {}
        mode = entry.get("mode", "all")
        if mode == "selected":
            count = len(entry.get("ids") or [])
        elif mode == "filter":
            result = role_scope(role, kind, role.workspace)
            count = totals[kind] if result.all else len(result.ids)
        else:
            count = totals[kind]
        summary[kind] = {"mode": mode, "count": count}
    return summary


class WorkspaceRoleDataScopeAPIView(BaseAPIView):
    """权限组的数据权限（项目 / 产品白名单）：GET 读、PATCH 整份替换。"""

    @allow_fine_permission(*GROUP_READ_KEYS, level="WORKSPACE")
    def get(self, request, slug, pk):
        role = _get_role(slug, pk)
        if role is None:
            return Response({"error": "Permission group not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response({"data_scope": role.data_scope}, status=status.HTTP_200_OK)

    @allow_fine_permission(GROUP_MANAGE, level="WORKSPACE")
    def patch(self, request, slug, pk):
        role = _get_role(slug, pk)
        if role is None:
            return Response({"error": "Permission group not found."}, status=status.HTTP_404_NOT_FOUND)
        try:
            role.data_scope = validate_data_scope(role.workspace, request.data.get("data_scope"))
        except DataScopeError as exc:
            return Response({"error": exc.message}, status=status.HTTP_400_BAD_REQUEST)
        role.save(update_fields=["data_scope", "updated_at", "updated_by"])
        return Response({"data_scope": role.data_scope}, status=status.HTTP_200_OK)


class WorkspaceRoleDataScopePreviewAPIView(BaseAPIView):
    """编辑数据权限时的实时预览：传一段 ``{"kind": "projects"|"products", "entry": {...}}``，返回命中数与前几条。"""

    @allow_fine_permission(*GROUP_READ_KEYS, level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        kind = request.data.get("kind")
        if workspace is None or kind not in ("projects", "products"):
            return Response({"error": "kind 只能是 projects 或 products。"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            result = preview_entry(request.data.get("entry") or {"mode": "all"}, kind, workspace, request.user)
        except DataScopeError as exc:
            return Response({"error": exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(result, status=status.HTTP_200_OK)
