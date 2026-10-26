"""工作项方案路由（docs/issue-scheme/）。

方案级的类型 / 字段 / 状态 / 工作流接口与项目级同名接口共用视图，只是 URL 参数从 project_id 换成
issue_scheme_id（模板中心维护模式方案，鉴权走研发模式权限，见 check_issue_scheme_route_permission）。
"""

from django.urls import path

from plane.app.views import StateViewSet
from plane.app.views.issue.issue_type import IssueTypeViewSet, ProjectIssueTypeListCreateAPIEndpoint
from plane.app.views.issue.issue_type_field import IssueExtraViewSet
from plane.app.views.issue_scheme.base import IssueSchemeDetailEndpoint, ProjectIssueSchemeDetachEndpoint
from plane.app.views.view.scheme import (
    IssueSchemeViewDetailEndpoint,
    IssueSchemeViewListEndpoint,
    IssueSchemeViewReorderEndpoint,
)
from plane.app.views.workflow.base import WorkflowAPIView, WorkflowFlowchartAPIView, WorkflowTransitionAPIView

SCHEME = "workspaces/<str:slug>/issue-schemes/<uuid:issue_scheme_id>"

urlpatterns = [
    path(f"{SCHEME}/", IssueSchemeDetailEndpoint.as_view(), name="issue-scheme-detail"),
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
    path(f"{SCHEME}/views/", IssueSchemeViewListEndpoint.as_view(), name="scheme-views"),
    path(f"{SCHEME}/views/reorder/", IssueSchemeViewReorderEndpoint.as_view(), name="scheme-views-reorder"),
    path(f"{SCHEME}/views/<uuid:pk>/", IssueSchemeViewDetailEndpoint.as_view(), name="scheme-view"),
    path(f"{SCHEME}/workflows/", WorkflowAPIView.as_view(), name="scheme-workflows"),
    path(f"{SCHEME}/workflows/flowchart/", WorkflowFlowchartAPIView.as_view(), name="scheme-workflows-flowchart"),
    path(
        f"{SCHEME}/workflows/<uuid:workflow_id>/transitions/",
        WorkflowTransitionAPIView.as_view(),
        name="scheme-workflow-transitions",
    ),
]
