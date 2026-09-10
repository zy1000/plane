from django.urls import path

from plane.app.views.stage_review import (
    ReviewTailoringActivityEndpoint,
    ReviewTailoringCommentViewSet,
    ReviewTailoringViewSet,
    StageReviewTemplateViewSet,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/stage-review-templates/",
        StageReviewTemplateViewSet.as_view({"get": "list", "post": "create"}),
        name="stage-review-templates",
    ),
    path(
        "workspaces/<str:slug>/stage-review-templates/reorder/",
        StageReviewTemplateViewSet.as_view({"post": "reorder"}),
        name="stage-review-templates-reorder",
    ),
    path(
        "workspaces/<str:slug>/stage-review-templates/<uuid:pk>/",
        StageReviewTemplateViewSet.as_view(
            {
                "get": "retrieve",
                "put": "update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="stage-review-template-detail",
    ),
    # --- 评审裁剪（项目级）-------------------------------------------------
    # 状态动作走显式 URL + as_view({"post": "xxx"})，与需求变更单的 act / cancel
    # 同一路子；不用 DRF 的 @action，那是 QA 模块的旧风格。
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/review-tailorings/",
        ReviewTailoringViewSet.as_view({"get": "list", "post": "create"}),
        name="review-tailorings",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/review-tailorings/<uuid:pk>/",
        ReviewTailoringViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="review-tailoring-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/review-tailorings/<uuid:pk>/cells/",
        ReviewTailoringViewSet.as_view({"patch": "cells"}),
        name="review-tailoring-cells",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/review-tailorings/<uuid:pk>/products/",
        ReviewTailoringViewSet.as_view({"post": "products"}),
        name="review-tailoring-products",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/review-tailorings/<uuid:pk>/submit/",
        ReviewTailoringViewSet.as_view({"post": "submit"}),
        name="review-tailoring-submit",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/review-tailorings/<uuid:pk>/withdraw/",
        ReviewTailoringViewSet.as_view({"post": "withdraw"}),
        name="review-tailoring-withdraw",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/review-tailorings/<uuid:pk>/act/",
        ReviewTailoringViewSet.as_view({"post": "act"}),
        name="review-tailoring-act",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/review-tailorings/<uuid:pk>/revise/",
        ReviewTailoringViewSet.as_view({"post": "revise"}),
        name="review-tailoring-revise",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/review-tailorings/<uuid:pk>/cancel-revision/",
        ReviewTailoringViewSet.as_view({"post": "cancel_revision"}),
        name="review-tailoring-cancel-revision",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/review-tailorings/<uuid:tailoring_id>/comments/",
        ReviewTailoringCommentViewSet.as_view({"get": "list", "post": "create"}),
        name="review-tailoring-comments",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/review-tailorings/"
        "<uuid:tailoring_id>/comments/<uuid:pk>/",
        ReviewTailoringCommentViewSet.as_view({"delete": "destroy"}),
        name="review-tailoring-comment-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/review-tailorings/<uuid:tailoring_id>/activities/",
        ReviewTailoringActivityEndpoint.as_view(),
        name="review-tailoring-activities",
    ),
]
