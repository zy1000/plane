from django.urls import path

from plane.app.views.workspace.job_role import (
    JobRoleDetailAPIView,
    JobRoleLabelUsageAPIView,
    JobRoleListAPIView,
    JobRoleProjectMembersAPIView,
    JobRoleReferencesAPIView,
    JobRoleReorderAPIView,
    JobRoleWorkspaceMemberDetailAPIView,
    JobRoleWorkspaceMembersAPIView,
)

urlpatterns = [
    path("workspaces/<str:slug>/job-roles/", JobRoleListAPIView.as_view(), name="job-roles"),
    path("workspaces/<str:slug>/job-roles/reorder/", JobRoleReorderAPIView.as_view(), name="job-role-reorder"),
    path("workspaces/<str:slug>/job-roles/<uuid:pk>/", JobRoleDetailAPIView.as_view(), name="job-role-detail"),
    path(
        "workspaces/<str:slug>/job-roles/<uuid:pk>/project-members/",
        JobRoleProjectMembersAPIView.as_view(),
        name="job-role-project-members",
    ),
    path(
        "workspaces/<str:slug>/job-roles/<uuid:pk>/references/",
        JobRoleReferencesAPIView.as_view(),
        name="job-role-references",
    ),
    path(
        "workspaces/<str:slug>/job-roles/<uuid:pk>/label-usage/",
        JobRoleLabelUsageAPIView.as_view(),
        name="job-role-label-usage",
    ),
    path(
        "workspaces/<str:slug>/job-roles/<uuid:pk>/workspace-members/",
        JobRoleWorkspaceMembersAPIView.as_view(),
        name="job-role-workspace-members",
    ),
    path(
        "workspaces/<str:slug>/job-roles/<uuid:pk>/workspace-members/<uuid:user_id>/",
        JobRoleWorkspaceMemberDetailAPIView.as_view(),
        name="job-role-workspace-member-detail",
    ),
]
