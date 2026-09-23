from django.db import transaction
from django.db.models import Count, ProtectedError, Q, RestrictedError
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers.dev_mode import (
    DevModeStageSerializer,
    DevModeStageTemplateNodeSerializer,
)
from plane.app.views.base import BaseViewSet
from plane.app.views.dev_mode.mode import DEV_MODE_READ_KEYS
from plane.db.models import (
    DevMode,
    DevModeStage,
    DevModeStageTemplate,
    StageReviewTemplate,
    StageType,
)
from plane.db.models.dev_mode import SORT_ORDER_STEP
from plane.utils.dev_mode import selectable_template_ids


def stage_in_use(stage):
    """这个阶段有没有被项目的评审实例或裁剪格子引用。

    **只算活跃行**：两张表都是软删模型，软删过的行对外键 RESTRICT 仍然算引用，但让用户
    因为一条已经删掉的评审而删不了阶段说不通。代价是检查通过、真删时仍可能撞
    ``RestrictedError`` —— 那属于「库里有软删残留」，比误拦住正常操作好。
    """
    for relation in ("stage_reviews", "tailoring_items"):
        related = getattr(stage, relation, None)
        if related is not None and related.filter(deleted_at__isnull=True).exists():
            return True
    return False


def _stage_in_use_response(message, **extra):
    return Response(
        {"error": message, "code": "DEV_MODE_STAGE_IN_USE", **extra},
        status=status.HTTP_409_CONFLICT,
    )


