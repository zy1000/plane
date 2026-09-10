from django.db import transaction
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers.stage_review_template import StageReviewTemplateSerializer
from plane.app.views.base import BaseViewSet
from plane.db.models import StageReviewTemplate, Workspace
from plane.db.models.stage_review import SORT_ORDER_STEP
from plane.utils.stage_review_template import ensure_stage_review_templates

#: 读评审模板库：查看或维护任一即可（只配了维护的角色不该被读挡住，口径同标准库）
REVIEW_TEMPLATE_READ_KEYS = (
    PermissionKey.WORKSPACE_REVIEW_TEMPLATE_VIEW,
    PermissionKey.WORKSPACE_REVIEW_TEMPLATE_MANAGE,
)


class StageReviewTemplateViewSet(BaseViewSet):
    """评审模板库：工作区级资源，按 workspace.review_template.* 鉴权。

    一共几十行，全量返回不分页 —— 前端按阶段分组、按 parent 建树。
    """

    model = StageReviewTemplate
    serializer_class = StageReviewTemplateSerializer
    search_fields = ["title", "leader_role", "auditor_role"]
    filterset_fields = {
        "stage_id": ["exact"],
        "kind": ["exact"],
        "is_active": ["exact"],
    }

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.workspace_slug)
            .select_related("stage", "stage__dictionary", "parent", "created_by", "updated_by")
            .annotate(
                children_count=Count(
                    "children",
                    filter=Q(children__deleted_at__isnull=True),
                    distinct=True,
                )
            )
            # 阶段顺序取字典值的排序，阶段内按 sort_order；父子的先后由前端建树时决定
            .order_by("stage__sort_order", "sort_order", "created_at", "id")
        )

    def _get_workspace(self):
        return Workspace.objects.filter(slug=self.workspace_slug).first()

    def _get_template(self, pk):
        return self.get_queryset().filter(pk=pk).first()

    @allow_fine_permission(*REVIEW_TEMPLATE_READ_KEYS, level="WORKSPACE")
    def list(self, request, slug):
        # 覆盖迁移与建工作区钩子都漏掉的工作区：读一次就把缺的模板补上，
        # 口径同数据字典列表接口的 ensure_system_dictionaries。
        workspace = self._get_workspace()
        if workspace is not None:
            ensure_stage_review_templates(workspace, actor=request.user)
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(*REVIEW_TEMPLATE_READ_KEYS, level="WORKSPACE")
    def retrieve(self, request, slug, pk):
        template = self._get_template(pk)
        if template is None:
            return Response(
                {"error": "Stage review template not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(self.get_serializer(template).data, status=status.HTTP_200_OK)

    @allow_fine_permission(
        PermissionKey.WORKSPACE_REVIEW_TEMPLATE_MANAGE, level="WORKSPACE"
    )
    def create(self, request, slug):
        workspace = self._get_workspace()
        if workspace is None:
            return Response(
                {"error": "Workspace not found."}, status=status.HTTP_404_NOT_FOUND
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        template = serializer.save(workspace=workspace)
        return Response(
            self.get_serializer(template).data, status=status.HTTP_201_CREATED
        )

    def _update(self, request, pk, partial):
        template = self._get_template(pk)
        if template is None:
            return Response(
                {"error": "Stage review template not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = self.get_serializer(template, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        template = serializer.save()
        return Response(self.get_serializer(template).data, status=status.HTTP_200_OK)

    @allow_fine_permission(
        PermissionKey.WORKSPACE_REVIEW_TEMPLATE_MANAGE, level="WORKSPACE"
    )
    def update(self, request, slug, pk):
        return self._update(request, pk, partial=False)

    @allow_fine_permission(
        PermissionKey.WORKSPACE_REVIEW_TEMPLATE_MANAGE, level="WORKSPACE"
    )
    def partial_update(self, request, slug, pk):
        return self._update(request, pk, partial=True)

    @allow_fine_permission(
        PermissionKey.WORKSPACE_REVIEW_TEMPLATE_MANAGE, level="WORKSPACE"
    )
    def destroy(self, request, slug, pk):
        template = self._get_template(pk)
        if template is None:
            return Response(
                {"error": "Stage review template not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        # 删评审会连带软删它下面的评审活动（parent CASCADE + soft_delete_related_objects）。
        # 已经被裁剪单引用过的模板由 ReviewTailoringItem 的 PROTECT 兜住。
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_fine_permission(
        PermissionKey.WORKSPACE_REVIEW_TEMPLATE_MANAGE, level="WORKSPACE"
    )
    def reorder(self, request, slug):
        """整段重排：客户端传同一分组（同阶段同父）内的完整有序 id 列表。

        只改 sort_order，不改归属 —— 跨父拖动走 PATCH 改 parent_id。
        """
        ids = request.data.get("template_ids")
        if not isinstance(ids, list) or not ids:
            return Response(
                {"error": "template_ids must be a non-empty list."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        templates = {
            str(item.id): item
            for item in StageReviewTemplate.objects.filter(
                workspace__slug=self.workspace_slug, id__in=ids
            )
        }
        ordered = [templates.get(str(item_id)) for item_id in ids]
        if any(item is None for item in ordered):
            return Response(
                {"error": "Some templates were not found in this workspace."},
                status=status.HTTP_404_NOT_FOUND,
            )
        # 同一分组才有可比性：混着排会把别的阶段/父级的顺序也冲掉
        groups = {(item.stage_id, item.parent_id) for item in ordered}
        if len(groups) > 1:
            return Response(
                {"error": "All templates must share the same stage and parent."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            for index, item in enumerate(ordered):
                item.sort_order = (index + 1) * SORT_ORDER_STEP
            StageReviewTemplate.objects.bulk_update(ordered, ["sort_order"])
        return Response(status=status.HTTP_204_NO_CONTENT)
