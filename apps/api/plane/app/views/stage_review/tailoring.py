"""评审裁剪的接口层。

视图刻意保持薄：取对象、锁行、调 ``utils/review_tailoring``、把结果序列化回去。
所有状态机与生效编排都在 utils 里，这里只负责 HTTP 语义。

**每个改状态的动作都在 ``transaction.atomic()`` 里对表头行
``select_for_update(of=("self",))``** —— 表头是聚合根，通过判定要跨多条签批行聚合，
只锁签批行挡不住并发。``of=("self",)`` 是必须的：queryset 上带了 nullable FK 的
``select_related`` 时，Postgres 不允许对外连接的可空侧加锁。
"""

from django.db import transaction
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers.review_tailoring import (
    ReviewTailoringActSerializer,
    ReviewTailoringActivitySerializer,
    ReviewTailoringCellsSerializer,
    ReviewTailoringCommentSerializer,
    ReviewTailoringCreateSerializer,
    ReviewTailoringDetailSerializer,
    ReviewTailoringHeaderSerializer,
    ReviewTailoringListSerializer,
    ReviewTailoringProductsSerializer,
    ReviewTailoringReviewsSerializer,
    ReviewTailoringSubmitSerializer,
)
from plane.app.views.base import BaseAPIView, BaseViewSet
from plane.db.models import (
    Product,
    Project,
    ReviewTailoring,
    ReviewTailoringActivity,
    ReviewTailoringApproval,
    ReviewTailoringComment,
    ReviewTailoringItem,
    ReviewTailoringProduct,
)
from plane.utils.review_tailoring import (
    ReviewTailoringError,
    act_on_tailoring,
    add_products,
    add_reviews,
    attach_list_progress,
    axis_templates,
    cancel_revision,
    create_tailoring,
    delete_tailoring,
    remove_product,
    remove_review,
    save_cells,
    start_revision,
    submit_for_approval,
    update_header,
    withdraw,
)

#: 读裁剪表：查看或维护任一即可（只配了维护的角色不该被读挡住，口径同评审模板库）
TAILORING_READ_KEYS = (
    PermissionKey.PROJECT_REVIEW_TAILORING_VIEW,
    PermissionKey.PROJECT_REVIEW_TAILORING_MANAGE,
)
TAILORING_MANAGE_KEY = PermissionKey.PROJECT_REVIEW_TAILORING_MANAGE

#: 这些错误是「当前状态不允许」而不是「请求写错了」，回 409 让前端能区分对待
CONFLICT_CODES = {
    "REVIEW_TAILORING_NOT_EDITABLE",
    "REVIEW_TAILORING_NOT_PENDING",
    "REVIEW_TAILORING_NOT_APPROVED",
    "REVIEW_TAILORING_NOT_REVISING",
    "REVIEW_TAILORING_NOT_APPROVER",
    "REVIEW_TAILORING_NOT_SUBMITTER",
    "REVIEW_TAILORING_ALREADY_ACTED",
    "REVIEW_TAILORING_PRODUCT_NOT_LINKED",
    "REVIEW_TAILORING_APPROVER_INVALID",
    "REVIEW_TAILORING_REVIEW_COMPLETED",
    "REVIEW_TAILORING_TEMPLATE_DISABLED",
    "REVIEW_TAILORING_AXIS_IN_USE",
    "REVIEW_TAILORING_EFFECTIVE_UNDELETABLE",
    "REVIEW_TAILORING_PENDING_UNDELETABLE",
}


def tailoring_error_response(exc):
    http_status = (
        status.HTTP_409_CONFLICT
        if exc.code in CONFLICT_CODES
        else status.HTTP_400_BAD_REQUEST
    )
    return Response(
        {"error": exc.message, "code": exc.code, **exc.detail}, status=http_status
    )


