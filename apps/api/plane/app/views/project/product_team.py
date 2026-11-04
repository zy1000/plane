# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""研发矩阵：项目设置「研发产品」页（可编辑）与产品「研发团队」页（只读）。规则在 utils/product_team.py。"""

from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import PermissionKey, allow_fine_permission, allow_project_member, allow_workspace_member
from plane.app.views.base import BaseAPIView
from plane.db.models import Product, Project
from plane.utils.product import can_view_product
from plane.utils.product_team import ProductTeamError, product_team, project_matrix, replace_matrix_cell


class ProjectProductTeamAPIView(BaseAPIView):
    def _project(self, slug, project_id):
        return Project.objects.filter(pk=project_id, workspace__slug=slug).first()

    @allow_project_member
    def get(self, request, slug, project_id):
        project = self._project(slug, project_id)
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(project_matrix(project), status=status.HTTP_200_OK)

    @allow_fine_permission(PermissionKey.PROJECT_PRODUCT_MANAGE)
    def put(self, request, slug, project_id):
        """整格替换：``{product_id, job_role_id, member_ids}``。"""
        project = self._project(slug, project_id)
        if project is None:
            return Response({"error": "Project not found."}, status=status.HTTP_404_NOT_FOUND)
        product_id = request.data.get("product_id")
        job_role_id = request.data.get("job_role_id")
        if not product_id or not job_role_id:
            return Response({"error": "product_id 与 job_role_id 必填。"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            cell = replace_matrix_cell(project, product_id, job_role_id, request.data.get("member_ids") or [])
        except ProductTeamError as exc:
            return Response({"error": exc.message}, status=exc.status_code)
        return Response(cell, status=status.HTTP_200_OK)


class ProductTeamAPIView(BaseAPIView):
    @allow_workspace_member
    def get(self, request, slug, product_id):
        product = Product.objects.filter(pk=product_id, workspace__slug=slug).select_related("workspace").first()
        if product is None:
            return Response({"error": "Product not found."}, status=status.HTTP_404_NOT_FOUND)
        if not can_view_product(request.user, product):
            return Response({"error": "您没有查看该产品的权限。"}, status=status.HTTP_403_FORBIDDEN)
        return Response(product_team(product), status=status.HTTP_200_OK)
