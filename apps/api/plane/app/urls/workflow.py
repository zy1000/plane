from django.urls import path

from plane.app.views.workflow.base import (
    BatchIssueTransitionRecordsAPIView,
    IssueTransitionRecordsAPIView,
    MyApprovalsAPIView,
    TransitionRecordActionAPIView,
    WorkflowAPIView,
    WorkflowTransitionAPIView,
    WorkspaceBatchIssueTransitionRecordsAPIView,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workflows/",
        WorkflowAPIView.as_view(),
        name="project-workflows",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/workflows/<uuid:workflow_id>/transitions/",
        WorkflowTransitionAPIView.as_view(),
        name="project-workflow-transitions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/my-approvals/",
        MyApprovalsAPIView.as_view(),
        name="project-my-approvals",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/transition-records/",
        IssueTransitionRecordsAPIView.as_view(),
        name="issue-transition-records",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/batch-transition-records/",
        BatchIssueTransitionRecordsAPIView.as_view(),
        name="batch-issue-transition-records",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/transition-records/<uuid:record_id>/action/",
        TransitionRecordActionAPIView.as_view(),
        name="transition-record-action",
    ),
    path(
        "workspaces/<str:slug>/batch-transition-records/",
        WorkspaceBatchIssueTransitionRecordsAPIView.as_view(),
        name="workspace-batch-issue-transition-records",
    ),
]