class ReviewTailoringViewSet(BaseViewSet):
    """裁剪表：项目级资源，按 project.review_tailoring.* 鉴权。

    列表不带格子（一张表可能有几百个格子），详情才展开矩阵。
    """

    model = ReviewTailoring
    serializer_class = ReviewTailoringListSerializer
    search_fields = ["title"]
    filterset_fields = {"status": ["exact"]}

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .select_related("created_by", "submitted_by", "project")
            .annotate(
                item_count=Count(
                    "items", filter=Q(items__deleted_at__isnull=True), distinct=True
                ),
                selected_count=Count(
                    "items",
                    filter=Q(items__deleted_at__isnull=True, items__selected=True),
                    distinct=True,
                ),
                # 两个轴各自数自己的行数：从格子反推的话，只加了一个轴的表会显示成 0
                product_count=Count(
                    "axis_products",
                    filter=Q(axis_products__deleted_at__isnull=True),
                    distinct=True,
                ),
                review_count=Count(
                    "axis_templates",
                    filter=Q(axis_templates__deleted_at__isnull=True),
                    distinct=True,
                ),
            )
            .distinct()
        )

    # --- 详情组装 ---------------------------------------------------------

    def _detail_response(self, tailoring, http_status=status.HTTP_200_OK):
        """一次查完格子 / 产品 / 本轮签批，再喂给序列化器，避免逐条反查。"""
        items = list(
            ReviewTailoringItem.objects.filter(tailoring=tailoring)
            .select_related("template", "template__stage", "stage_review", "created_by")
            .order_by(
                "template__stage__sort_order",
                "template__sort_order",
                "template__created_at",
                "id",
            )
        )
        # 两个轴都单独查：只加了一个轴的表没有任何格子，从格子反推会画出一张空表
        rows = axis_templates(tailoring)
        products = list(
            Product.objects.filter(
                id__in=ReviewTailoringProduct.objects.filter(
                    tailoring=tailoring
                ).values_list("product_id", flat=True)
            ).order_by("identifier", "name")
        )
        approvals = list(
            ReviewTailoringApproval.objects.filter(
                tailoring=tailoring, round=tailoring.round
            )
            .select_related("approver")
            .order_by("created_at")
        )
        # 计数字段在列表 queryset 上 annotate，单条读取时补上，前端两处形状一致
        tailoring.item_count = len(items)
        tailoring.selected_count = sum(1 for item in items if item.selected)
        tailoring.product_count = len(products)
        tailoring.review_count = sum(1 for row in rows if row.parent_id is None)
        serializer = ReviewTailoringDetailSerializer(
            tailoring,
            context={
                "items": items,
                "rows": rows,
                "products": products,
                "approvals": approvals,
            },
        )
        return Response(serializer.data, status=http_status)

    def _locked(self, pk):
        """取表头行并加锁。所有改状态的动作都从这里拿对象。"""
        return (
            ReviewTailoring.objects.filter(
                pk=pk,
                project_id=self.kwargs.get("project_id"),
                workspace__slug=self.kwargs.get("slug"),
            )
            .select_for_update(of=("self",))
            .first()
        )

    @staticmethod
    def _not_found():
        return Response(
            {"error": "Review tailoring not found."}, status=status.HTTP_404_NOT_FOUND
        )

    # --- 读 ---------------------------------------------------------------

    @allow_fine_permission(*TAILORING_READ_KEYS)
    def list(self, request, slug, project_id):
        rows = attach_list_progress(self.get_queryset())
        serializer = self.get_serializer(rows, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(*TAILORING_READ_KEYS)
    def retrieve(self, request, slug, project_id, pk):
        tailoring = self.get_queryset().filter(pk=pk).first()
        if tailoring is None:
            return self._not_found()
        return self._detail_response(tailoring)

    # --- 写 ---------------------------------------------------------------

    @allow_fine_permission(TAILORING_MANAGE_KEY)
    def create(self, request, slug, project_id):
        serializer = ReviewTailoringCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        project = Project.objects.filter(
            id=project_id, workspace__slug=slug
        ).first()
        if project is None:
            return Response(
                {"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND
            )
        try:
            with transaction.atomic():
                tailoring = create_tailoring(
                    project=project,
                    title=serializer.validated_data["title"],
                    description_html=serializer.validated_data.get("description_html"),
                    actor=request.user,
                )
        except ReviewTailoringError as exc:
            return tailoring_error_response(exc)
        return self._detail_response(tailoring, status.HTTP_201_CREATED)

    @allow_fine_permission(TAILORING_MANAGE_KEY)
    def partial_update(self, request, slug, project_id, pk):
        serializer = ReviewTailoringHeaderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                tailoring = self._locked(pk)
                if tailoring is None:
                    return self._not_found()
                update_header(
                    tailoring=tailoring,
                    title=serializer.validated_data.get("title"),
                    description_html=serializer.validated_data.get("description_html"),
                    actor=request.user,
                )
        except ReviewTailoringError as exc:
            return tailoring_error_response(exc)
        return self._detail_response(self.get_queryset().filter(pk=pk).first())

    @allow_fine_permission(TAILORING_MANAGE_KEY)
    def destroy(self, request, slug, project_id, pk):
        try:
            with transaction.atomic():
                tailoring = self._locked(pk)
                if tailoring is None:
                    return self._not_found()
                delete_tailoring(tailoring=tailoring)
        except ReviewTailoringError as exc:
            return tailoring_error_response(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_fine_permission(TAILORING_MANAGE_KEY)
    def cells(self, request, slug, project_id, pk):
        """批量存勾选与裁剪原因。前端攒够一批再发，不做逐格自动保存。"""
        serializer = ReviewTailoringCellsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                tailoring = self._locked(pk)
                if tailoring is None:
                    return self._not_found()
                save_cells(
                    tailoring=tailoring,
                    cells=serializer.validated_data["cells"],
                    actor=request.user,
                )
        except ReviewTailoringError as exc:
            return tailoring_error_response(exc)
        return self._detail_response(self.get_queryset().filter(pk=pk).first())

    @allow_fine_permission(TAILORING_MANAGE_KEY)
    def products(self, request, slug, project_id, pk):
        serializer = ReviewTailoringProductsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                tailoring = self._locked(pk)
                if tailoring is None:
                    return self._not_found()
                add_products(
                    tailoring=tailoring,
                    product_ids=serializer.validated_data["product_ids"],
                    actor=request.user,
                )
        except ReviewTailoringError as exc:
            return tailoring_error_response(exc)
        return self._detail_response(self.get_queryset().filter(pk=pk).first())

    @allow_fine_permission(TAILORING_MANAGE_KEY)
    def remove_product(self, request, slug, project_id, pk, product_id):
        try:
            with transaction.atomic():
                tailoring = self._locked(pk)
                if tailoring is None:
                    return self._not_found()
                remove_product(
                    tailoring=tailoring, product_id=product_id, actor=request.user
                )
        except ReviewTailoringError as exc:
            return tailoring_error_response(exc)
        return self._detail_response(self.get_queryset().filter(pk=pk).first())

    @allow_fine_permission(TAILORING_MANAGE_KEY)
    def reviews(self, request, slug, project_id, pk):
        """加纵轴。只收顶层评审 —— 它下面的评审活动跟着整块进矩阵。"""
        serializer = ReviewTailoringReviewsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                tailoring = self._locked(pk)
                if tailoring is None:
                    return self._not_found()
                add_reviews(
                    tailoring=tailoring,
                    template_ids=serializer.validated_data["template_ids"],
                    actor=request.user,
                )
        except ReviewTailoringError as exc:
            return tailoring_error_response(exc)
        return self._detail_response(self.get_queryset().filter(pk=pk).first())

    @allow_fine_permission(TAILORING_MANAGE_KEY)
    def remove_review(self, request, slug, project_id, pk, template_id):
        try:
            with transaction.atomic():
                tailoring = self._locked(pk)
                if tailoring is None:
                    return self._not_found()
                remove_review(
                    tailoring=tailoring, template_id=template_id, actor=request.user
                )
        except ReviewTailoringError as exc:
            return tailoring_error_response(exc)
        return self._detail_response(self.get_queryset().filter(pk=pk).first())

    @allow_fine_permission(TAILORING_MANAGE_KEY)
    def submit(self, request, slug, project_id, pk):
        serializer = ReviewTailoringSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                tailoring = self._locked(pk)
                if tailoring is None:
                    return self._not_found()
                submit_for_approval(
                    tailoring=tailoring,
                    approver_ids=serializer.validated_data["approver_ids"],
                    approval_type=serializer.validated_data["approval_type"],
                    required_count=serializer.validated_data.get("required_count"),
                    actor=request.user,
                )
        except ReviewTailoringError as exc:
            return tailoring_error_response(exc)
        return self._detail_response(self.get_queryset().filter(pk=pk).first())

    @allow_fine_permission(TAILORING_MANAGE_KEY)
    def withdraw(self, request, slug, project_id, pk):
        try:
            with transaction.atomic():
                tailoring = self._locked(pk)
                if tailoring is None:
                    return self._not_found()
                withdraw(tailoring=tailoring, actor=request.user)
        except ReviewTailoringError as exc:
            return tailoring_error_response(exc)
        return self._detail_response(self.get_queryset().filter(pk=pk).first())

    @allow_fine_permission(*TAILORING_READ_KEYS)
    def act(self, request, slug, project_id, pk):
        """签批表态。

        只要 view 权限 —— 能不能签批由「是不是本轮签批人」判定（utils 里查），
        给它单配一个 manage 会让签批人必须同时拥有改表的权限，那不合理。
        """
        serializer = ReviewTailoringActSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                tailoring = self._locked(pk)
                if tailoring is None:
                    return self._not_found()
                act_on_tailoring(
                    tailoring=tailoring,
                    approver=request.user,
                    action=serializer.validated_data["action"],
                    comment=serializer.validated_data.get("comment", ""),
                )
        except ReviewTailoringError as exc:
            return tailoring_error_response(exc)
        return self._detail_response(self.get_queryset().filter(pk=pk).first())

    @allow_fine_permission(TAILORING_MANAGE_KEY)
    def revise(self, request, slug, project_id, pk):
        try:
            with transaction.atomic():
                tailoring = self._locked(pk)
                if tailoring is None:
                    return self._not_found()
                start_revision(tailoring=tailoring, actor=request.user)
        except ReviewTailoringError as exc:
            return tailoring_error_response(exc)
        return self._detail_response(self.get_queryset().filter(pk=pk).first())

    @allow_fine_permission(TAILORING_MANAGE_KEY)
    def cancel_revision(self, request, slug, project_id, pk):
        try:
            with transaction.atomic():
                tailoring = self._locked(pk)
                if tailoring is None:
                    return self._not_found()
                cancel_revision(tailoring=tailoring, actor=request.user)
        except ReviewTailoringError as exc:
            return tailoring_error_response(exc)
        return self._detail_response(self.get_queryset().filter(pk=pk).first())


class ReviewTailoringCommentViewSet(BaseViewSet):
    """裁剪表下的评论。发布后不可编辑，只允许作者本人删 —— 口径同发布单评论。"""

    model = ReviewTailoringComment
    serializer_class = ReviewTailoringCommentSerializer

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .filter(project_id=self.kwargs.get("project_id"))
            .filter(tailoring_id=self.kwargs.get("tailoring_id"))
            .filter(
                project__project_projectmember__member=self.request.user,
                project__project_projectmember__is_active=True,
                project__archived_at__isnull=True,
            )
            .select_related("project", "workspace", "tailoring", "actor")
            .order_by("created_at")
            .distinct()
        )

    @allow_fine_permission(*TAILORING_READ_KEYS)
    def list(self, request, slug, project_id, tailoring_id):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_fine_permission(*TAILORING_READ_KEYS)
    def create(self, request, slug, project_id, tailoring_id):
        tailoring = ReviewTailoring.objects.filter(
            id=tailoring_id, project_id=project_id, workspace__slug=slug
        ).first()
        if tailoring is None:
            return Response(
                {"error": "Review tailoring not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            comment = serializer.save(
                workspace_id=tailoring.workspace_id,
                project_id=project_id,
                tailoring=tailoring,
                actor=request.user,
            )
            # 评论也进变更历史：一条时间线读得完「谁改了什么、谁说了什么」
            ReviewTailoringActivity.objects.create(
                workspace_id=tailoring.workspace_id,
                project_id=tailoring.project_id,
                tailoring=tailoring,
                actor=request.user,
                created_by=request.user,
                updated_by=request.user,
                verb="created",
                field="comment",
                tailoring_comment=comment,
                comment=comment.comment_stripped[:255],
            )
        return Response(
            self.get_serializer(comment).data, status=status.HTTP_201_CREATED
        )

    @allow_fine_permission(*TAILORING_READ_KEYS)
    def destroy(self, request, slug, project_id, tailoring_id, pk):
        comment = ReviewTailoringComment.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            tailoring_id=tailoring_id,
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


class ReviewTailoringActivityEndpoint(BaseAPIView):
    """变更历史。按时间升序全量返回 —— 一张表的活动量级是几十到几百条。"""

    @allow_fine_permission(*TAILORING_READ_KEYS)
    def get(self, request, slug, project_id, tailoring_id):
        activities = (
            ReviewTailoringActivity.objects.filter(
                workspace__slug=slug,
                project_id=project_id,
                tailoring_id=tailoring_id,
            )
            .select_related("actor")
            .order_by("created_at")
        )
        serializer = ReviewTailoringActivitySerializer(activities, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
