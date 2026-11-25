# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# 工作项详情「产品」区块：关联产品的列表 / 追加 / 整组设置 / 改模块 / 解除关联。
# 规则（缺陷至少一个、非缺陷至多一个、产品池、模块归属）全部在 utils/issue_product.py。

# Third Party imports
from rest_framework import serializers, status
from rest_framework.response import Response

# Module imports
from .. import BaseAPIView
from plane.app.permissions import ProjectEntityPermission, has_project_issue_permission
from plane.db.models import Issue, IssueAssignee
from plane.utils.issue_product import (
    add_issue_products,
    issue_products_payload,
    remove_issue_product,
    set_issue_product_module,
    set_issue_products,
)
from plane.utils.visibility import visible_projects_q


def _get_issue(request, slug, project_id, issue_id):
    return (
        Issue.issue_objects.filter(
            workspace__slug=slug, project_id=project_id, pk=issue_id, project__archived_at__isnull=True
        )
        .filter(visible_projects_q(request.user, slug, "project"))
        .first()
    )


def _forbidden_unless_can_edit(request, slug, project_id, issue):
    """与工作项 PATCH 同一道门：按类型选 project.issue / project.defect 并看类型限定，负责人改自己的放行。"""
    assignee_ids = list(
        IssueAssignee.objects.filter(issue_id=issue.id, deleted_at__isnull=True).values_list("assignee_id", flat=True)
    )
    if has_project_issue_permission(
        user=request.user,
        workspace_slug=slug,
        project_id=str(project_id),
        action="edit",
        issue_type_id=str(issue.type_id) if issue.type_id else None,
        issue_assignee_ids=assignee_ids,
    ):
        return None
    return Response({"error": "您没有所需的项目权限。"}, status=status.HTTP_403_FORBIDDEN)


def _payload(issue):
    products = issue_products_payload([issue.id]).get(str(issue.id), [])
    return {
        "product_id": str(issue.product_id) if issue.product_id else None,
        "product_module_id": str(issue.product_module_id) if issue.product_module_id else None,
        "product_ids": [item["product_id"] for item in products],
        "products": products,
    }


def _error(exc):
    return Response(exc.detail, status=status.HTTP_400_BAD_REQUEST)


class IssueProductEndpoint(BaseAPIView):
    permission_classes = [ProjectEntityPermission]

    def get(self, request, slug, project_id, issue_id):
        issue = _get_issue(request, slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(_payload(issue), status=status.HTTP_200_OK)

    def post(self, request, slug, project_id, issue_id):
        """追加：`{"product_ids": [...]}`。"""
        issue = _get_issue(request, slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        if (denied := _forbidden_unless_can_edit(request, slug, project_id, issue)) is not None:
            return denied
        product_ids = request.data.get("product_ids") or []
        if not isinstance(product_ids, list):
            return Response({"products": ["INVALID"]}, status=status.HTTP_400_BAD_REQUEST)
        try:
            add_issue_products(issue, product_ids, actor_id=request.user.id)
        except serializers.ValidationError as exc:
            return _error(exc)
        return Response(_payload(issue), status=status.HTTP_200_OK)

    def put(self, request, slug, project_id, issue_id):
        """整组设置：`{"products": [{product_id, product_module_id}]}`（列表多选下拉用）。"""
        issue = _get_issue(request, slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        if (denied := _forbidden_unless_can_edit(request, slug, project_id, issue)) is not None:
            return denied
        try:
            set_issue_products(issue, request.data.get("products") or [], actor_id=request.user.id)
        except serializers.ValidationError as exc:
            return _error(exc)
        return Response(_payload(issue), status=status.HTTP_200_OK)


class IssueProductDetailEndpoint(BaseAPIView):
    permission_classes = [ProjectEntityPermission]

    def patch(self, request, slug, project_id, issue_id, product_id):
        """改这一行的产品模块：`{"product_module_id": ...|null}`。"""
        issue = _get_issue(request, slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        if (denied := _forbidden_unless_can_edit(request, slug, project_id, issue)) is not None:
            return denied
        try:
            set_issue_product_module(
                issue, product_id, request.data.get("product_module_id"), actor_id=request.user.id
            )
        except serializers.ValidationError as exc:
            return _error(exc)
        return Response(_payload(issue), status=status.HTTP_200_OK)

    def delete(self, request, slug, project_id, issue_id, product_id):
        issue = _get_issue(request, slug, project_id, issue_id)
        if issue is None:
            return Response({"error": "Issue not found"}, status=status.HTTP_404_NOT_FOUND)
        if (denied := _forbidden_unless_can_edit(request, slug, project_id, issue)) is not None:
            return denied
        try:
            remove_issue_product(issue, product_id, actor_id=request.user.id)
        except serializers.ValidationError as exc:
            return _error(exc)
        return Response(_payload(issue), status=status.HTTP_200_OK)
