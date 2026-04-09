from django.urls import path

from plane.app.views.timesheet import TimeSheetViewSet

urlpatterns = [
    # 项目级工时接口
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/timesheets/",
        TimeSheetViewSet.as_view({"get": "list", "post": "create"}),
        name="timesheets",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/timesheets/copy-previous-week/",
        TimeSheetViewSet.as_view({"post": "copy_previous_week"}),
        name="timesheets-copy-previous-week",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/timesheets/<uuid:pk>/",
        TimeSheetViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="timesheet",
    ),
    # 工作区级工时接口（不限定 project_id，供工作区级工时页面使用）
    path(
        "workspaces/<str:slug>/timesheets/",
        TimeSheetViewSet.as_view({"get": "workspace_list"}),
        name="workspace-timesheets",
    ),
    path(
        "workspaces/<str:slug>/timesheets/copy-previous-week/",
        TimeSheetViewSet.as_view({"post": "workspace_copy_previous_week"}),
        name="workspace-timesheets-copy-previous-week",
    ),
]
