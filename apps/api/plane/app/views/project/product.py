# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""项目 ↔ 产品关联。

这层关系本身没有业务语义，它只回答一件事：**这个项目能引用哪些产品的需求**。
候选池的第一道过滤就是它，见 utils/requirement_project.linkable_requirements_queryset。
"""

from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission
from plane.app.serializers.product_project import ProductProjectSerializer
from plane.app.views.base import BaseViewSet
from plane.app.views.requirement.mixins import get_scoped_product
from plane.db.models import ProductProject, Project, ProjectNetwork
from plane.utils.product import can_manage_product
from plane.utils.requirement_project import (
    RequirementLinkError,
    resolve_linkable_products,
    resolve_linkable_projects,
    status_counts_by_project,
    unlink_product_from_project,
)


def _link_error_response(exc: RequirementLinkError):
    payload = {"error": exc.message}
    if exc.code:
        payload["code"] = exc.code
    payload.update(exc.detail)
    return Response(payload, status=status.HTTP_409_CONFLICT)


class ProjectProductViewSet(BaseViewSet):
    """项目侧：本项目关联了哪些产品。"""

    model = ProductProject
    serializer_class = ProductProjectSerializer

    def get_queryset(self):
        return (
            ProductProject.objects.filter(
                workspace__slug=self.kwargs.get("slug"),
                project_id=self.kwargs.get("project_id"),
            )
            .select_related("product", "project")
            .order_by("product__identifier")
        )

    @allow_fine_permission(
        PermissionKey.PROJECT_REQUIREMENT_LINK_VIEW,
        PermissionKey.PROJECT_PRODUCT_LINK_MANAGE,
    )
    def list(self, request, slug, project_id):
        return Response(
            ProductProjectSerializer(self.get_queryset(), many=True).data,
            status=status.HTTP_200_OK,
        )

    @allow_fine_permission(PermissionKey.PROJECT_PRODUCT_LINK_MANAGE)
    def create(self, request, slug, project_id):
        """一次调用同时增删，照 views/module/issue.py::create_issue_modules 的范式。"""
        products = request.data.get("products", [])
        removed_products = request.data.get("removed_products", [])

        project = Project.objects.get(pk=project_id, workspace__slug=slug)

        if products:
            try:
                product_ids = resolve_linkable_products(
                    user=request.user, slug=slug, project=project, product_ids=products
                )
            except RequirementLinkError as exc:
                return _link_error_response(exc)

            ProductProject.objects.bulk_create(
                [
                    ProductProject(
                        product_id=product_id,
                        project_id=project_id,
                        # bulk_create 不走 ProjectBaseModel.save()，workspace 不会
                        # 被自动派生 —— 不显式传这里就是 NOT NULL 报错
                        workspace_id=project.workspace_id,
                        created_by_id=request.user.id,
                        updated_by_id=request.user.id,
                    )
                    for product_id in product_ids
                ],
                batch_size=100,
                # 配合 product_project_unique_when_deleted_at_null 做幂等：
                # 重复关联是无操作，不是错误
                ignore_conflicts=True,
            )

        for product_id in removed_products:
            # 解除产品关联会让这个产品下已关联的需求失去引用依据（候选池按产品过滤）。
            # 与其留下一批规则外的孤儿关联，不如让人先把需求解掉 —— 那一步是显式的，
            # 而级联软删会把项目内的迭代/发布/工作项关联一起带走且没有提示。
            try:
                unlink_product_from_project(
                    slug=slug, project_id=project_id, product_id=product_id
                )
            except RequirementLinkError as exc:
                return _link_error_response(exc)

        return Response({"message": "success"}, status=status.HTTP_201_CREATED)


class ProductProjectViewSet(BaseViewSet):
    """产品侧：这个产品被哪些项目引用。

    读走产品可见性（can_view_product）；写（增删关联）走 can_manage_product。
    打开的是产品页，不套项目权限。
    """

    model = ProductProject
    serializer_class = ProductProjectSerializer

    def list(self, request, slug, product_id):
        product = get_scoped_product(request.user, slug=slug, product_id=product_id)
        if product is None:
            return Response(
                {"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND
            )

        # 产品可见 ≠ 它关联的项目也可见。私密项目（network=0）只对自己的成员露面，
        # 照 views/project/base.py::list_detail 的同一条判定收窄，否则任何能看见这个
        # 产品的工作区成员都能从这里读到私密项目的名称与标识。
        queryset = (
            ProductProject.objects.filter(
                workspace__slug=slug,
                product_id=product.id,
                # 归档项目不能再收需求。annotate_project_ids 也把它们排除在
                # project_ids 之外，两边不一致会让「所属项目」多选出现一个选得中却
                # 永远显示未选中的选项。
                project__archived_at__isnull=True,
            )
            .filter(
                Q(
                    project__project_projectmember__member=request.user,
                    project__project_projectmember__is_active=True,
                )
                | Q(project__network=ProjectNetwork.PUBLIC.value)
            )
            .select_related("product", "project")
            .distinct()
            .order_by("project__name")
        )
        rows = list(queryset)
        # 一次分组查询覆盖所有项目，序列化器按 project_id 取用；每行查一次会让这张
        # 表的查询数随项目数线性增长
        status_counts = status_counts_by_project(
            product_id=product.id, project_ids=[row.project_id for row in rows]
        )
        return Response(
            ProductProjectSerializer(
                rows, many=True, context={"status_counts": status_counts}
            ).data,
            status=status.HTTP_200_OK,
        )

    def create(self, request, slug, product_id):
        """一次调用同时增删，载荷与项目侧对称：{projects, removed_projects}。"""
        product = get_scoped_product(request.user, slug=slug, product_id=product_id)
        if product is None:
            return Response(
                {"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND
            )
        if not can_manage_product(request.user, product):
            return Response(
                {"error": "You do not have permission to update this product."},
                status=status.HTTP_403_FORBIDDEN,
            )

        projects = request.data.get("projects", [])
        removed_projects = request.data.get("removed_projects", [])

        if projects:
            try:
                project_ids = resolve_linkable_projects(
                    user=request.user,
                    slug=slug,
                    product=product,
                    project_ids=projects,
                )
            except RequirementLinkError as exc:
                return _link_error_response(exc)

            ProductProject.objects.bulk_create(
                [
                    ProductProject(
                        product_id=product.id,
                        project_id=project_id,
                        workspace_id=product.workspace_id,
                        created_by_id=request.user.id,
                        updated_by_id=request.user.id,
                    )
                    for project_id in project_ids
                ],
                batch_size=100,
                ignore_conflicts=True,
            )

        for project_id in removed_projects:
            try:
                unlink_product_from_project(
                    slug=slug, project_id=project_id, product_id=product.id
                )
            except RequirementLinkError as exc:
                return _link_error_response(exc)

        return Response({"message": "success"}, status=status.HTTP_201_CREATED)
