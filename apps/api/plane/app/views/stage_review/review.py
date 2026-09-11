"""阶段评审实例的接口层。

视图保持薄：取对象、锁行、调 ``utils/stage_review``、序列化回去。状态机、结论校验与
负责人解析都在 utils 里。

**评审与评审活动是同一张表的两行**，所以只有一套 CRUD 与一套状态动作，靠 ``kind`` 与
``parent`` 区分层级 —— 列表扁平返回，前端按产品分组后把活动缩进到所属评审下。

推进状态的动作一律在 ``transaction.atomic()`` 里对评审行
``select_for_update(of=("self",))``：两个人同时点「提交审核」时，后一个必须看到前一个
写完的状态，否则会写出两条同样的活动记录。``of=("self",)`` 是必须的 —— queryset 上带
了 nullable FK 的 ``select_related`` 时 Postgres 不允许对外连接的可空侧加锁。
"""

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers.stage_review import (
    StageReviewActivitySerializer,
    StageReviewCommentSerializer,
    StageReviewCreateSerializer,
    StageReviewDetailSerializer,
    StageReviewListSerializer,
    StageReviewSubmitSerializer,
    StageReviewUpdateSerializer,
)
from plane.app.serializers.user import UserLiteSerializer
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.bgtasks.storage_metadata_task import get_asset_object_metadata
from plane.db.models import (
    DataDictionaryItem,
    FileAsset,
    Product,
    ProductProject,
    Project,
    StageReview,
    StageReviewActivity,
    StageReviewComment,
    StageReviewStatus,
    Workspace,
)
from plane.settings.storage import S3Storage
from plane.utils.asset_upload import presigned_post_for_asset
from plane.utils.stage_review import (
    StageReviewError,
    advance as advance_review,
    create_manual_review,
    delete_review,
    resolve_role_candidates,
    rollback as rollback_review,
    update_review,
    write_activity,
)

#: 读评审：查看或维护任一即可（只配了维护的角色不该被读挡住，口径同评审裁剪）
STAGE_REVIEW_READ_KEYS = (
    PermissionKey.PROJECT_STAGE_REVIEW_VIEW,
    PermissionKey.PROJECT_STAGE_REVIEW_MANAGE,
)
STAGE_REVIEW_MANAGE_KEY = PermissionKey.PROJECT_STAGE_REVIEW_MANAGE

STAGE_REVIEW_FILE_ENTITY_TYPE = FileAsset.EntityTypeContext.STAGE_REVIEW_FILE

#: 这些是「当前状态不允许」而不是「请求写错了」，回 409 让前端能区分对待
CONFLICT_CODES = {
    "STAGE_REVIEW_ALREADY_COMPLETED",
    "STAGE_REVIEW_NO_PREVIOUS_STATUS",
    "STAGE_REVIEW_FROM_TAILORING_UNDELETABLE",
}


def stage_review_error_response(exc):
    http_status = (
        status.HTTP_409_CONFLICT
        if exc.code in CONFLICT_CODES
        else status.HTTP_400_BAD_REQUEST
    )
    return Response(
        {"error": exc.message, "code": exc.code, **exc.detail}, status=http_status
    )


def _attachment_count_annotation():
    """已上传且未删除的附件数。列表里的回形针数字就是它。"""
    return Count(
        "assets",
        filter=Q(
            assets__entity_type=STAGE_REVIEW_FILE_ENTITY_TYPE,
            assets__is_deleted=False,
            assets__is_uploaded=True,
        ),
        distinct=True,
    )


