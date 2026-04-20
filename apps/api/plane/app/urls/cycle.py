# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path


from plane.app.views import (
    CycleViewSet,
    CycleIssueViewSet,
    CycleDateCheckEndpoint,
    CycleFavoriteViewSet,
    CycleProgressEndpoint,
    CycleAnalyticsEndpoint,
    CycleOverdueByAssigneeEndpoint,
    CyclePlansEndpoint,
    CycleSelectablePlansEndpoint,
    CycleAssociatePlansEndpoint,
    CycleCancelPlanAssociationEndpoint,
    TransferCycleIssueEndpoint,
    CycleUserPropertiesEndpoint,
    CycleArchiveUnarchiveEndpoint,
    CycleFileAPI,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/file/upload/",
        CycleFileAPI.as_view({"post": "upload"}),
        name="cycle-file-upload",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/file/list/",
        CycleFileAPI.as_view({"get": "file_list"}),
        name="cycle-file-list",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/file/<uuid:file_id>/delete/",
        CycleFileAPI.as_view({"delete": "delete_file"}),
        name="cycle-file-delete",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/file/<uuid:file_id>/download/",
        CycleFileAPI.as_view({"get": "download"}),
        name="cycle-file-download",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/",
        CycleViewSet.as_view({"get": "list", "post": "create"}),
        name="project-cycle",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/<uuid:pk>/",
        CycleViewSet.as_view(
            {
                "get": "retrieve",
                "put": "update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="project-cycle",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/<uuid:cycle_id>/cycle-issues/",
        CycleIssueViewSet.as_view({"get": "list", "post": "create"}),
        name="project-issue-cycle",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/<uuid:cycle_id>/cycle-issues/<uuid:issue_id>/",
        CycleIssueViewSet.as_view(
            {
                "get": "retrieve",
                "put": "update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="project-issue-cycle",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/date-check/",
        CycleDateCheckEndpoint.as_view(),
        name="project-cycle-date",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/user-favorite-cycles/",
        CycleFavoriteViewSet.as_view({"get": "list", "post": "create"}),
        name="user-favorite-cycle",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/user-favorite-cycles/<uuid:cycle_id>/",
        CycleFavoriteViewSet.as_view({"delete": "destroy"}),
        name="user-favorite-cycle",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/<uuid:cycle_id>/transfer-issues/",
        TransferCycleIssueEndpoint.as_view(),
        name="transfer-issues",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/<uuid:cycle_id>/user-properties/",
        CycleUserPropertiesEndpoint.as_view(),
        name="cycle-user-filters",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/<uuid:cycle_id>/archive/",
        CycleArchiveUnarchiveEndpoint.as_view(),
        name="cycle-archive-unarchive",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/archived-cycles/",
        CycleArchiveUnarchiveEndpoint.as_view(),
        name="cycle-archive-unarchive",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/archived-cycles/<uuid:pk>/",
        CycleArchiveUnarchiveEndpoint.as_view(),
        name="cycle-archive-unarchive",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/<uuid:cycle_id>/progress/",
        CycleProgressEndpoint.as_view(),
        name="project-cycle",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/<uuid:cycle_id>/analytics/",
        CycleAnalyticsEndpoint.as_view(),
        name="project-cycle",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/<uuid:cycle_id>/overdue-by-assignee/",
        CycleOverdueByAssigneeEndpoint.as_view(),
        name="project-cycle-overdue-by-assignee",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/<uuid:cycle_id>/plans/",
        CyclePlansEndpoint.as_view(),
        name="project-cycle-plans",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/<uuid:cycle_id>/selectable-plans/",
        CycleSelectablePlansEndpoint.as_view(),
        name="project-cycle-selectable-plans",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/<uuid:cycle_id>/associate-plans/",
        CycleAssociatePlansEndpoint.as_view(),
        name="project-cycle-associate-plans",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/<uuid:cycle_id>/cancel-plan-association/",
        CycleCancelPlanAssociationEndpoint.as_view(),
        name="project-cycle-cancel-plan-association",
    ),
]
