from django.urls import path

from plane.app.views.workflow.base import WorkflowAPIView, WorkflowTransitionAPIView

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
]
