from django.urls import path
from rest_framework.permissions import AllowAny

from plane.app.views.timesheet import TimeSheetViewSet, TimesheetCategoryListView, TimeSheetReportViewSet

urlpatterns = [
    # 工时类别字典（全局只读，前端渲染类别菜单）
    path(
        "timesheet-categories/",
        TimesheetCategoryListView.as_view(),
        name="timesheet-categories",
    ),
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
    path(
        "workspaces/<str:slug>/timesheets/reports/",
        TimeSheetReportViewSet.as_view({"get": "list"}),
        name="timesheet-reports",
    ),
    path(
        "workspaces/<str:slug>/timesheets/reports/export/",
        TimeSheetReportViewSet.as_view({"get": "export_xlsx"}),
        name="timesheet-reports-export",
    ),
    # 公开接口：无需鉴权，直接按 month / user 导出工时数据（JSON）
    path(
        "timesheets/reports/export-json/",
        TimeSheetReportViewSet.as_view(
            {"get": "export_json"},
            permission_classes=[AllowAny],
            authentication_classes=[],
        ),
        name="timesheet-reports-export-json",
    ),
    # 公开接口：无需鉴权，直接按 month / user 导出工时数据（Excel）
    path(
        "timesheets/reports/export-excel/",
        TimeSheetReportViewSet.as_view(
            {"get": "export_excel"},
            permission_classes=[AllowAny],
            authentication_classes=[],
        ),
        name="timesheet-reports-export-excel",
    ),
]