class DevModeStageViewSet(BaseViewSet):
    """模式的阶段 + 每个阶段勾选的评审节点。

    路由挂在模式下（``dev-modes/<dev_mode_id>/stages/``），所以每个动作都先解析并校验
    所属模式，再落到具体阶段。
    """

    model = DevModeStage
    serializer_class = DevModeStageSerializer

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.workspace_slug)
            .select_related("stage_type")
            .annotate(
                links_count=Count(
                    "template_links",
                    filter=Q(template_links__deleted_at__isnull=True),
                    distinct=True,
                )
            )
            .order_by("sort_order", "created_at", "id")
        )

    def _get_dev_mode(self, dev_mode_id):
        return DevMode.objects.filter(
            workspace__slug=self.workspace_slug, pk=dev_mode_id
        ).first()

    def _stages_of(self, dev_mode):
        return self.get_queryset().filter(dev_mode=dev_mode)

    def _context(self, dev_mode):
        return {**self.get_serializer_context(), "dev_mode": dev_mode}

    @staticmethod
    def _not_found(message):
        return Response({"error": message}, status=status.HTTP_404_NOT_FOUND)

    @staticmethod
    def _bad_request(message, code=None):
        payload = {"error": message}
        if code:
            payload["code"] = code
        return Response(payload, status=status.HTTP_400_BAD_REQUEST)

    # ---- 阶段 ---------------------------------------------------------------

    @allow_fine_permission(*DEV_MODE_READ_KEYS, level="WORKSPACE")
    def list(self, request, slug, dev_mode_id):
        dev_mode = self._get_dev_mode(dev_mode_id)
        if dev_mode is None:
            return self._not_found("Dev mode not found.")
        serializer = DevModeStageSerializer(
            self._stages_of(dev_mode), many=True, context=self._context(dev_mode)
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.WORKSPACE_DEV_MODE_MANAGE, level="WORKSPACE")
    def create(self, request, slug, dev_mode_id):
        dev_mode = self._get_dev_mode(dev_mode_id)
        if dev_mode is None:
            return self._not_found("Dev mode not found.")
        serializer = DevModeStageSerializer(
            data=request.data, context=self._context(dev_mode)
        )
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            stage = serializer.save(
                dev_mode=dev_mode, workspace_id=dev_mode.workspace_id
            )
            # 新建阶段默认勾满该类型下的活跃节点（需求 3.6「新建阶段默认全勾」）
            _select_all_templates(stage, request.user)
        return Response(
            DevModeStageSerializer(
                self._stages_of(dev_mode).filter(pk=stage.pk).first(),
                context=self._context(dev_mode),
            ).data,
            status=status.HTTP_201_CREATED,
        )

    @allow_fine_permission(PermissionKey.WORKSPACE_DEV_MODE_MANAGE, level="WORKSPACE")
    def bulk_create(self, request, slug, dev_mode_id):
        """一次多选阶段类型，各生成一行，名称取类型名，评审节点默认全勾。

        已有同名阶段的类型跳过（不报错）—— 前端把这些类型标成「已有」并置灰，用户仍可能
        在别的标签页里先建过。
        """
        dev_mode = self._get_dev_mode(dev_mode_id)
        if dev_mode is None:
            return self._not_found("Dev mode not found.")
        stage_type_ids = request.data.get("stage_type_ids")
        if not isinstance(stage_type_ids, list) or not stage_type_ids:
            return self._bad_request("stage_type_ids must be a non-empty list.")

        stage_types = list(
            StageType.objects.filter(
                workspace_id=dev_mode.workspace_id, id__in=stage_type_ids
            ).order_by("sort_order", "created_at", "id")
        )
        if len(stage_types) != len(set(str(item) for item in stage_type_ids)):
            return self._not_found("Some stage types were not found in this workspace.")

        taken_names = set(
            DevModeStage.objects.filter(dev_mode=dev_mode).values_list("name", flat=True)
        )
        pending = [item for item in stage_types if item.name not in taken_names]
        if not pending:
            return Response(
                {"created": 0, "skipped": len(stage_types)}, status=status.HTTP_200_OK
            )

        with transaction.atomic():
            last = (
                DevModeStage.objects.filter(dev_mode=dev_mode)
                .order_by("-sort_order")
                .values_list("sort_order", flat=True)
                .first()
            ) or 0
            stages = [
                DevModeStage(
                    dev_mode_id=dev_mode.id,
                    workspace_id=dev_mode.workspace_id,
                    stage_type_id=stage_type.id,
                    name=stage_type.name,
                    sort_order=last + (index + 1) * SORT_ORDER_STEP,
                    created_by_id=request.user.id,
                )
                for index, stage_type in enumerate(pending)
            ]
            # bulk_create 绕过 save()，workspace_id 与 sort_order 上面已显式给了
            DevModeStage.objects.bulk_create(stages)
            templates_by_stage_type = {}
            for template in StageReviewTemplate.objects.filter(
                stage_id__in=[item.stage_type_id for item in stages], is_active=True
            ).only("id", "stage_id"):
                templates_by_stage_type.setdefault(template.stage_id, []).append(
                    template.id
                )
            DevModeStageTemplate.objects.bulk_create(
                [
                    DevModeStageTemplate(
                        dev_mode_stage_id=stage.id,
                        template_id=template_id,
                        created_by_id=request.user.id,
                    )
                    for stage in stages
                    for template_id in templates_by_stage_type.get(
                        stage.stage_type_id, []
                    )
                ]
            )
        return Response(
            {"created": len(stages), "skipped": len(stage_types) - len(stages)},
            status=status.HTTP_201_CREATED,
        )

    @allow_fine_permission(PermissionKey.WORKSPACE_DEV_MODE_MANAGE, level="WORKSPACE")
    def partial_update(self, request, slug, dev_mode_id, pk):
        dev_mode = self._get_dev_mode(dev_mode_id)
        if dev_mode is None:
            return self._not_found("Dev mode not found.")
        stage = self._stages_of(dev_mode).filter(pk=pk).first()
        if stage is None:
            return self._not_found("Dev mode stage not found.")
        # 阶段类型不给改：换类型等于换掉整棵可选评审树，已勾的节点会全部失配。
        # 要换就删了重建，那条路上勾选的丢失是用户预期内的。
        if "stage_type_id" in request.data:
            return self._bad_request(
                "Stage type cannot be changed. Delete the stage and create a new one.",
                "DEV_MODE_STAGE_TYPE_IMMUTABLE",
            )
        serializer = DevModeStageSerializer(
            stage, data=request.data, partial=True, context=self._context(dev_mode)
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(
            DevModeStageSerializer(
                self._stages_of(dev_mode).filter(pk=pk).first(),
                context=self._context(dev_mode),
            ).data,
            status=status.HTTP_200_OK,
        )

    @allow_fine_permission(PermissionKey.WORKSPACE_DEV_MODE_MANAGE, level="WORKSPACE")
    def destroy(self, request, slug, dev_mode_id, pk):
        dev_mode = self._get_dev_mode(dev_mode_id)
        if dev_mode is None:
            return self._not_found("Dev mode not found.")
        stage = self._stages_of(dev_mode).filter(pk=pk).first()
        if stage is None:
            return self._not_found("Dev mode stage not found.")
        if stage_in_use(stage):
            return _stage_in_use_response(
                "This stage is used by a tailoring or a review."
            )
        try:
            # 硬删（模型 delete 已强制 soft=False）。stage_in_use 只算活跃行，库里有软删残留的
            # 格子 / 评审时 DB 的 RESTRICT 仍会拦，照阶段类型的写法收成 409 而不是 500。
            stage.delete()
        except (ProtectedError, RestrictedError):
            return _stage_in_use_response(
                "This stage is still referenced by deleted tailorings or reviews."
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_fine_permission(PermissionKey.WORKSPACE_DEV_MODE_MANAGE, level="WORKSPACE")
    def bulk_destroy(self, request, slug, dev_mode_id):
        """勾选批量删除。有任一阶段被引用就整批拒绝，不做部分成功。"""
        dev_mode = self._get_dev_mode(dev_mode_id)
        if dev_mode is None:
            return self._not_found("Dev mode not found.")
        stage_ids = request.data.get("stage_ids")
        if not isinstance(stage_ids, list) or not stage_ids:
            return self._bad_request("stage_ids must be a non-empty list.")
        stages = list(self._stages_of(dev_mode).filter(id__in=stage_ids))
        if len(stages) != len(set(str(item) for item in stage_ids)):
            return self._not_found("Some stages were not found in this dev mode.")
        blocked = [stage.name for stage in stages if stage_in_use(stage)]
        if blocked:
            return _stage_in_use_response(
                "Some stages are used by a tailoring or a review.", stages=blocked
            )
        try:
            with transaction.atomic():
                for stage in stages:
                    stage.delete()
        except (ProtectedError, RestrictedError):
            # 同 destroy：软删残留撞 RESTRICT，整批回滚并回 409
            return _stage_in_use_response(
                "Some stages are still referenced by deleted tailorings or reviews."
            )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_fine_permission(PermissionKey.WORKSPACE_DEV_MODE_MANAGE, level="WORKSPACE")
    def reorder(self, request, slug, dev_mode_id):
        """整段重排：客户端传该模式内完整的有序 id 列表（照阶段类型的 reorder）。"""
        dev_mode = self._get_dev_mode(dev_mode_id)
        if dev_mode is None:
            return self._not_found("Dev mode not found.")
        ids = request.data.get("stage_ids")
        if not isinstance(ids, list) or not ids:
            return self._bad_request("stage_ids must be a non-empty list.")
        stages = {str(item.id): item for item in self._stages_of(dev_mode).filter(id__in=ids)}
        ordered = [stages.get(str(item_id)) for item_id in ids]
        if any(item is None for item in ordered):
            return self._not_found("Some stages were not found in this dev mode.")
        with transaction.atomic():
            for index, stage in enumerate(ordered):
                stage.sort_order = (index + 1) * SORT_ORDER_STEP
            DevModeStage.objects.bulk_update(ordered, ["sort_order"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    # ---- 阶段下的评审勾选 ----------------------------------------------------

    @allow_fine_permission(*DEV_MODE_READ_KEYS, level="WORKSPACE")
    def templates(self, request, slug, dev_mode_id, pk):
        """该阶段类型下的评审树（评审 → 活动两层）加 selected。"""
        dev_mode = self._get_dev_mode(dev_mode_id)
        if dev_mode is None:
            return self._not_found("Dev mode not found.")
        stage = self._stages_of(dev_mode).filter(pk=pk).first()
        if stage is None:
            return self._not_found("Dev mode stage not found.")
        nodes = StageReviewTemplate.objects.filter(
            stage_id=stage.stage_type_id, is_active=True
        ).order_by("sort_order", "created_at", "id")
        selected_ids = set(
            DevModeStageTemplate.objects.filter(dev_mode_stage=stage).values_list(
                "template_id", flat=True
            )
        )
        serializer = DevModeStageTemplateNodeSerializer(
            nodes, many=True, context={"selected_ids": selected_ids}
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.WORKSPACE_DEV_MODE_MANAGE, level="WORKSPACE")
    def set_templates(self, request, slug, dev_mode_id, pk):
        """整体替换该阶段的勾选集合（body ``template_ids[]``）。"""
        dev_mode = self._get_dev_mode(dev_mode_id)
        if dev_mode is None:
            return self._not_found("Dev mode not found.")
        stage = self._stages_of(dev_mode).filter(pk=pk).first()
        if stage is None:
            return self._not_found("Dev mode stage not found.")
        template_ids = request.data.get("template_ids")
        if not isinstance(template_ids, list):
            return self._bad_request("template_ids must be a list.")

        allowed = selectable_template_ids(stage)
        incoming = {str(item) for item in template_ids}
        unknown = incoming - {str(item) for item in allowed}
        if unknown:
            # 勾了不属于这个阶段类型的节点，或者已停用的节点
            return self._bad_request(
                "Some templates do not belong to this stage type.",
                "DEV_MODE_STAGE_TEMPLATE_MISMATCH",
            )

        current = {
            str(item)
            for item in DevModeStageTemplate.objects.filter(
                dev_mode_stage=stage
            ).values_list("template_id", flat=True)
        }
        to_add = incoming - current
        to_remove = current - incoming
        with transaction.atomic():
            if to_remove:
                # 必须显式 soft=False：queryset 的 delete() 默认软删，留下的行会让
                # dev_mode_stage_template_unique_active 挡住之后重新勾选同一个节点。
                DevModeStageTemplate.objects.filter(
                    dev_mode_stage=stage, template_id__in=to_remove
                ).delete(soft=False)
            if to_add:
                DevModeStageTemplate.objects.bulk_create(
                    [
                        DevModeStageTemplate(
                            dev_mode_stage_id=stage.id,
                            template_id=template_id,
                            created_by_id=request.user.id,
                        )
                        for template_id in to_add
                    ]
                )
        return Response(
            {"selected": len(incoming)},
            status=status.HTTP_200_OK,
        )


def _select_all_templates(stage, actor):
    """把该阶段类型下的全部活跃模板节点勾上。新建阶段时调用。"""
    DevModeStageTemplate.objects.bulk_create(
        [
            DevModeStageTemplate(
                dev_mode_stage_id=stage.id,
                template_id=template_id,
                created_by_id=getattr(actor, "id", None),
            )
            for template_id in selectable_template_ids(stage)
        ]
    )
