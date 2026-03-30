# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission, allow_project_permission, PermissionKey
from plane.app.serializers import (
    ImportProjectRoleSerializer,
    PermissionSerializer,
    ProjectRolePermissionBindingSerializer,
    ProjectRoleSerializer,
)
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import Permission, Project, WorkspaceRole
from plane.db.models.project import ProjectRole


class ProjectRoleViewSet(BaseViewSet):
    serializer_class = ProjectRoleSerializer
    model = ProjectRole
    use_read_replica = True
    search_fields = ["name", "description"]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(
                project_id=self.kwargs.get("project_id"),
                project__workspace__slug=self.kwargs.get("slug"),
            )
            .select_related("project", "source_template", "created_by", "updated_by")
        )

    def get_project(self, slug, project_id):
        return Project.objects.filter(pk=project_id, workspace__slug=slug).first()

    def get_role(self, pk):
        return self.get_queryset().filter(pk=pk).first()

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def list(self, request, slug, project_id):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def retrieve(self, request, slug, project_id, pk):
        role = self.get_role(pk)
        if not role:
            return Response({"error": "Project role not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.get_serializer(role).data, status=status.HTTP_200_OK)

    @allow_project_permission(PermissionKey.PROJECT_ROLE_CREATE)
    def create(self, request, slug, project_id):
        project = self.get_project(slug, project_id)
        if not project:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(data=request.data, context={"project": project})
        if serializer.is_valid():
            serializer.save(project=project)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_project_permission(PermissionKey.PROJECT_ROLE_EDIT)
    def partial_update(self, request, slug, project_id, pk):
        role = self.get_role(pk)
        if not role:
            return Response({"error": "Project role not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = self.get_serializer(
            role, data=request.data, partial=True, context={"project": role.project}
        )
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    @allow_project_permission(PermissionKey.PROJECT_ROLE_DELETE)
    def destroy(self, request, slug, project_id, pk):
        role = self.get_role(pk)
        if not role:
            return Response({"error": "Project role not found."}, status=status.HTTP_404_NOT_FOUND)

        role.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProjectRoleImportAPIView(BaseAPIView):
    """从 WorkspaceRole(type=project_template) 导入为 ProjectRole（独立副本，不关联 source_template）。"""

    def get_project(self, slug, project_id):
        return Project.objects.filter(pk=project_id, workspace__slug=slug).first()

    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id):
        project = self.get_project(slug, project_id)
        if not project:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ImportProjectRoleSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        workspace_role_id = serializer.validated_data["workspace_role_id"]

        workspace_role = WorkspaceRole.objects.filter(
            pk=workspace_role_id,
            workspace__slug=slug,
            type=WorkspaceRole.RoleType.PROJECT_TEMPLATE,
        ).first()
        if not workspace_role:
            return Response(
                {"error": "未找到对应的项目角色模板，请确认该角色属于当前工作区且类型为 project_template。"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # 校验模板权限全部为 project scope
        template_permissions = workspace_role.permissions if isinstance(workspace_role.permissions, dict) else {}
        template_keys = template_permissions.get("permission_keys", [])
        if template_keys:
            bad_keys = list(
                Permission.objects.filter(key__in=template_keys)
                .exclude(scope="project")
                .values_list("key", flat=True)
            )
            if bad_keys:
                return Response(
                    {"error": f"模板包含非项目权限，无法导入：{', '.join(bad_keys)}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # 检查项目内是否已存在同名角色
        if ProjectRole.objects.filter(project=project, name=workspace_role.name).exists():
            return Response(
                {"error": f"项目中已存在名为「{workspace_role.name}」的角色，请先删除或重命名后再导入。"},
                status=status.HTTP_409_CONFLICT,
            )

        project_role = ProjectRole.objects.create(
            project=project,
            name=workspace_role.name,
            description=workspace_role.description or "",
            permissions=dict(template_permissions),
            source_template=None,
            created_by=request.user,
            updated_by=request.user,
        )

        # 如果工作区组和该模板有默认绑定，自动为这些组创建对应的项目授权
        # group_role_mappings = WorkspaceGroupRole.objects.filter(
        #     role=workspace_role,
        #     group__workspace__slug=slug,
        # ).select_related("group")
        #
        # project_group_roles = []
        # for mapping in group_role_mappings:
        #     # 若该组已在此项目有授权记录，则跳过，避免重复
        #     if not ProjectGroupRole.objects.filter(
        #             group=mapping.group, role__project=project
        #     ).exists():
        #         project_group_roles.append(
        #             ProjectGroupRole(
        #                 project=project,
        #                 group=mapping.group,
        #                 role=project_role,
        #                 created_by=request.user,
        #                 updated_by=request.user,
        #             )
        #         )
        # if project_group_roles:
        #     ProjectGroupRole.objects.bulk_create(project_group_roles, ignore_conflicts=True)

        return Response(
            ProjectRoleSerializer(project_role).data,
            status=status.HTTP_201_CREATED,
        )


class ProjectRolePermissionAPIView(BaseAPIView):
    """查看和修改 ProjectRole 的权限绑定。"""

    use_read_replica = True

    def get_role(self, slug, project_id, pk):
        return ProjectRole.objects.filter(
            project_id=project_id,
            project__workspace__slug=slug,
            pk=pk,
        ).first()

    def get_bound_permission_keys(self, role):
        if not isinstance(role.permissions, dict):
            return []

        permission_keys = role.permissions.get("permission_keys", [])
        if isinstance(permission_keys, list):
            return list(dict.fromkeys([k for k in permission_keys if isinstance(k, str)]))
        return []

    def build_response_data(self, role):
        bound_permission_keys = self.get_bound_permission_keys(role)
        permissions = Permission.objects.filter(is_active=True, scope="project").order_by(
            "module",
            "sort_order",
            "key",
        )
        permission_serializer = PermissionSerializer(
            permissions,
            many=True,
            context={"bound_permission_keys": bound_permission_keys},
        )
        return {
            "role": ProjectRoleSerializer(role).data,
            "permission_keys": bound_permission_keys,
            "permissions": permission_serializer.data,
        }

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id, pk):
        role = self.get_role(slug, project_id, pk)
        if not role:
            return Response({"error": "Project role not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(self.build_response_data(role), status=status.HTTP_200_OK)

    @allow_project_permission(PermissionKey.PROJECT_ROLE_EDIT)
    def patch(self, request, slug, project_id, pk):
        role = self.get_role(slug, project_id, pk)
        if not role:
            return Response({"error": "Project role not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProjectRolePermissionBindingSerializer(data=request.data, context={"role": role})
        if serializer.is_valid():
            role = serializer.save()
            return Response(self.build_response_data(role), status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
