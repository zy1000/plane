"""项目阶段的接口层。视图保持薄：取对象、锁行、调 ``utils/project_stage``、序列化回去。

列表整棵一次返回（扁平，前端按 ``parent_id`` 建树），一个项目十几到几十条；父阶段的
占比在这里算好（``computed_ratios``）放进 serializer context。
"""

from django.db import transaction
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers.project_stage import (
    ProjectStageBulkUpdateSerializer,
    ProjectStageSerializer,
)
from plane.app.views.base import BaseViewSet
from plane.db.models import Project, ProjectStage
from plane.utils.project_stage import (
    ProjectStageError,
    bulk_update_stages,
    create_stage,
    delete_stage,
    load_tree,
    sync_from_dev_mode,
    update_stage,
)

PROJECT_STAGE_READ_KEYS = (
    PermissionKey.PROJECT_STAGE_VIEW,
    PermissionKey.PROJECT_STAGE_MANAGE,
)
PROJECT_STAGE_MANAGE_KEY = PermissionKey.PROJECT_STAGE_MANAGE

#: 「当前状态不允许」而不是「请求写错了」
CONFLICT_CODES = {"PROJECT_STAGE_HAS_CHILDREN", "PROJECT_STAGE_IN_USE"}


def project_stage_error_response(exc):
    http_status = (
        status.HTTP_409_CONFLICT if exc.code in CONFLICT_CODES else status.HTTP_400_BAD_REQUEST
    )
    return Response({"error": exc.message, "code": exc.code, **exc.detail}, status=http_status)


class ProjectStageViewSet(BaseViewSet):
    model = ProjectStage
    serializer_class = ProjectStageSerializer
    search_fields = ["name"]

    def _project(self):
        return (
            Project.objects.filter(
                pk=self.kwargs.get("project_id"),
                workspace__slug=self.kwargs.get("slug"),
                archived_at__isnull=True,
            )
            .only("id", "workspace_id", "dev_mode_id")
            .first()
        )

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .select_related("stage_type", "owner", "owner__avatar_asset", "parent")
            .annotate(
                children_count=Count(
                    "children", filter=Q(children__deleted_at__isnull=True), distinct=True
                ),
                # 挂在这个阶段上的活跃评审数：阶段页行尾的「N 条评审」小标，让人知道哪些阶段动不了
                review_count=Count(
                    "stage_reviews", filter=Q(stage_reviews__deleted_at__isnull=True), distinct=True
                ),
            )
            .distinct()
        )

    def _context(self, project=None, with_ratios=True):
        context = {
            "project": project or self._project(),
            "project_id": self.kwargs.get("project_id"),
            "request": self.request,
        }
        if with_ratios:
            context["ratios"] = load_tree(self.kwargs.get("project_id")).computed_ratios()
        return context

    def _locked(self, pk):
        return (
            ProjectStage.objects.filter(
                pk=pk,
                project_id=self.kwargs.get("project_id"),
                workspace__slug=self.kwargs.get("slug"),
            )
            .select_for_update(of=("self",))
            .first()
        )

    def _detail_response(self, pk, http_status=status.HTTP_200_OK):
        stage = self.get_queryset().filter(pk=pk).first()
        if stage is None:
            return Response({"error": "Stage not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(ProjectStageSerializer(stage, context=self._context()).data, status=http_status)

    @allow_fine_permission(*PROJECT_STAGE_READ_KEYS)
    def list(self, request, slug, project_id):
        stages = self.get_queryset()
        return Response(
            ProjectStageSerializer(stages, many=True, context=self._context()).data,
            status=status.HTTP_200_OK,
        )

    @allow_fine_permission(*PROJECT_STAGE_READ_KEYS)
    def retrieve(self, request, slug, project_id, pk):
        return self._detail_response(pk)

    @allow_fine_permission(PROJECT_STAGE_MANAGE_KEY)
    def create(self, request, slug, project_id):
        project = self._project()
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = ProjectStageSerializer(
            data=request.data, context=self._context(project, with_ratios=False)
        )
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                stage = create_stage(
                    project, actor=request.user, validated_data=serializer.validated_data
                )
        except ProjectStageError as exc:
            return project_stage_error_response(exc)
        return self._detail_response(stage.id, status.HTTP_201_CREATED)

    @allow_fine_permission(PROJECT_STAGE_MANAGE_KEY)
    def partial_update(self, request, slug, project_id, pk):
        project = self._project()
        try:
            with transaction.atomic():
                stage = self._locked(pk)
                if stage is None:
                    return Response({"error": "Stage not found."}, status=status.HTTP_404_NOT_FOUND)
                serializer = ProjectStageSerializer(
                    stage,
                    data=request.data,
                    partial=True,
                    context=self._context(project, with_ratios=False),
                )
                serializer.is_valid(raise_exception=True)
                update_stage(stage, actor=request.user, validated_data=serializer.validated_data)
        except ProjectStageError as exc:
            return project_stage_error_response(exc)
        return self._detail_response(pk)

    @allow_fine_permission(PROJECT_STAGE_MANAGE_KEY)
    def destroy(self, request, slug, project_id, pk):
        try:
            with transaction.atomic():
                stage = self._locked(pk)
                if stage is None:
                    return Response({"error": "Stage not found."}, status=status.HTTP_404_NOT_FOUND)
                delete_stage(stage)
        except ProjectStageError as exc:
            return project_stage_error_response(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_fine_permission(PROJECT_STAGE_MANAGE_KEY)
    def bulk_update(self, request, slug, project_id):
        """勾选后批量改负责人 / 计划日期。别处的 id 静默忽略，逐条部分成功。"""
        serializer = ProjectStageBulkUpdateSerializer(
            data=request.data, context={"project_id": project_id}
        )
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        stage_ids = [str(stage_id) for stage_id in data.pop("stage_ids")]

        with transaction.atomic():
            stages = list(
                {
                    stage.id: stage
                    for stage in ProjectStage.objects.filter(
                        id__in=stage_ids,
                        project_id=project_id,
                        workspace__slug=slug,
                        project__project_projectmember__member=request.user,
                        project__project_projectmember__is_active=True,
                    )
                    .select_for_update(of=("self",))
                    .order_by("id")
                }.values()
            )
            updated, failed = bulk_update_stages(stages, actor=request.user, changes=data)

        updated_ids = [stage.id for stage in updated]
        rows = self.get_queryset().filter(id__in=updated_ids) if updated_ids else []
        return Response(
            {
                "updated": len(updated_ids),
                "failed": failed,
                "stages": ProjectStageSerializer(rows, many=True, context=self._context()).data,
            },
            status=status.HTTP_200_OK,
        )

    @allow_fine_permission(PROJECT_STAGE_MANAGE_KEY)
    def sync_from_dev_mode(self, request, slug, project_id):
        """把项目研发模式里还没带出的阶段补进来。body 可带 ``stage_ids``（模式阶段 id）只补勾选的。"""
        project = self._project()
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        only_ids = request.data.get("stage_ids")
        if only_ids is not None and not isinstance(only_ids, list):
            return Response({"error": "stage_ids must be a list."}, status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            result = sync_from_dev_mode(project, actor=request.user, only_ids=only_ids)
        created_ids = [stage.id for stage in result["created"]]
        rows = self.get_queryset().filter(id__in=created_ids) if created_ids else []
        return Response(
            {
                "created": ProjectStageSerializer(rows, many=True, context=self._context()).data,
                "skipped": result["skipped"],
                "matched_by_name": result["matched_by_name"],
                "ratio_dropped": result["ratio_dropped"],
            },
            status=status.HTTP_200_OK,
        )
