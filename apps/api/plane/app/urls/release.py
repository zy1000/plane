from django.urls import path, include
from rest_framework.routers import SimpleRouter

from plane.app.views import (
    ReleaseViewSet,
    ReleaseIssueViewSet,
    ReleaseLinkViewSet,
    ReleaseFavoriteViewSet,
    ReleaseUserPropertiesEndpoint,
    ReleaseArchiveUnarchiveEndpoint,
    ReleaseCommentViewSet,
)
from plane.app.views.release.base import ReleaseAPI, ReleaseOverdueByAssigneeEndpoint
from plane.app.views.release.file import ReleaseFileAPI

router = SimpleRouter()
router.register('release', ReleaseAPI, basename='release')
router.register('release/file', ReleaseFileAPI, basename='release-file')

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/release/file/<uuid:asset_id>/uploaded/",
        ReleaseFileAPI.as_view({"patch": "mark_uploaded"}),
        name="release-file-mark-uploaded",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/release/file/<uuid:file_id>/delete/",
        ReleaseFileAPI.as_view({"delete": "delete_file"}),
        name="release-file-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/release/file/<uuid:file_id>/download/",
        ReleaseFileAPI.as_view({"get": "download"}),
        name="release-file-download",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/",
        ReleaseViewSet.as_view({"get": "list", "post": "create"}),
        name="project-releases",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/<uuid:pk>/",
        ReleaseViewSet.as_view(
            {
                "get": "retrieve",
                "put": "update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="project-releases",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/releases/",
        ReleaseIssueViewSet.as_view({"post": "create_issue_releases"}),
        name="issue-release",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/<uuid:release_id>/issues/",
        ReleaseIssueViewSet.as_view({"post": "create_release_issues", "get": "list"}),
        name="project-release-issues",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/<uuid:release_id>/issues/<uuid:issue_id>/",
        ReleaseIssueViewSet.as_view(
            {
                "get": "retrieve",
                "put": "update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="project-release-issues",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/<uuid:release_id>/release-links/",
        ReleaseLinkViewSet.as_view({"get": "list", "post": "create"}),
        name="project-issue-release-links",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/<uuid:release_id>/release-links/<uuid:pk>/",
        ReleaseLinkViewSet.as_view(
            {
                "get": "retrieve",
                "put": "update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="project-issue-release-links",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/<uuid:release_id>/comments/",
        ReleaseCommentViewSet.as_view({"get": "list", "post": "create"}),
        name="project-release-comments",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/<uuid:release_id>/comments/<uuid:pk>/",
        ReleaseCommentViewSet.as_view(
            {
                "get": "retrieve",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="project-release-comments",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/user-favorite-releases/",
        ReleaseFavoriteViewSet.as_view({"get": "list", "post": "create"}),
        name="user-favorite-release",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/user-favorite-releases/<uuid:release_id>/",
        ReleaseFavoriteViewSet.as_view({"delete": "destroy"}),
        name="user-favorite-release",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/<uuid:release_id>/overdue-by-assignee/",
        ReleaseOverdueByAssigneeEndpoint.as_view(),
        name="project-release-overdue-by-assignee",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/<uuid:pk>/overdues/",
        ReleaseViewSet.as_view({"get": "overdues"}),
        name="project-release-overdues",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/<uuid:release_id>/user-properties/",
        ReleaseUserPropertiesEndpoint.as_view(),
        name="release-user-filters",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/<uuid:release_id>/archive/",
        ReleaseArchiveUnarchiveEndpoint.as_view(),
        name="release-archive-unarchive",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/archived-releases/",
        ReleaseArchiveUnarchiveEndpoint.as_view(),
        name="release-archive-unarchive",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/archived-releases/<uuid:pk>/",
        ReleaseArchiveUnarchiveEndpoint.as_view(),
        name="release-archive-unarchive",
    ),
    path('workspaces/<str:slug>/projects/<uuid:project_id>/', include(router.urls)),
]
