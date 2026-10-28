"""工作项方案路由（docs/issue-scheme/）。

方案级的类型 / 字段 / 状态 / 工作流接口与项目级同名接口共用视图，只是 URL 参数从 project_id 换成
issue_scheme_id（模板中心维护类型库，鉴权走研发模式权限，见 check_issue_scheme_route_permission）。
"""

from django.urls import path

from plane.app.views import StateViewSet
from plane.app.views.issue.issue_type import IssueTypeViewSet, ProjectIssueTypeListCreateAPIEndpoint
from plane.app.views.issue.issue_type_field import IssueExtraViewSet
from plane.app.views.issue_scheme.base import (
    IssueSchemeDetailEndpoint,
    IssueTypeLibraryEndpoint,
    ProjectIssueSchemeDetachEndpoint,
)
from plane.app.views.issue_scheme.field_library import IssueFieldDefinitionViewSet
from plane.app.views.dev_mode.issue_type import DevModeIssueTypeEndpoint
from plane.app.views.view.scheme import (
    DevModeViewDetailEndpoint,
    DevModeViewListEndpoint,
    DevModeViewReorderEndpoint,
)
from plane.app.views.workflow.base import WorkflowAPIView, WorkflowFlowchartAPIView, WorkflowTransitionAPIView

SCHEME = "workspaces/<str:slug>/issue-schemes/<uuid:issue_scheme_id>"
DEV_MODE = "workspaces/<str:slug>/dev-modes/<uuid:dev_mode_id>"

urlpatterns = [
    path(f"{SCHEME}/", IssueSchemeDetailEndpoint.as_view(), name="issue-scheme-detail"),
    # ---- 工作项类型库 / 研发模式关联类型 / 通用字段库 ----
    path("workspaces/<str:slug>/issue-type-library/", IssueTypeLibraryEndpoint.as_view(), name="issue-type-library"),
    path(f"{DEV_MODE}/issue-types/", DevModeIssueTypeEndpoint.as_view(), name="dev-mode-issue-types"),
    path(
        "workspaces/<str:slug>/issue-fields/",
        IssueFieldDefinitionViewSet.as_view({"get": "list", "post": "create"}),
        name="issue-field-definitions",
    ),
    path(
        "workspaces/<str:slug>/issue-fields/<uuid:pk>/",
        IssueFieldDefinitionViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="issue-field-definition",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issue-scheme/detach/",
        ProjectIssueSchemeDetachEndpoint.as_view(),
        name="project-issue-scheme-detach",
    ),
    # ---- 方案级：与项目级同名接口共用视图 ----
    path(f"{SCHEME}/issue-types/", ProjectIssueTypeListCreateAPIEndpoint.as_view(), name="scheme-issue-types"),
    path(f"{SCHEME}/issue-types/<uuid:issue_type_id>/", IssueTypeViewSet.as_view(), name="scheme-issue-type"),
    path(
        f"{SCHEME}/type-extra-fields/",
        IssueExtraViewSet.as_view({"get": "list", "post": "create"}),
        name="scheme-type-extra-fields",
    ),
    path(
        f"{SCHEME}/type-extra-fields/bind-library/",
        IssueExtraViewSet.as_view({"post": "bind_library"}),
        name="scheme-type-extra-fields-bind-library",
    ),
    path(
        f"{SCHEME}/type-extra-fields/<uuid:pk>/",
        IssueExtraViewSet.as_view(
            {"get": "retrieve", "put": "update", "patch": "partial_update", "delete": "destroy"}
        ),
        name="scheme-type-extra-field",
    ),
    path(f"{SCHEME}/states/", StateViewSet.as_view({"get": "list", "post": "create"}), name="scheme-states"),
    path(
        f"{SCHEME}/states/<uuid:pk>/",
        StateViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="scheme-state",
    ),
    path(
        f"{SCHEME}/states/<uuid:pk>/mark-default/",
        StateViewSet.as_view({"post": "mark_as_default"}),
        name="scheme-state-mark-default",
    ),
    # ---- 研发模式视图（模板中心「视图」页签）----
    path(f"{DEV_MODE}/views/", DevModeViewListEndpoint.as_view(), name="dev-mode-views"),
    path(f"{DEV_MODE}/views/reorder/", DevModeViewReorderEndpoint.as_view(), name="dev-mode-views-reorder"),
    path(f"{DEV_MODE}/views/<uuid:pk>/", DevModeViewDetailEndpoint.as_view(), name="dev-mode-view"),
    path(f"{SCHEME}/workflows/", WorkflowAPIView.as_view(), name="scheme-workflows"),
    path(f"{SCHEME}/workflows/flowchart/", WorkflowFlowchartAPIView.as_view(), name="scheme-workflows-flowchart"),
    path(
        f"{SCHEME}/workflows/<uuid:workflow_id>/transitions/",
        WorkflowTransitionAPIView.as_view(),
        name="scheme-workflow-transitions",
    ),
]
