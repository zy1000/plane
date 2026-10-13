from django.urls import path

from plane.app.views.risk import (
    IssueRiskViewSet,
    RiskActivityEndpoint,
    RiskCommentViewSet,
    RiskFileAPI,
    RiskViewSet,
)

PROJECT = "workspaces/<str:slug>/projects/<uuid:project_id>"

urlpatterns = [
    path(
        f"{PROJECT}/risks/",
        RiskViewSet.as_view({"get": "list", "post": "create"}),
        name="risks",
    ),
    path(
        f"{PROJECT}/risks/next-code/",
        RiskViewSet.as_view({"get": "next_code"}),
        name="risk-next-code",
    ),
    path(
        f"{PROJECT}/risks/<uuid:pk>/",
        RiskViewSet.as_view({"get": "retrieve", "patch": "partial_update", "delete": "destroy"}),
        name="risk-detail",
    ),
    path(
        f"{PROJECT}/risks/<uuid:pk>/issues/",
        RiskViewSet.as_view({"get": "issues", "post": "link_issues"}),
        name="risk-issues",
    ),
    path(
        f"{PROJECT}/risks/<uuid:pk>/issues/<uuid:issue_id>/",
        RiskViewSet.as_view({"delete": "unlink_issue"}),
        name="risk-issue-detail",
    ),
    path(
        f"{PROJECT}/risks/<uuid:risk_id>/comments/",
        RiskCommentViewSet.as_view({"get": "list", "post": "create"}),
        name="risk-comments",
    ),
    path(
        f"{PROJECT}/risks/<uuid:risk_id>/comments/<uuid:pk>/",
        RiskCommentViewSet.as_view({"delete": "destroy"}),
        name="risk-comment-detail",
    ),
    path(
        f"{PROJECT}/risks/<uuid:risk_id>/activities/",
        RiskActivityEndpoint.as_view(),
        name="risk-activities",
    ),
    path(
        f"{PROJECT}/risks/<uuid:risk_id>/files/",
        RiskFileAPI.as_view({"get": "list", "post": "upload"}),
        name="risk-files",
    ),
    path(
        f"{PROJECT}/risks/<uuid:risk_id>/files/<uuid:asset_id>/uploaded/",
        RiskFileAPI.as_view({"patch": "mark_uploaded"}),
        name="risk-file-uploaded",
    ),
    path(
        f"{PROJECT}/risks/<uuid:risk_id>/files/<uuid:asset_id>/",
        RiskFileAPI.as_view({"delete": "destroy"}),
        name="risk-file-detail",
    ),
    path(
        f"{PROJECT}/risks/<uuid:risk_id>/files/<uuid:asset_id>/download/",
        RiskFileAPI.as_view({"get": "download"}),
        name="risk-file-download",
    ),
    # --- 缺陷侧 -----------------------------------------------------------
    path(
        f"{PROJECT}/issues/<uuid:issue_id>/risks/",
        IssueRiskViewSet.as_view({"get": "list", "post": "create"}),
        name="issue-risks",
    ),
    path(
        f"{PROJECT}/issues/<uuid:issue_id>/risks/<uuid:risk_id>/",
        IssueRiskViewSet.as_view({"delete": "destroy"}),
        name="issue-risk-detail",
    ),
]
