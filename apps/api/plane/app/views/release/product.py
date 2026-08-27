# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""产品侧的发布聚合视图。

发布单是项目级资源，产品与项目之间又只有 ProductProject 这一座桥，所以「产品的
发布」没有自己的表——这里按桥表圈出关联项目，聚合它们的发布单，并给每行标注
本产品有多少需求被圈进去。只读：建单、改单仍走项目侧。
"""

from django.db.models import (
    CharField,
    Count,
    Exists,
    IntegerField,
    OuterRef,
    Q,
    Subquery,
    Value,
)
from django.db.models.functions import Coalesce
from rest_framework import status
from rest_framework.response import Response

from plane.app.serializers import ProductReleaseSerializer
from plane.app.views.base import BaseViewSet
from plane.app.views.requirement.mixins import get_scoped_product
from plane.db.models import (
    Issue,
    ProductProject,
    ProjectNetwork,
    Release,
    ReleaseOverduePhase,
    ReleaseOverdueRecord,
    RequirementRelease,
)


def _release_issue_count_subquery(state_group=None):
    """项目侧列表同口径：按 issue_release 计工作项，清掉 Issue.Meta.ordering。"""
    filters = {
        "issue_release__release_id": OuterRef("pk"),
        "issue_release__deleted_at__isnull": True,
    }
    if state_group is not None:
        filters["state__group"] = state_group
    return (
        Issue.issue_objects.filter(**filters)
        .order_by()
        .values("issue_release__release_id")
        .annotate(cnt=Count("pk"))
        .values("cnt")
    )


def _annotate_release_progress_and_overdue(queryset):
    """进度环 + 逾期标签所需注解，字段名与项目侧 ReleaseViewSet 对齐。"""
    active_overdue_phase_subquery = (
        ReleaseOverdueRecord.objects.filter(
            release_id=OuterRef("pk"),
            ended_at__isnull=True,
            deleted_at__isnull=True,
        )
        .order_by("-started_at")
        .values("phase")[:1]
    )
    zero = Value(0, output_field=IntegerField())
    return queryset.annotate(
        total_issues=Coalesce(Subquery(_release_issue_count_subquery()[:1]), zero),
        completed_issues=Coalesce(
            Subquery(_release_issue_count_subquery("completed")[:1]), zero
        ),
        cancelled_issues=Coalesce(
            Subquery(_release_issue_count_subquery("cancelled")[:1]), zero
        ),
        has_active_overdue=Exists(
            ReleaseOverdueRecord.objects.filter(
                release_id=OuterRef("pk"),
                ended_at__isnull=True,
                deleted_at__isnull=True,
            )
        ),
        has_overdue_history=Exists(
            ReleaseOverdueRecord.objects.filter(
                release_id=OuterRef("pk"),
                deleted_at__isnull=True,
            )
        ),
        has_active_dev_overdue=Exists(
            ReleaseOverdueRecord.objects.filter(
                release_id=OuterRef("pk"),
                phase=ReleaseOverduePhase.DEV,
                ended_at__isnull=True,
                deleted_at__isnull=True,
            )
        ),
        has_active_test_overdue=Exists(
            ReleaseOverdueRecord.objects.filter(
                release_id=OuterRef("pk"),
                phase=ReleaseOverduePhase.TEST,
                ended_at__isnull=True,
                deleted_at__isnull=True,
            )
        ),
        has_dev_overdue_history=Exists(
            ReleaseOverdueRecord.objects.filter(
                release_id=OuterRef("pk"),
                phase=ReleaseOverduePhase.DEV,
                deleted_at__isnull=True,
            )
        ),
        has_test_overdue_history=Exists(
            ReleaseOverdueRecord.objects.filter(
                release_id=OuterRef("pk"),
                phase=ReleaseOverduePhase.TEST,
                deleted_at__isnull=True,
            )
        ),
        active_overdue_phase=Coalesce(
            Subquery(active_overdue_phase_subquery, output_field=CharField()),
            Value(None, output_field=CharField()),
        ),
    )


class ProductReleaseViewSet(BaseViewSet):
    """产品侧：关联项目下的发布单聚合列表。填上产品导航里的 releases 占位 tab。

    走产品自己的可见性判定（can_view_product），不是项目权限 —— 打开的是产品页。
    """

    model = Release
    serializer_class = ProductReleaseSerializer

    def list(self, request, slug, product_id):
        product = get_scoped_product(request.user, slug=slug, product_id=product_id)
        if product is None:
            return Response(
                {"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # 产品可见 ≠ 它关联的项目也可见。私密项目（network=0）只对自己的成员露面，
        # 照 ProductProjectViewSet 的同一条判定收窄，否则任何能看见这个产品的工作
        # 区成员都能从发布单读到私密项目的名称与标识。
        # 先解出项目 id 集合再查发布单：member join 会放大行数，把 distinct 留在
        # 这一段，第二段的行天然唯一，注解才能安全共存。
        project_ids = list(
            ProductProject.objects.filter(
                workspace__slug=slug,
                product_id=product.id,
                # 归档项目排除口径与 projects tab 一致，两边不一致会出现
                # 「项目列表看不到、发布列表却在列」的矛盾态
                project__archived_at__isnull=True,
            )
            .filter(
                Q(
                    project__project_projectmember__member=request.user,
                    project__project_projectmember__is_active=True,
                )
                | Q(project__network=ProjectNetwork.PUBLIC.value)
            )
            .values_list("project_id", flat=True)
            .distinct()
        )

        requirement_count = (
            RequirementRelease.objects.filter(
                release_id=OuterRef("pk"),
                deleted_at__isnull=True,
                # FK 正向遍历不套软删 manager，必须显式排掉已删需求
                requirement__deleted_at__isnull=True,
                requirement__product_id=product.id,
            )
            # 清掉 Meta.ordering，否则 created_at 会被拖进子查询的 GROUP BY
            .order_by()
            .values("release_id")
            .annotate(cnt=Count("pk"))
            .values("cnt")
        )
        releases = (
            Release.objects.filter(
                workspace__slug=slug,
                project_id__in=project_ids,
                # 归档发布走项目侧的独立端点，口径对齐项目侧列表
                archived_at__isnull=True,
            )
            # cover_image_url / avatar_url 属性会各自触碰资产外键，不带上就是
            # 随行数增长的 N+1
            .select_related(
                "project", "project__cover_image_asset", "lead", "lead__avatar_asset"
            )
            .annotate(
                product_requirement_count=Coalesce(
                    Subquery(requirement_count[:1]),
                    Value(0),
                    output_field=IntegerField(),
                )
            )
            .order_by("-created_at")
        )
        releases = _annotate_release_progress_and_overdue(releases)
        return Response(
            {
                # 可见关联项目数：为 0 时前端展示「未关联项目」空态而非「无发布单」。
                # 用收窄后的数，避免「显示有项目却一张发布单都看不到」的矛盾态。
                "linked_project_count": len(project_ids),
                "releases": ProductReleaseSerializer(releases, many=True).data,
            },
            status=status.HTTP_200_OK,
        )