class StageReviewViewSet(BaseViewSet):
    """阶段评审：项目级资源，按 project.stage_review.* 鉴权。

    列表按阶段取全量（一个阶段下的评审是几十条量级，分页只会让「按产品分组 + 四个
    状态计数」变成需要翻页才算得准的东西）。
    """

    model = StageReview
    serializer_class = StageReviewListSerializer
    search_fields = ["title"]

    def _scoped_queryset(self):
        """项目 + 成员可见性的基础 queryset。

        聚合查询（左栏的阶段进度）必须从这里出发而不是 ``get_queryset()`` ——
        ``.values().annotate()`` 会把先前的 annotate 一起塞进 GROUP BY，附件数那一条
        会把阶段计数打散。
        """
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
            .select_related(
                "product", "stage", "stage__dictionary", "leader", "auditor", "project"
            )
        )

    def get_queryset(self):
        return (
            self._scoped_queryset()
            .annotate(attachment_count=_attachment_count_annotation())
            .distinct()
        )

    def _locked(self, pk):
        """取评审行并加锁。所有改状态的动作都从这里拿对象。"""
        return (
            StageReview.objects.filter(
                pk=pk,
                project_id=self.kwargs.get("project_id"),
                workspace__slug=self.kwargs.get("slug"),
            )
            .select_for_update(of=("self",))
            .first()
        )

    def _detail_response(self, pk, http_status=status.HTTP_200_OK):
        review = (
            self.get_queryset()
            .filter(pk=pk)
            .annotate(
                comment_count=Count(
                    "comments",
                    filter=Q(comments__deleted_at__isnull=True),
                    distinct=True,
                )
            )
            .first()
        )
        if review is None:
            return self._not_found()
        return Response(StageReviewDetailSerializer(review).data, status=http_status)

    @staticmethod
    def _not_found():
        return Response(
            {"error": "Stage review not found."}, status=status.HTTP_404_NOT_FOUND
        )

    # --- 读 ---------------------------------------------------------------

    @allow_fine_permission(*STAGE_REVIEW_READ_KEYS)
    def list(self, request, slug, project_id):
        """一个阶段下的全部评审，扁平返回。

        产品 / 状态 / 负责人这些筛选留在前端 —— 四个状态计数与产品分组头的「x / y
        已评审」都要基于同一份未筛选的数据算，服务端再筛一遍反而要把计数单独再查。
        """
        queryset = self.get_queryset()
        stage_id = request.query_params.get("stage_id")
        if stage_id:
            queryset = queryset.filter(stage_id=stage_id)
        queryset = queryset.order_by(
            "product__name", "sort_order", "created_at", "id"
        )
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(*STAGE_REVIEW_READ_KEYS)
    def retrieve(self, request, slug, project_id, pk):
        return self._detail_response(pk)

    @allow_fine_permission(*STAGE_REVIEW_READ_KEYS)
    def stages(self, request, slug, project_id):
        """左栏的阶段列表：只列出真的有评审的阶段，带完成进度。

        阶段本身来自 ``product_stage`` 数据字典，但这里不查字典全表 —— 没有评审的
        阶段出现在左栏只会让人点进去看空列表。
        """
        rows = (
            self._scoped_queryset()
            .values("stage_id", "stage__label", "stage__sort_order")
            .annotate(
                total=Count("id", distinct=True),
                completed=Count(
                    "id",
                    filter=Q(status=StageReviewStatus.COMPLETED),
                    distinct=True,
                ),
            )
            .order_by("stage__sort_order", "stage__label")
        )
        return Response(
            [
                {
                    "stage_id": str(row["stage_id"]),
                    "label": row["stage__label"],
                    "total": row["total"],
                    "completed": row["completed"],
                }
                for row in rows
            ],
            status=status.HTTP_200_OK,
        )

    @allow_fine_permission(*STAGE_REVIEW_READ_KEYS)
    def candidates(self, request, slug, project_id, pk):
        """负责人 / 审核者的候选人。三级回退：产品角色 → 工作区角色 → 全部项目成员。

        ``source`` 告诉前端这批人是从哪一层找出来的，好提示「产品下没有这个角色，
        列的是工作区 / 全部项目成员」，而不是给一个看不出所以然的名单。
        """
        role = request.query_params.get("role", "leader")
        if role not in ("leader", "auditor"):
            return Response(
                {"error": "role must be leader or auditor."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        review = self.get_queryset().filter(pk=pk).first()
        if review is None:
            return self._not_found()
        users, source = resolve_role_candidates(review, role)
        return Response(
            {
                "role_name": getattr(review, f"{role}_role", "") or "",
                "source": source,
                "results": UserLiteSerializer(users, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    # --- 写 ---------------------------------------------------------------

    @allow_fine_permission(STAGE_REVIEW_MANAGE_KEY)
    def create(self, request, slug, project_id):
        """手工新建一条评审。``template`` 为空，**不回写任何裁剪格子**。"""
        serializer = StageReviewCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        project = Project.objects.filter(id=project_id, workspace__slug=slug).first()
        if project is None:
            return Response(
                {"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND
            )
        # 产品必须已经和项目建过关联（ProductProject），否则评审会挂在一个本项目
        # 根本引用不到的产品上。这条跨表规则 DB 表达不了，只能在写入口挡。
        if not ProductProject.objects.filter(
            project_id=project.id, product_id=data["product_id"]
        ).exists():
            return Response(
                {
                    "error": "该产品还没有关联到本项目",
                    "code": "STAGE_REVIEW_PRODUCT_NOT_LINKED",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        product = Product.objects.filter(id=data["product_id"]).first()
        stage = DataDictionaryItem.objects.filter(
            id=data["stage_id"], workspace_id=project.workspace_id
        ).first()
        if product is None or stage is None:
            return Response(
                {"error": "Product or stage not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        try:
            with transaction.atomic():
                review = create_manual_review(
                    project=project,
                    product=product,
                    stage=stage,
                    actor=request.user,
                    data=data,
                )
        except StageReviewError as exc:
            return stage_review_error_response(exc)
        return self._detail_response(review.id, status.HTTP_201_CREATED)

    @allow_fine_permission(STAGE_REVIEW_MANAGE_KEY)
    def partial_update(self, request, slug, project_id, pk):
        review = self.get_queryset().filter(pk=pk).first()
        if review is None:
            return self._not_found()
        serializer = StageReviewUpdateSerializer(
            review, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                update_review(
                    review, actor=request.user, validated_data=serializer.validated_data
                )
        except StageReviewError as exc:
            return stage_review_error_response(exc)
        return self._detail_response(pk)

    @allow_fine_permission(STAGE_REVIEW_MANAGE_KEY)
    def destroy(self, request, slug, project_id, pk):
        try:
            with transaction.atomic():
                review = self._locked(pk)
                if review is None:
                    return self._not_found()
                delete_review(review)
        except StageReviewError as exc:
            return stage_review_error_response(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)

    # --- 状态推进 ---------------------------------------------------------

    @allow_fine_permission(STAGE_REVIEW_MANAGE_KEY)
    def advance(self, request, slug, project_id, pk):
        """推进一步。``评审中 → 审核中`` 这一跳要带结论。"""
        payload = {}
        try:
            with transaction.atomic():
                review = self._locked(pk)
                if review is None:
                    return self._not_found()
                if review.status == StageReviewStatus.IN_REVIEW:
                    serializer = StageReviewSubmitSerializer(data=request.data)
                    serializer.is_valid(raise_exception=True)
                    payload = serializer.validated_data
                advance_review(review, actor=request.user, payload=payload)
        except StageReviewError as exc:
            return stage_review_error_response(exc)
        return self._detail_response(pk)

    @allow_fine_permission(STAGE_REVIEW_MANAGE_KEY)
    def rollback(self, request, slug, project_id, pk):
        """退回上一步。只回一步。"""
        try:
            with transaction.atomic():
                review = self._locked(pk)
                if review is None:
                    return self._not_found()
                rollback_review(review, actor=request.user)
        except StageReviewError as exc:
            return stage_review_error_response(exc)
        return self._detail_response(pk)


class StageReviewCommentViewSet(BaseViewSet):
    """评审下的评论。发布后不可编辑，只允许作者本人删 —— 口径同裁剪表评论。"""

    model = StageReviewComment
    serializer_class = StageReviewCommentSerializer

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(stage_review_id=self.kwargs.get("stage_review_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .select_related("project", "workspace", "stage_review", "actor")
            .order_by("created_at")
            .distinct()
        )

    @allow_fine_permission(*STAGE_REVIEW_READ_KEYS)
    def list(self, request, slug, project_id, stage_review_id):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(*STAGE_REVIEW_READ_KEYS)
    def create(self, request, slug, project_id, stage_review_id):
        review = StageReview.objects.filter(
            id=stage_review_id, project_id=project_id, workspace__slug=slug
        ).first()
        if review is None:
            return Response(
                {"error": "Stage review not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            comment = serializer.save(
                workspace_id=review.workspace_id,
                project_id=project_id,
                stage_review=review,
                actor=request.user,
            )
            # 评论也进变更历史：一条时间线读得完「谁推进了什么、谁说了什么」
            write_activity(
                review,
                actor=request.user,
                verb="created",
                field="comment",
                comment=comment.comment_stripped[:255],
                review_comment=comment,
            )
        return Response(
            self.get_serializer(comment).data, status=status.HTTP_201_CREATED
        )

    @allow_fine_permission(*STAGE_REVIEW_READ_KEYS)
    def destroy(self, request, slug, project_id, stage_review_id, pk):
        comment = StageReviewComment.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            stage_review_id=stage_review_id,
            pk=pk,
        ).first()
        if comment is None:
            return Response(
                {"error": "Comment not found."}, status=status.HTTP_404_NOT_FOUND
            )
        if comment.actor_id != request.user.id:
            return Response(
                {"error": "Only the comment author can delete this comment."},
                status=status.HTTP_403_FORBIDDEN,
            )
        comment.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class StageReviewActivityEndpoint(BaseAPIView):
    """变更历史。按时间升序全量返回 —— 一条评审的活动量级是几条到几十条。"""

    @allow_fine_permission(*STAGE_REVIEW_READ_KEYS)
    def get(self, request, slug, project_id, stage_review_id):
        activities = (
            StageReviewActivity.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                stage_review_id=stage_review_id,
            )
            .select_related("actor")
            .order_by("created_at")
        )
        serializer = StageReviewActivitySerializer(activities, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class StageReviewFileAPI(BaseViewSet):
    """评审附件，走 FileAsset 的两步预签名上传，口径同迭代附件。"""

    model = FileAsset

    def _review(self, slug, project_id, stage_review_id):
        return StageReview.objects.filter(
            id=stage_review_id, project_id=project_id, workspace__slug=slug
        ).first()

    @staticmethod
    def _serialize(asset):
        attributes = asset.attributes or {}
        return {
            "id": str(asset.id),
            "name": attributes.get("name") or "",
            "size": int(asset.size or 0),
            "type": attributes.get("type") or "",
            "is_uploaded": bool(asset.is_uploaded),
            "created_at": asset.created_at,
            "created_by_id": str(asset.created_by_id) if asset.created_by_id else None,
            "created_by_detail": UserLiteSerializer(asset.created_by).data
            if asset.created_by_id
            else None,
        }

    @allow_fine_permission(*STAGE_REVIEW_READ_KEYS)
    def list(self, request, slug, project_id, stage_review_id):
        assets = (
            FileAsset.objects.filter(
                stage_review_id=stage_review_id,
                workspace__slug=slug,
                project_id=project_id,
                entity_type=STAGE_REVIEW_FILE_ENTITY_TYPE,
                is_deleted=False,
                is_uploaded=True,
            )
            .select_related("created_by")
            .order_by("created_at")
        )
        return Response(
            [self._serialize(asset) for asset in assets], status=status.HTTP_200_OK
        )

    @allow_fine_permission(STAGE_REVIEW_MANAGE_KEY)
    def upload(self, request, slug, project_id, stage_review_id):
        review = self._review(slug, project_id, stage_review_id)
        if review is None:
            return Response(
                {"error": "Stage review not found."}, status=status.HTTP_404_NOT_FOUND
            )
        name = request.data.get("name")
        if not name:
            return Response(
                {"error": "name is required"}, status=status.HTTP_400_BAD_REQUEST
            )
        file_type = request.data.get("type") or "application/octet-stream"
        size = int(request.data.get("size", settings.FILE_SIZE_LIMIT))
        size_limit = min(size, settings.FILE_SIZE_LIMIT)
        workspace = Workspace.objects.get(slug=slug)

        asset = FileAsset.objects.create(
            attributes={"name": name, "type": file_type, "size": size_limit},
            size=size_limit,
            workspace_id=workspace.id,
            project_id=project_id,
            stage_review_id=review.id,
            created_by=request.user,
            entity_type=STAGE_REVIEW_FILE_ENTITY_TYPE,
        )
        upload_data = presigned_post_for_asset(
            request=request, asset=asset, file_type=file_type, file_size=size_limit
        )
        return Response(
            {
                "upload_data": upload_data,
                "asset_id": str(asset.id),
                "asset": self._serialize(asset),
            },
            status=status.HTTP_200_OK,
        )

    @allow_fine_permission(STAGE_REVIEW_MANAGE_KEY)
    def mark_uploaded(self, request, slug, project_id, stage_review_id, asset_id):
        asset = FileAsset.objects.filter(
            pk=asset_id,
            workspace__slug=slug,
            project_id=project_id,
            stage_review_id=stage_review_id,
            entity_type=STAGE_REVIEW_FILE_ENTITY_TYPE,
            is_deleted=False,
        ).first()
        if asset is None:
            return Response(
                {"error": "File not found"}, status=status.HTTP_404_NOT_FOUND
            )
        asset.is_uploaded = True
        if not asset.storage_metadata:
            get_asset_object_metadata.delay(asset_id=str(asset.id))
        asset.save(update_fields=["is_uploaded"])

        review = self._review(slug, project_id, stage_review_id)
        if review is not None:
            write_activity(
                review,
                actor=request.user,
                verb="created",
                field="attachment",
                new_value=(asset.attributes or {}).get("name") or "",
                extra={"asset_id": str(asset.id)},
            )
        return Response(self._serialize(asset), status=status.HTTP_200_OK)

    @allow_fine_permission(STAGE_REVIEW_MANAGE_KEY)
    def destroy(self, request, slug, project_id, stage_review_id, asset_id):
        asset = FileAsset.objects.filter(
            pk=asset_id,
            workspace__slug=slug,
            project_id=project_id,
            stage_review_id=stage_review_id,
            entity_type=STAGE_REVIEW_FILE_ENTITY_TYPE,
            is_deleted=False,
        ).first()
        if asset is None:
            return Response(
                {"error": "File not found"}, status=status.HTTP_404_NOT_FOUND
            )
        asset.is_deleted = True
        asset.deleted_at = timezone.now()
        asset.save(update_fields=["is_deleted", "deleted_at"])

        review = self._review(slug, project_id, stage_review_id)
        if review is not None:
            write_activity(
                review,
                actor=request.user,
                verb="deleted",
                field="attachment",
                old_value=(asset.attributes or {}).get("name") or "",
                extra={"asset_id": str(asset.id)},
            )
        # 物理删除对象，避免 MinIO 累积孤儿（口径同迭代附件）
        try:
            S3Storage(request=request).delete_files(object_names=[asset.storage_key])
        except Exception:
            pass
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_fine_permission(*STAGE_REVIEW_READ_KEYS)
    def download(self, request, slug, project_id, stage_review_id, asset_id):
        asset = FileAsset.objects.filter(
            pk=asset_id,
            workspace__slug=slug,
            project_id=project_id,
            stage_review_id=stage_review_id,
            entity_type=STAGE_REVIEW_FILE_ENTITY_TYPE,
            is_uploaded=True,
            is_deleted=False,
        ).first()
        if asset is None:
            return Response(
                {"error": "File not found"}, status=status.HTTP_404_NOT_FOUND
            )
        storage = S3Storage(request=request)
        signed_url = storage.generate_presigned_url(
            object_name=asset.storage_key,
            disposition="attachment",
            filename=(asset.attributes or {}).get("name"),
        )
        return Response({"download_url": signed_url}, status=status.HTTP_200_OK)
