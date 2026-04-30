from django.urls import path

from plane.app.views.issue.issue_type import (
    IssueTypeViewSet,
    ProjectIssueTypeListCreateAPIEndpoint,
    WorkspaceIssueTypeApiView,
)
from plane.app.views.issue.issue_type_field import IssueExtraViewSet

urlpatterns = [
    # Issue Type管理
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/",
        ProjectIssueTypeListCreateAPIEndpoint.as_view(),
        name="project-issue-types",
    ),
    path(
        'workspaces/<str:slug>/issue-types/',
        WorkspaceIssueTypeApiView.as_view(),
        name="workspaces-issue-types",

    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-types/<uuid:issue_type_id>/",
        IssueTypeViewSet.as_view(),
        name="issue-type",
    ),
    # 工作项类型扩展字段（项目作用域）
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/type-extra-fields/",
        IssueExtraViewSet.as_view({"get": "list", "post": "create"}),
        name="project-type-extra-fields",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/type-extra-fields/<uuid:pk>/",
        IssueExtraViewSet.as_view(
            {
                "get": "retrieve",
                "put": "update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="project-type-extra-field",
    ),
]