# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views.product import ProductMyPermissionKeysAPIView, ProductViewSet
from plane.app.views.project.product import ProductProjectViewSet, ProjectProductViewSet
from plane.app.views.project.product_team import ProductTeamAPIView, ProjectProductTeamAPIView
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
    # --- 产品 ↔ 项目 ------------------------------------------------------
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/projects/",
        ProductProjectViewSet.as_view({"get": "list", "post": "create"}),
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
    # --- 研发矩阵（项目 × 产品 × 角色 → 成员） ------------------------------
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/product-team/",
        ProjectProductTeamAPIView.as_view(),
        name="project-product-team",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/team/",
        ProductTeamAPIView.as_view(),
        name="product-team",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/my-permission-keys/",
        ProductMyPermissionKeysAPIView.as_view(),
        name="product-my-permission-keys",
    ),
]
