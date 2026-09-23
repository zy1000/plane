from django.db.models import Count, Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers.dev_mode import (
    DevModeDetailSerializer,
    DevModeSerializer,
    count_projects_using,
)
from plane.app.views.base import BaseViewSet
from plane.db.models import DevMode, Workspace
from plane.utils.dev_mode import ensure_dev_modes

#: 读研发模式：查看或维护任一即可（只配了维护的角色不该被读挡住，口径同评审模板库）
DEV_MODE_READ_KEYS = (
    PermissionKey.WORKSPACE_DEV_MODE_VIEW,
    PermissionKey.WORKSPACE_DEV_MODE_MANAGE,
)


class DevModeViewSet(BaseViewSet):
    """研发模式：工作区级资源，按 workspace.dev_mode.* 鉴权。

    一个工作区通常只有三五个模式，全量返回不分页。
    """

    model = DevMode
    serializer_class = DevModeSerializer
    search_fields = ["name", "description"]
    filterset_fields = {"is_system": ["exact"]}

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.workspace_slug)
            .annotate(
                stages_count=Count(
                    "stages",
                    filter=Q(stages__deleted_at__isnull=True),
                    distinct=True,
                ),
                templates_count=Count(
                    "stages__template_links",
                    filter=Q(
                        stages__deleted_at__isnull=True,
                        stages__template_links__deleted_at__isnull=True,
                    ),
                    distinct=True,
                ),
            )
            .order_by("created_at", "id")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["workspace"] = self._get_workspace()
        return context

    def _get_workspace(self):
        return Workspace.objects.filter(slug=self.workspace_slug).first()

    def _get_dev_mode(self, pk):
        return self.get_queryset().filter(pk=pk).first()

    @allow_fine_permission(*DEV_MODE_READ_KEYS, level="WORKSPACE")
    def list(self, request, slug):
        workspace = self._get_workspace()
        if workspace is None:
            return Response(
                {"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND
            )
        # 覆盖迁移与建工作区钩子都漏掉的工作区，口径同评审模板列表接口
        ensure_dev_modes(workspace, actor=request.user)
        serializer = self.get_serializer(
            self.filter_queryset(self.get_queryset()), many=True
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(*DEV_MODE_READ_KEYS, level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        dev_mode = self._get_dev_mode(pk)
        if dev_mode is None:
            return Response(
                {"error": "Dev mode not found."}, status=status.HTTP_404_NOT_FOUND
            )
        serializer = DevModeDetailSerializer(
            dev_mode, context=self.get_serializer_context()
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.WORKSPACE_DEV_MODE_MANAGE, level="WORKSPACE")
    def create(self, request, slug):
        workspace = self._get_workspace()
        if workspace is None:
            return Response(
                {"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        dev_mode = serializer.save(workspace=workspace, is_system=False)
        return Response(
            self.get_serializer(self._get_dev_mode(dev_mode.pk)).data,
            status=status.HTTP_201_CREATED,
        )

    @allow_fine_permission(PermissionKey.WORKSPACE_DEV_MODE_MANAGE, level="WORKSPACE")
    def partial_update(self, request, slug, pk):
        dev_mode = self._get_dev_mode(pk)
        if dev_mode is None:
            return Response(
                {"error": "Dev mode not found."}, status=status.HTTP_404_NOT_FOUND
            )
        serializer = self.get_serializer(dev_mode, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.WORKSPACE_DEV_MODE_MANAGE, level="WORKSPACE")
    def destroy(self, request, slug, pk):
        dev_mode = self._get_dev_mode(pk)
        if dev_mode is None:
            return Response(
                {"error": "Dev mode not found."}, status=status.HTTP_404_NOT_FOUND
            )
        if dev_mode.is_system:
            return Response(
                {
                    "error": "Preset dev modes cannot be deleted.",
                    "code": "DEV_MODE_SYSTEM_PROTECTED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        # 被项目引用的模式不可删。按 include_inactive 算：外键是 RESTRICT，
        # 软删的项目和模板项目也占着引用，漏掉它们真删时会炸 RestrictedError。
        if count_projects_using(dev_mode, include_inactive=True):
            # 活跃项目为 0 但仍被引用 = 只剩软删 / 模板项目占着，错误码分开给，
            # 否则用户在列表里一个项目都看不到却删不掉，只会以为是 bug
            if count_projects_using(dev_mode):
                error, code = (
                    "This dev mode is still used by projects.",
                    "DEV_MODE_IN_USE",
                )
            else:
                error, code = (
                    "This dev mode is still referenced by deleted or template projects.",
                    "DEV_MODE_IN_USE_BY_INACTIVE_PROJECTS",
                )
            return Response(
                {"error": error, "code": code}, status=status.HTTP_409_CONFLICT
            )
        # 硬删（模型 delete 已强制 soft=False），阶段与勾选按 CASCADE 一起走
        dev_mode.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
