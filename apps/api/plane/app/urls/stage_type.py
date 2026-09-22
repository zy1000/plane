from django.urls import path

from plane.app.views.stage_type import StageTypeViewSet

urlpatterns = [
    path(
        "workspaces/<str:slug>/stage-types/",
        StageTypeViewSet.as_view({"get": "list", "post": "create"}),
        name="stage-types",
    ),
    # 静态段必须排在 <uuid:pk> 之前
    path(
        "workspaces/<str:slug>/stage-types/reorder/",
        StageTypeViewSet.as_view({"post": "reorder"}),
        name="stage-types-reorder",
    ),
    path(
        "workspaces/<str:slug>/stage-types/<uuid:pk>/",
        StageTypeViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="stage-type-detail",
    ),
]
