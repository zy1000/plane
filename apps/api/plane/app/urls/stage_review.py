from django.urls import path

from plane.app.views.stage_review import StageReviewTemplateViewSet

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
]
