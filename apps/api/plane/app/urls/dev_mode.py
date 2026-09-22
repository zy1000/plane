from django.urls import path

from plane.app.views.dev_mode import DevModeStageViewSet, DevModeViewSet

urlpatterns = [
    path(
        "workspaces/<str:slug>/dev-modes/",
        DevModeViewSet.as_view({"get": "list", "post": "create"}),
        name="dev-modes",
    ),
    path(
        "workspaces/<str:slug>/dev-modes/<uuid:pk>/",
        DevModeViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="dev-mode-detail",
    ),
    # --- 模式的阶段 --------------------------------------------------------
    # 静态段（bulk-create / bulk-destroy / reorder）必须排在 <uuid:pk> 之前
    path(
        "workspaces/<str:slug>/dev-modes/<uuid:dev_mode_id>/stages/",
        DevModeStageViewSet.as_view({"get": "list", "post": "create"}),
        name="dev-mode-stages",
    ),
    path(
        "workspaces/<str:slug>/dev-modes/<uuid:dev_mode_id>/stages/bulk-create/",
        DevModeStageViewSet.as_view({"post": "bulk_create"}),
        name="dev-mode-stages-bulk-create",
    ),
    path(
        "workspaces/<str:slug>/dev-modes/<uuid:dev_mode_id>/stages/bulk-destroy/",
        DevModeStageViewSet.as_view({"post": "bulk_destroy"}),
        name="dev-mode-stages-bulk-destroy",
    ),
    path(
        "workspaces/<str:slug>/dev-modes/<uuid:dev_mode_id>/stages/reorder/",
        DevModeStageViewSet.as_view({"post": "reorder"}),
        name="dev-mode-stages-reorder",
    ),
    path(
        "workspaces/<str:slug>/dev-modes/<uuid:dev_mode_id>/stages/<uuid:pk>/",
        DevModeStageViewSet.as_view(
            {"patch": "partial_update", "delete": "destroy"}
        ),
        name="dev-mode-stage-detail",
    ),
    path(
        "workspaces/<str:slug>/dev-modes/<uuid:dev_mode_id>/stages/<uuid:pk>/templates/",
        DevModeStageViewSet.as_view({"get": "templates", "put": "set_templates"}),
        name="dev-mode-stage-templates",
    ),
]
