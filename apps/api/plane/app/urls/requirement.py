from django.urls import path

from plane.app.views.requirement import (
    RequirementBaselineConfigurationAPIView,
    RequirementChangeItemViewSet,
    RequirementChangeRequestViewSet,
    RequirementLibraryConfigurationAPIView,
    RequirementLibraryItemViewSet,
    RequirementLibraryViewSet,
    RequirementTypeConfigurationAPIView,
    RequirementTypeViewSet,
    RequirementVersionViewSet,
    RequirementViewSet,
    RequirementWorkingCopyAPIView,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/requirement-types/",
        RequirementTypeViewSet.as_view({"get": "list", "post": "create"}),
        name="requirement-types",
    ),
    path(
        "workspaces/<str:slug>/requirement-types/<uuid:pk>/",
        RequirementTypeViewSet.as_view(
            {
                "get": "retrieve",
                "put": "update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="requirement-type-detail",
    ),
    path(
        "workspaces/<str:slug>/requirement-types/<uuid:pk>/configuration/",
        RequirementTypeConfigurationAPIView.as_view(),
        name="requirement-type-configuration",
    ),
    path(
        "workspaces/<str:slug>/requirement-libraries/",
        RequirementLibraryViewSet.as_view({"get": "list", "post": "create"}),
        name="requirement-libraries",
    ),
    path(
        "workspaces/<str:slug>/requirement-libraries/<uuid:pk>/",
        RequirementLibraryViewSet.as_view(
            {
                "get": "retrieve",
                "put": "update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="requirement-library-detail",
    ),
    path(
        "workspaces/<str:slug>/requirement-libraries/<uuid:library_id>/configuration/",
        RequirementLibraryConfigurationAPIView.as_view(),
        name="requirement-library-configuration",
    ),
    path(
        "workspaces/<str:slug>/requirement-libraries/<uuid:library_id>/items/",
        RequirementLibraryItemViewSet.as_view({"get": "list", "post": "create"}),
        name="requirement-library-items",
    ),
    path(
        "workspaces/<str:slug>/requirement-libraries/<uuid:library_id>/items/bulk-delete/",
        RequirementLibraryItemViewSet.as_view({"post": "bulk_destroy"}),
        name="requirement-library-item-bulk-delete",
    ),
    path(
        "workspaces/<str:slug>/requirement-libraries/<uuid:library_id>/items/bulk-save/",
        RequirementLibraryItemViewSet.as_view({"post": "bulk_save"}),
        name="requirement-library-item-bulk-save",
    ),
    path(
        "workspaces/<str:slug>/requirement-libraries/<uuid:library_id>/items/<uuid:pk>/",
        RequirementLibraryItemViewSet.as_view(
            {"patch": "partial_update", "delete": "destroy"}
        ),
        name="requirement-library-item",
    ),
    # --- 产品需求：条目本身 ---------------------------------------------
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/",
        RequirementViewSet.as_view({"get": "list", "post": "create"}),
        name="product-requirements",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/bulk-delete/",
        RequirementViewSet.as_view({"post": "bulk_destroy"}),
        name="product-requirement-bulk-delete",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/bulk-save/",
        RequirementViewSet.as_view({"post": "bulk_save"}),
        name="product-requirement-bulk-save",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/import/",
        RequirementViewSet.as_view({"post": "import_from_library"}),
        name="product-requirement-import",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/<uuid:pk>/",
        RequirementViewSet.as_view(
            {"patch": "partial_update", "delete": "destroy"}
        ),
        name="product-requirement-item",
    ),
    # --- 产品需求：基线（审批配置 / 工作副本 / 变更单 / 版本）-------------
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-baseline/",
        RequirementBaselineConfigurationAPIView.as_view(),
        name="requirement-baseline",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-baseline/working-copy/",
        RequirementWorkingCopyAPIView.as_view(),
        name="requirement-working-copy",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-baseline/change-requests/",
        RequirementChangeRequestViewSet.as_view({"get": "list"}),
        name="requirement-change-requests",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-baseline/change-requests/submit/",
        RequirementChangeRequestViewSet.as_view({"post": "submit"}),
        name="requirement-change-request-submit",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-baseline/change-requests/<uuid:pk>/",
        RequirementChangeRequestViewSet.as_view({"get": "retrieve"}),
        name="requirement-change-request-detail",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-baseline/change-requests/<uuid:pk>/items/",
        RequirementChangeItemViewSet.as_view({"get": "list"}),
        name="requirement-change-request-items",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-baseline/change-requests/<uuid:pk>/act/",
        RequirementChangeRequestViewSet.as_view({"post": "act"}),
        name="requirement-change-request-act",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-baseline/change-requests/<uuid:pk>/cancel/",
        RequirementChangeRequestViewSet.as_view({"post": "cancel"}),
        name="requirement-change-request-cancel",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-baseline/versions/",
        RequirementVersionViewSet.as_view({"get": "list"}),
        name="requirement-versions",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-baseline/versions/<int:version>/",
        RequirementVersionViewSet.as_view({"get": "retrieve"}),
        name="requirement-version-detail",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-baseline/versions/<int:version>/requirements/",
        RequirementVersionViewSet.as_view({"get": "requirements"}),
        name="requirement-version-requirements",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-baseline/versions/<int:version>/compare/",
        RequirementVersionViewSet.as_view({"get": "compare"}),
        name="requirement-version-compare",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-baseline/versions/<int:version>/compare-current/",
        RequirementVersionViewSet.as_view({"get": "compare_current"}),
        name="requirement-version-compare-current",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-baseline/versions/<int:version>/rollback/",
        RequirementVersionViewSet.as_view({"post": "rollback"}),
        name="requirement-version-rollback",
    ),
]
