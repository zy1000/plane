from django.urls import path

from plane.app.views.product_category import (
    ProductCategoryDetailEndpoint,
    ProductCategoryEndpoint,
    ProductCategoryModuleBulkEndpoint,
    ProductCategoryModuleDetailEndpoint,
    ProductCategoryModuleEndpoint,
    ProductCategoryModuleReorderEndpoint,
    ProductCategoryReorderEndpoint,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/product-categories/",
        ProductCategoryEndpoint.as_view(),
        name="product-categories",
    ),
    # 静态段排在 <uuid> 之前
    path(
        "workspaces/<str:slug>/product-categories/reorder/",
        ProductCategoryReorderEndpoint.as_view(),
        name="product-categories-reorder",
    ),
    path(
        "workspaces/<str:slug>/product-categories/<uuid:category_id>/",
        ProductCategoryDetailEndpoint.as_view(),
        name="product-category-detail",
    ),
    path(
        "workspaces/<str:slug>/product-categories/<uuid:category_id>/modules/",
        ProductCategoryModuleEndpoint.as_view(),
        name="product-category-modules",
    ),
    path(
        "workspaces/<str:slug>/product-categories/<uuid:category_id>/modules/bulk/",
        ProductCategoryModuleBulkEndpoint.as_view(),
        name="product-category-modules-bulk",
    ),
    path(
        "workspaces/<str:slug>/product-categories/<uuid:category_id>/modules/reorder/",
        ProductCategoryModuleReorderEndpoint.as_view(),
        name="product-category-modules-reorder",
    ),
    path(
        "workspaces/<str:slug>/product-categories/<uuid:category_id>/modules/<uuid:module_id>/",
        ProductCategoryModuleDetailEndpoint.as_view(),
        name="product-category-module-detail",
    ),
]
