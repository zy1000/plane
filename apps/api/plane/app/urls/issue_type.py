from django.urls import path

from plane.app.views.issue.issue_type import (
    IssueTypeViewSet,
    ProjectIssueTypeListCreateAPIEndpoint,
    WorkspaceIssueTypeApiView,
)

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
]