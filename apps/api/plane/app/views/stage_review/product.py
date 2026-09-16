"""产品侧的阶段评审聚合视图。

阶段评审是项目级资源（绑定 项目 + 产品），产品与项目之间只有 ProductProject 这一座桥，
所以「产品的阶段评审」没有自己的表 —— 这里按桥表圈出关联项目，再收窄到**当前用户在
那个项目里能看阶段评审**的项目，把它们的评审一次取回。

只读。推进 / 退回 / 改负责人 / 评论 / 附件仍走项目级端点（抽屉带着每条评审自己的
project_id 去打），由 project.stage_review.manage 判定，这里不另开写入口。
"""

from django.db.models import Count, Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey
from plane.app.permissions.base import _get_user_project_permission_keys
from plane.app.serializers.stage_review import StageReviewListSerializer
from plane.app.views.base import BaseViewSet
from plane.app.views.requirement.mixins import get_scoped_product
from plane.db.models import Project, ProductProject, StageReview, StageReviewStatus

from .review import _attachment_count_annotation, _tailoring_annotations

#: 与项目侧 STAGE_REVIEW_READ_KEYS 同一口径：查看或维护任一即可
READ_KEYS = {
    PermissionKey.PROJECT_STAGE_REVIEW_VIEW.value,
    PermissionKey.PROJECT_STAGE_REVIEW_MANAGE.value,
}


def _readable_project_ids(user, slug, product):
    """关联了这个产品、且当前用户能看阶段评审的项目。

    成员资格口径同项目侧列表（活跃成员 + 未归档）：公开项目的非成员在项目页本来就看不到
    阶段评审，产品页不能反而给他开一扇窗。再按项目算权限 key —— 产品关联的项目是个位数
    量级，逐项目一次查询可以接受（先例见 utils/requirement_test_case.py）。
    """
    candidate_ids = list(
        ProductProject.objects.filter(
            workspace__slug=slug,
            product_id=product.id,
            project__archived_at__isnull=True,
            project__project_projectmember__member=user,
            project__project_projectmember__is_active=True,
        )
        .values_list("project_id", flat=True)
        .distinct()
    )
    projects = Project.objects.filter(pk__in=candidate_ids).select_related(
        "project_lead", "created_by"
    )
    return [
        project.id
        for project in projects
        if READ_KEYS & _get_user_project_permission_keys(
            user, slug, str(project.id), project=project
        )
    ]


class ProductStageReviewViewSet(BaseViewSet):
    """产品详情页「阶段评审」tab 的数据源。

    产品可见性走 get_scoped_product（看不见的产品一律 404），项目可见性走上面的收窄 ——
    没权限的项目连组都不出现。
    """

    model = StageReview
    serializer_class = StageReviewListSerializer

    def _scope(self, request, slug, product_id):
        product = get_scoped_product(request.user, slug=slug, product_id=product_id)
        if product is None:
            return None, []
        return product, _readable_project_ids(request.user, slug, product)

    def _base_queryset(self, slug, product, project_ids):
        return StageReview.objects.filter(
            workspace__slug=slug,
            product_id=product.id,
            project_id__in=project_ids,
        )

    @staticmethod
    def _not_found():
        return Response(
            {"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND
        )

    def list(self, request, slug, product_id):
        """关联项目里这个产品的全部评审，扁平返回；分组与筛选在前端做，口径同项目侧。"""
        product, project_ids = self._scope(request, slug, product_id)
        if product is None:
            return self._not_found()

        reviews = (
            self._base_queryset(slug, product, project_ids)
            .select_related(
                "product", "stage", "stage__dictionary", "leader", "auditor", "project"
            )
            .annotate(
                attachment_count=_attachment_count_annotation(),
                comment_count=Count(
                    "comments",
                    filter=Q(comments__deleted_at__isnull=True),
                    distinct=True,
                ),
                **_tailoring_annotations(),
            )
            .order_by("project__name", "sort_order", "created_at", "id")
        )
        return Response(
            {
                # 可见关联项目数：为 0 时前端给「还没有关联项目」空态，
                # 而不是「关联了但还没生成评审」
                "linked_project_count": len(project_ids),
                # 只有一个项目时，空态的「去评审裁剪」直达那个项目的裁剪页
                "linked_project_ids": [str(project_id) for project_id in project_ids],
                "reviews": StageReviewListSerializer(reviews, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    def stages(self, request, slug, product_id):
        """左栏的阶段列表：只列有评审的阶段，四个状态计数 + 涉及的项目数。

        从不带 annotate 的 queryset 出发，理由同项目侧 ``_scoped_queryset``。
        """
        product, project_ids = self._scope(request, slug, product_id)
        if product is None:
            return self._not_found()

        def by_status(value):
            return Count("id", filter=Q(status=value), distinct=True)

        rows = (
            self._base_queryset(slug, product, project_ids)
            .values("stage_id", "stage__label", "stage__sort_order")
            .annotate(
                total=Count("id", distinct=True),
                project_count=Count("project_id", distinct=True),
                not_started=by_status(StageReviewStatus.NOT_STARTED),
                in_review=by_status(StageReviewStatus.IN_REVIEW),
                in_approval=by_status(StageReviewStatus.IN_APPROVAL),
                completed=by_status(StageReviewStatus.COMPLETED),
            )
            .order_by("stage__sort_order", "stage__label")
        )
        return Response(
            [
                {
                    "stage_id": str(row["stage_id"]),
                    "label": row["stage__label"],
                    "total": row["total"],
                    "project_count": row["project_count"],
                    "not_started": row["not_started"],
                    "in_review": row["in_review"],
                    "in_approval": row["in_approval"],
                    "completed": row["completed"],
                }
                for row in rows
            ],
            status=status.HTTP_200_OK,
        )
