from django.urls import path

from plane.app.views.requirement import (
    RequirementChangeItemViewSet,
    RequirementChangeRequestViewSet,
    RequirementConfigurationAPIView,
    RequirementDetailViewSet,
    RequirementLibraryConfigurationAPIView,
    RequirementLibraryItemViewSet,
    RequirementLibraryViewSet,
    RequirementVersionViewSet,
    RequirementViewSet,
    RequirementWorkingCopyAPIView,
)


urlpatterns = [
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
    path(
        "workspaces/<str:slug>/requirements/",
        RequirementViewSet.as_view({"get": "list", "post": "create"}),
        name="requirements",
    ),
    path(
        "workspaces/<str:slug>/requirements/<uuid:pk>/",
        RequirementViewSet.as_view(
            {
                "get": "retrieve",
                "put": "update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="requirement-detail",
    ),
    path(
        "workspaces/<str:slug>/requirements/<uuid:pk>/configuration/",
        RequirementConfigurationAPIView.as_view(),
        name="requirement-configuration",
    ),
    path(
        "workspaces/<str:slug>/requirements/<uuid:requirement_id>/details/",
        RequirementDetailViewSet.as_view({"get": "list", "post": "create"}),
        name="requirement-details",
    ),
    path(
        "workspaces/<str:slug>/requirements/<uuid:requirement_id>/details/bulk-delete/",
        RequirementDetailViewSet.as_view({"post": "bulk_destroy"}),
        name="requirement-detail-bulk-delete",
    ),
    path(
        "workspaces/<str:slug>/requirements/<uuid:requirement_id>/details/bulk-save/",
        RequirementDetailViewSet.as_view({"post": "bulk_save"}),
        name="requirement-detail-bulk-save",
    ),
    path(
        "workspaces/<str:slug>/requirements/<uuid:requirement_id>/details/<uuid:pk>/",
        RequirementDetailViewSet.as_view(
            {"patch": "partial_update", "delete": "destroy"}
        ),
        name="requirement-detail-item",
    ),
    path(
        "workspaces/<str:slug>/requirements/<uuid:requirement_id>/working-copy/",
        RequirementWorkingCopyAPIView.as_view(),
        name="requirement-working-copy",
    ),
    path(
        "workspaces/<str:slug>/requirements/<uuid:requirement_id>/change-requests/",
        RequirementChangeRequestViewSet.as_view({"get": "list"}),
        name="requirement-change-requests",
    ),
    path(
        "workspaces/<str:slug>/requirements/<uuid:requirement_id>/change-requests/submit/",
        RequirementChangeRequestViewSet.as_view({"post": "submit"}),
        name="requirement-change-request-submit",
    ),
    path(
        "workspaces/<str:slug>/requirements/<uuid:requirement_id>/change-requests/<uuid:pk>/",
        RequirementChangeRequestViewSet.as_view({"get": "retrieve"}),
        name="requirement-change-request-detail",
    ),
    path(
        "workspaces/<str:slug>/requirements/<uuid:requirement_id>/change-requests/<uuid:pk>/items/",
        RequirementChangeItemViewSet.as_view({"get": "list"}),
        name="requirement-change-request-items",
    ),
    path(
        "workspaces/<str:slug>/requirements/<uuid:requirement_id>/change-requests/<uuid:pk>/act/",
        RequirementChangeRequestViewSet.as_view({"post": "act"}),
        name="requirement-change-request-act",
    ),
    path(
        "workspaces/<str:slug>/requirements/<uuid:requirement_id>/change-requests/<uuid:pk>/cancel/",
        RequirementChangeRequestViewSet.as_view({"post": "cancel"}),
        name="requirement-change-request-cancel",
    ),
    path(
        "workspaces/<str:slug>/requirements/<uuid:requirement_id>/versions/",
        RequirementVersionViewSet.as_view({"get": "list"}),
        name="requirement-versions",
    ),
    path(
        "workspaces/<str:slug>/requirements/<uuid:requirement_id>/versions/<int:version>/",
        RequirementVersionViewSet.as_view({"get": "retrieve"}),
        name="requirement-version-detail",
    ),
    path(
        "workspaces/<str:slug>/requirements/<uuid:requirement_id>/versions/<int:version>/details/",
        RequirementVersionViewSet.as_view({"get": "details"}),
        name="requirement-version-details",
    ),
    path(
        "workspaces/<str:slug>/requirements/<uuid:requirement_id>/versions/<int:version>/compare/",
        RequirementVersionViewSet.as_view({"get": "compare"}),
        name="requirement-version-compare",
    ),
    path(
        "workspaces/<str:slug>/requirements/<uuid:requirement_id>/versions/<int:version>/compare-current/",
        RequirementVersionViewSet.as_view({"get": "compare_current"}),
        name="requirement-version-compare-current",
    ),
    path(
        "workspaces/<str:slug>/requirements/<uuid:requirement_id>/versions/<int:version>/rollback/",
        RequirementVersionViewSet.as_view({"post": "rollback"}),
        name="requirement-version-rollback",
    ),
]
