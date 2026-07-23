from django.urls import path

from plane.app.views.requirement import (
    RequirementConfigurationAPIView,
    RequirementDetailViewSet,
    RequirementViewSet,
)


urlpatterns = [
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
        "workspaces/<str:slug>/requirements/<uuid:requirement_id>/details/<uuid:pk>/",
        RequirementDetailViewSet.as_view(
            {"patch": "partial_update", "delete": "destroy"}
        ),
        name="requirement-detail-item",
    ),
]
