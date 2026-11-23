# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.app.views.product import (
    ProductMyPermissionKeysAPIView,
    ProductOverviewEndpoint,
    ProductSetProductsEndpoint,
    ProductSetViewSet,
    ProductViewSet,
    ProductWorkItemsEndpoint,
)
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
    # --- 产品概览（需求 / 测试 / 阶段评审汇总，只读） ------------------------
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/overview/",
        ProductOverviewEndpoint.as_view(),
        name="product-overview",
    ),
    # --- 产品 › 工作项（Issue.product 指向本产品的工作项，跨项目只读） ----------
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/work-items/",
        ProductWorkItemsEndpoint.as_view(),
        name="product-work-items",
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
    # --- 产品集（is_set=True 的产品；详情页签沿用上面的 products/<id>/… 路由） ----
    path(
        "workspaces/<str:slug>/product-sets/",
        ProductSetViewSet.as_view({"get": "list", "post": "create"}),
        name="product-sets",
    ),
    path(
        "workspaces/<str:slug>/product-sets/<uuid:pk>/",
        ProductSetViewSet.as_view(
            {
                "get": "retrieve",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="product-set",
    ),
    path(
        "workspaces/<str:slug>/product-sets/<uuid:product_id>/products/",
        ProductSetProductsEndpoint.as_view(),
        name="product-set-products",
    ),
    path(
        "workspaces/<str:slug>/product-sets/<uuid:product_id>/products/<uuid:member_id>/",
        ProductSetProductsEndpoint.as_view(),
        name="product-set-product",
    ),
]
