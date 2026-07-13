from django.urls import path

from plane.app.views.requirement import RequirementModuleViewSet, UserRequirementViewSet


urlpatterns = [
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/user-requirements/",
        UserRequirementViewSet.as_view({"get": "list", "post": "create"}),
        name="product-user-requirements",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/user-requirements/options/",
        UserRequirementViewSet.as_view({"get": "options"}),
        name="product-user-requirement-options",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/user-requirements/<uuid:pk>/",
        UserRequirementViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="product-user-requirement-detail",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-modules/",
        RequirementModuleViewSet.as_view({"get": "list", "post": "create"}),
        name="product-requirement-modules",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-modules/<uuid:pk>/",
        RequirementModuleViewSet.as_view(
            {"patch": "partial_update", "delete": "destroy"}
        ),
        name="product-requirement-module-detail",
    ),
]
