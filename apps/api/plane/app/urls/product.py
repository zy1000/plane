# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views.product import (
    ProductMemberViewSet,
    ProductRoleViewSet,
    ProductViewSet,
)
from plane.app.views.project.product import ProductProjectViewSet, ProjectProductViewSet
from plane.app.views.release.product import ProductReleaseViewSet

urlpatterns = [
    path(
        "workspaces/<str:slug>/products/",
        ProductViewSet.as_view({"get": "list", "post": "create"}),
        name="products",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:pk>/",
        ProductViewSet.as_view(
            {
                "get": "retrieve",
                "put": "update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="product-detail",
    ),
    path(
        "workspaces/<str:slug>/products/member/invite/",
        ProductMemberViewSet.as_view({"post": "invite"}),
        name="product-member-invite",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/members/",
        ProductMemberViewSet.as_view({"get": "list", "post": "invite"}),
        name="product-members",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/members/<int:pk>/",
        ProductMemberViewSet.as_view({"get": "retrieve", "delete": "destroy"}),
        name="product-member-detail",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/members/<int:pk>/custom-roles/",
        ProductMemberViewSet.as_view(
            {"put": "assign_roles", "patch": "assign_roles"}
        ),
        name="product-member-custom-roles",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/roles/",
        ProductRoleViewSet.as_view({"get": "list", "post": "create"}),
        name="product-roles",
    ),
    # --- 产品 ↔ 项目 ------------------------------------------------------
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/projects/",
        ProductProjectViewSet.as_view({"get": "list"}),
        name="product-projects",
    ),
    # --- 产品 ↔ 发布（关联项目下的发布单聚合，只读） ----------------------
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/releases/",
        ProductReleaseViewSet.as_view({"get": "list"}),
        name="product-releases",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/products/",
        ProjectProductViewSet.as_view({"get": "list", "post": "create"}),
        name="project-products",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/roles/<int:pk>/",
        ProductRoleViewSet.as_view(
            {
                "get": "retrieve",
                "put": "update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="product-role-detail",
    ),
]
