from django.urls import path

from plane.app.views.filestore import (
    FilestoreAssetAPIView,
    FilestoreAssetDetailAPIView,
    FilestoreAssetDownloadAPIView,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/assets/",
        FilestoreAssetAPIView.as_view(),
        name="project-filestore-assets",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/assets/<uuid:pk>/",
        FilestoreAssetDetailAPIView.as_view(),
        name="project-filestore-asset-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/assets/<uuid:pk>/download/",
        FilestoreAssetDownloadAPIView.as_view(),
        name="project-filestore-asset-download",
    ),
]

