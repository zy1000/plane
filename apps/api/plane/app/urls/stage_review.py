from django.urls import path

from plane.app.views.stage_review import (
    ReviewTailoringActivityEndpoint,
    ReviewTailoringCommentViewSet,
    ReviewTailoringViewSet,
    StageReviewActivityEndpoint,
    StageReviewCommentViewSet,
    StageReviewFileAPI,
    StageReviewTemplateViewSet,
    StageReviewViewSet,
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
        "workspaces/<str:slug>/projects/<uuid:project_id>/review-tailorings/<uuid:pk>/"
        "products/<uuid:product_id>/",
        ReviewTailoringViewSet.as_view({"delete": "remove_product"}),
        name="review-tailoring-product-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/review-tailorings/<uuid:pk>/reviews/",
        ReviewTailoringViewSet.as_view({"post": "reviews"}),
        name="review-tailoring-reviews",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/review-tailorings/<uuid:pk>/"
        "reviews/<uuid:template_id>/",
        ReviewTailoringViewSet.as_view({"delete": "remove_review"}),
        name="review-tailoring-review-detail",
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
    # --- 阶段评审实例（项目级）---------------------------------------------
    # 状态动作同样走显式 URL：advance 往前一步、rollback 退回一步，具体从哪到哪由
    # utils/stage_review.py 的状态机决定，接口不接受「直接改成某个状态」。
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/stage-reviews/",
        StageReviewViewSet.as_view({"get": "list", "post": "create"}),
        name="stage-reviews",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/stage-reviews/stages/",
        StageReviewViewSet.as_view({"get": "stages"}),
        name="stage-review-stages",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/stage-reviews/<uuid:pk>/",
        StageReviewViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="stage-review-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/stage-reviews/<uuid:pk>/advance/",
        StageReviewViewSet.as_view({"post": "advance"}),
        name="stage-review-advance",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/stage-reviews/<uuid:pk>/rollback/",
        StageReviewViewSet.as_view({"post": "rollback"}),
        name="stage-review-rollback",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/stage-reviews/<uuid:pk>/candidates/",
        StageReviewViewSet.as_view({"get": "candidates"}),
        name="stage-review-candidates",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/stage-reviews/"
        "<uuid:stage_review_id>/comments/",
        StageReviewCommentViewSet.as_view({"get": "list", "post": "create"}),
        name="stage-review-comments",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/stage-reviews/"
        "<uuid:stage_review_id>/comments/<uuid:pk>/",
        StageReviewCommentViewSet.as_view({"delete": "destroy"}),
        name="stage-review-comment-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/stage-reviews/"
        "<uuid:stage_review_id>/activities/",
        StageReviewActivityEndpoint.as_view(),
        name="stage-review-activities",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/stage-reviews/"
        "<uuid:stage_review_id>/files/",
        StageReviewFileAPI.as_view({"get": "list", "post": "upload"}),
        name="stage-review-files",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/stage-reviews/"
        "<uuid:stage_review_id>/files/<uuid:asset_id>/uploaded/",
        StageReviewFileAPI.as_view({"patch": "mark_uploaded"}),
        name="stage-review-file-uploaded",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/stage-reviews/"
        "<uuid:stage_review_id>/files/<uuid:asset_id>/",
        StageReviewFileAPI.as_view({"delete": "destroy"}),
        name="stage-review-file-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/stage-reviews/"
        "<uuid:stage_review_id>/files/<uuid:asset_id>/download/",
        StageReviewFileAPI.as_view({"get": "download"}),
        name="stage-review-file-download",
    ),
]
