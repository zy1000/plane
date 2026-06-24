from django.urls import path

from plane.app.views.asset.file import (
    FilestoreAssetAPIView,
    FilestoreAssetDetailAPIView,
    FilestoreAssetDownloadAPIView,
    FilestoreAssetVersionDetailAPIView,
    FilestoreAssetVersionDownloadAPIView,
    FilestoreAssetVersionListAPIView,
    FilestoreAssetVersionRestoreAPIView,
    FilestoreAssetVersionUploadAPIView,
    FilestoreAssetOnlyOfficeCallbackAPIView,
    FilestoreAssetOnlyOfficeConfigAPIView,
    FilestoreAssetOnlyOfficeDownloadProxyAPIView,
    FilestoreAssetOnlyOfficeForceSaveAPIView,
    FilestoreAssetOnlyOfficeRestoreVersionAPIView,
    FilestoreAssetOnlyOfficeStatusAPIView,
    FilestoreAssetOnlyOfficeVersionsAPIView,
)
from plane.app.views.asset.file_explorer import FilestoreExplorerViewSet

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
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/assets/<uuid:pk>/versions/",
        FilestoreAssetVersionListAPIView.as_view(),
        name="project-filestore-asset-versions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/assets/<uuid:pk>/versions/upload/",
        FilestoreAssetVersionUploadAPIView.as_view(),
        name="project-filestore-asset-version-upload",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/assets/<uuid:pk>/versions/<str:version_id>/",
        FilestoreAssetVersionDetailAPIView.as_view(),
        name="project-filestore-asset-version-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/assets/<uuid:pk>/versions/<str:version_id>/download/",
        FilestoreAssetVersionDownloadAPIView.as_view(),
        name="project-filestore-asset-version-download",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/assets/<uuid:pk>/versions/<str:version_id>/restore/",
        FilestoreAssetVersionRestoreAPIView.as_view(),
        name="project-filestore-asset-version-restore",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/assets/<uuid:pk>/onlyoffice/config/",
        FilestoreAssetOnlyOfficeConfigAPIView.as_view(),
        name="project-filestore-asset-onlyoffice-config",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/assets/<uuid:pk>/onlyoffice/download/",
        FilestoreAssetOnlyOfficeDownloadProxyAPIView.as_view(),
        name="project-filestore-asset-onlyoffice-download",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/assets/<uuid:pk>/onlyoffice/callback/",
        FilestoreAssetOnlyOfficeCallbackAPIView.as_view(),
        name="project-filestore-asset-onlyoffice-callback",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/assets/<uuid:pk>/onlyoffice/status/",
        FilestoreAssetOnlyOfficeStatusAPIView.as_view(),
        name="project-filestore-asset-onlyoffice-status",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/assets/<uuid:pk>/onlyoffice/versions/",
        FilestoreAssetOnlyOfficeVersionsAPIView.as_view(),
        name="project-filestore-asset-onlyoffice-versions",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/assets/<uuid:pk>/onlyoffice/versions/restore/",
        FilestoreAssetOnlyOfficeRestoreVersionAPIView.as_view(),
        name="project-filestore-asset-onlyoffice-versions-restore",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/assets/<uuid:pk>/onlyoffice/forcesave/",
        FilestoreAssetOnlyOfficeForceSaveAPIView.as_view(),
        name="project-filestore-asset-onlyoffice-forcesave",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/explorer/ensure-root/",
        FilestoreExplorerViewSet.as_view({"post": "ensure_root"}),
        name="project-filestore-explorer-ensure-root",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/explorer/list/",
        FilestoreExplorerViewSet.as_view({"get": "list_folder"}),
        name="project-filestore-explorer-list",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/explorer/tree/",
        FilestoreExplorerViewSet.as_view({"get": "folder_tree"}),
        name="project-filestore-explorer-tree",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/explorer/breadcrumb/",
        FilestoreExplorerViewSet.as_view({"get": "breadcrumb"}),
        name="project-filestore-explorer-breadcrumb",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/explorer/folder-stats/",
        FilestoreExplorerViewSet.as_view({"get": "folder_stats"}),
        name="project-filestore-explorer-folder-stats",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/explorer/folder/",
        FilestoreExplorerViewSet.as_view({"post": "create_folder"}),
        name="project-filestore-explorer-folder-create",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/explorer/folder/<int:folder_id>/",
        FilestoreExplorerViewSet.as_view(
            {"patch": "rename_folder", "delete": "delete_folder"}
        ),
        name="project-filestore-explorer-folder-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/explorer/upload/",
        FilestoreExplorerViewSet.as_view({"post": "upload"}),
        name="project-filestore-explorer-upload",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/explorer/<uuid:asset_id>/uploaded/",
        FilestoreExplorerViewSet.as_view({"patch": "mark_uploaded"}),
        name="project-filestore-explorer-mark-uploaded",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/explorer/<uuid:asset_id>/rename/",
        FilestoreExplorerViewSet.as_view({"patch": "rename_asset"}),
        name="project-filestore-explorer-rename-asset",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/explorer/batch-delete/",
        FilestoreExplorerViewSet.as_view({"post": "batch_delete"}),
        name="project-filestore-explorer-batch-delete",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/explorer/batch-copy/",
        FilestoreExplorerViewSet.as_view({"post": "batch_copy"}),
        name="project-filestore-explorer-batch-copy",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/explorer/batch-move/",
        FilestoreExplorerViewSet.as_view({"post": "batch_move"}),
        name="project-filestore-explorer-batch-move",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/explorer/batch-download/",
        FilestoreExplorerViewSet.as_view({"get": "batch_download"}),
        name="project-filestore-explorer-batch-download",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/filestore/explorer/search/",
        FilestoreExplorerViewSet.as_view({"get": "search"}),
        name="project-filestore-explorer-search",
    ),
]
