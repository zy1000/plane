from django.db import transaction
from django.db.models import ProtectedError, RestrictedError
from rest_framework import status
from rest_framework.response import Response

from plane.app.serializers.stage_type import StageTypeSerializer
from plane.app.views.base import BaseViewSet
from plane.app.views.requirement.type import is_workspace_member
from plane.db.models import StageType, Workspace
from plane.db.models.stage_type import SORT_ORDER_STEP
from plane.utils.stage_review_template import ensure_stage_types


def _forbidden():
    return Response(
        {"error": "You do not have permission to maintain stage types."},
        status=status.HTTP_403_FORBIDDEN,
    )


def _not_found(message):
    return Response({"error": message}, status=status.HTTP_404_NOT_FOUND)


def _conflict(message, code):
    return Response({"error": message, "code": code}, status=status.HTTP_409_CONFLICT)


def _bad_request(message, code):
    return Response({"error": message, "code": code}, status=status.HTTP_400_BAD_REQUEST)


class StageTypeViewSet(BaseViewSet):
    """阶段类型：工作区级，读写都要求活跃工作区成员（与数据字典、需求类型同口径）。

    预置类型（``is_system``）的编码与名称锁死、不可删除，描述与排序随便改。
    """

    model = StageType
    serializer_class = StageTypeSerializer
    search_fields = ["code", "name"]
    filterset_fields = {"is_system": ["exact"]}

    def get_queryset(self):
        return StageType.objects.filter(workspace__slug=self.workspace_slug)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["workspace"] = self._get_workspace()
        return context

    def _get_workspace(self):
        return Workspace.objects.filter(slug=self.workspace_slug).first()

    def list(self, request, slug):
        if not is_workspace_member(request.user, slug):
            return _forbidden()
        workspace = self._get_workspace()
        if workspace is None:
            return _not_found("Workspace not found.")
        # 覆盖迁移与建工作区钩子都漏掉的工作区，口径同数据字典的 ensure_system_dictionaries
        ensure_stage_types(workspace, actor=request.user)
        serializer = self.get_serializer(
            self.filter_queryset(self.get_queryset()), many=True
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    def create(self, request, slug):
        if not is_workspace_member(request.user, slug):
            return _forbidden()
        workspace = self._get_workspace()
        if workspace is None:
            return _not_found("Workspace not found.")
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        stage_type = serializer.save(workspace=workspace, is_system=False)
        return Response(
            self.get_serializer(stage_type).data, status=status.HTTP_201_CREATED
        )

    def partial_update(self, request, slug, pk):
        if not is_workspace_member(request.user, slug):
            return _forbidden()
        stage_type = self.get_queryset().filter(pk=pk).first()
        if stage_type is None:
            return _not_found("Stage type not found.")
        serializer = self.get_serializer(stage_type, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def destroy(self, request, slug, pk):
        if not is_workspace_member(request.user, slug):
            return _forbidden()
        stage_type = self.get_queryset().filter(pk=pk).first()
        if stage_type is None:
            return _not_found("Stage type not found.")
        if stage_type.is_system:
            return _bad_request(
                "Preset stage types cannot be deleted.",
                "STAGE_TYPE_SYSTEM_PROTECTED",
            )
        # 研发模式的阶段引用阶段类型（DevModeStage.stage_type 是 RESTRICT）。提前挡一道
        # 是为了给出「被几个模式阶段引用」这种可读错误，而不是让 DB 异常冒上来。
        if stage_type.dev_mode_stages.exists():
            return _conflict(
                "This stage type is still used by dev mode stages.",
                "STAGE_TYPE_IN_USE",
            )
        try:
            # 硬删（模型 delete 已强制 soft=False），评审模板 FK 的 RESTRICT 兜底
            stage_type.delete()
        except (ProtectedError, RestrictedError):
            return _conflict(
                "This stage type is still used by review templates.",
                "STAGE_TYPE_IN_USE",
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    def reorder(self, request, slug):
        """整段重排：客户端传工作区内完整的有序 id 列表（照评审模板的 reorder）。"""
        if not is_workspace_member(request.user, slug):
            return _forbidden()
        ids = request.data.get("stage_type_ids")
        if not isinstance(ids, list) or not ids:
            return Response(
                {"error": "stage_type_ids must be a non-empty list."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        stage_types = {str(item.id): item for item in self.get_queryset().filter(id__in=ids)}
        ordered = [stage_types.get(str(item_id)) for item_id in ids]
        if any(item is None for item in ordered):
            return Response(
                {"error": "Some stage types were not found in this workspace."},
                status=status.HTTP_404_NOT_FOUND,
            )
        with transaction.atomic():
            for index, item in enumerate(ordered):
                item.sort_order = (index + 1) * SORT_ORDER_STEP
            StageType.objects.bulk_update(ordered, ["sort_order"])
        return Response(status=status.HTTP_204_NO_CONTENT)
