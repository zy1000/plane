from django.urls import path

from plane.app.views.project_stage import ProjectStageViewSet

# 静态段（bulk-update / sync-from-dev-mode）必须排在 <uuid:pk> 之前
urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/stages/",
        ProjectStageViewSet.as_view({"get": "list", "post": "create"}),
        name="project-stages",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/stages/bulk-update/",
        ProjectStageViewSet.as_view({"post": "bulk_update"}),
        name="project-stage-bulk-update",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/stages/sync-from-dev-mode/",
        ProjectStageViewSet.as_view({"post": "sync_from_dev_mode"}),
        name="project-stage-sync-from-dev-mode",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/stages/<uuid:pk>/",
        ProjectStageViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="project-stage-detail",
    ),
]
