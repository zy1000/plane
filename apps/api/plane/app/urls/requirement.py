from django.urls import path

from plane.app.views.requirement import RequirementCommentViewSet, RequirementModuleViewSet, RequirementViewSet
from plane.db.models import Requirement


def requirement_urls(prefix, requirement_type, name_prefix):
    base = f"workspaces/<str:slug>/products/<uuid:product_id>/{prefix}"
    view_kwargs = {"requirement_type": requirement_type}
    return [
        path(
            f"{base}/",
            RequirementViewSet.as_view(
                {"get": "list", "post": "create"},
                **view_kwargs,
            ),
            name=f"product-{name_prefix}",
        ),
        path(
            f"{base}/options/",
            RequirementViewSet.as_view({"get": "options"}, **view_kwargs),
            name=f"product-{name_prefix}-options",
        ),
        path(
            f"{base}/my-reviews/",
            RequirementViewSet.as_view({"get": "my_reviews"}, **view_kwargs),
            name=f"product-{name_prefix}-my-reviews",
        ),
        path(
            f"{base}/<uuid:pk>/",
            RequirementViewSet.as_view(
                {"get": "retrieve", "patch": "partial_update", "delete": "destroy"},
                **view_kwargs,
            ),
            name=f"product-{name_prefix}-detail",
        ),
        path(
            f"{base}/<uuid:pk>/changes/",
            RequirementViewSet.as_view(
                {"get": "changes", "post": "create_change"},
                **view_kwargs,
            ),
            name=f"product-{name_prefix}-changes",
        ),
        path(
            f"{base}/<uuid:pk>/changes/<uuid:change_id>/",
            RequirementViewSet.as_view(
                {"get": "change_detail", "patch": "update_change", "delete": "destroy_change"},
                **view_kwargs,
            ),
            name=f"product-{name_prefix}-change-detail",
        ),
        path(
            f"{base}/<uuid:pk>/changes/<uuid:change_id>/submit/",
            RequirementViewSet.as_view({"post": "submit_change"}, **view_kwargs),
            name=f"product-{name_prefix}-change-submit",
        ),
        path(
            f"{base}/<uuid:pk>/changes/<uuid:change_id>/withdraw/",
            RequirementViewSet.as_view({"post": "withdraw_change"}, **view_kwargs),
            name=f"product-{name_prefix}-change-withdraw",
        ),
        path(
            f"{base}/<uuid:pk>/changes/<uuid:change_id>/reviews/",
            RequirementViewSet.as_view({"post": "review_change"}, **view_kwargs),
            name=f"product-{name_prefix}-change-review",
        ),
        path(
            f"{base}/<uuid:pk>/versions/",
            RequirementViewSet.as_view({"get": "versions"}, **view_kwargs),
            name=f"product-{name_prefix}-versions",
        ),
        path(
            f"{base}/<uuid:pk>/versions/<int:version>/",
            RequirementViewSet.as_view({"get": "version_detail"}, **view_kwargs),
            name=f"product-{name_prefix}-version-detail",
        ),
        path(
            f"{base}/<uuid:pk>/compare/",
            RequirementViewSet.as_view({"get": "compare"}, **view_kwargs),
            name=f"product-{name_prefix}-compare",
        ),
        path(
            f"{base}/<uuid:pk>/lifecycle/",
            RequirementViewSet.as_view({"post": "lifecycle"}, **view_kwargs),
            name=f"product-{name_prefix}-lifecycle",
        ),
        path(
            f"{base}/<uuid:pk>/archive/",
            RequirementViewSet.as_view({"post": "archive", "delete": "unarchive"}, **view_kwargs),
            name=f"product-{name_prefix}-archive",
        ),
        path(
            f"{base}/<uuid:pk>/lifecycle-events/",
            RequirementViewSet.as_view({"get": "lifecycle_events"}, **view_kwargs),
            name=f"product-{name_prefix}-lifecycle-events",
        ),
        path(
            f"{base}/<uuid:pk>/comments/",
            RequirementCommentViewSet.as_view(
                {"get": "list", "post": "create"},
                **view_kwargs,
            ),
            name=f"product-{name_prefix}-comments",
        ),
        path(
            f"{base}/<uuid:pk>/comments/<uuid:comment_id>/",
            RequirementCommentViewSet.as_view({"delete": "destroy"}, **view_kwargs),
            name=f"product-{name_prefix}-comment-detail",
        ),
    ]


urlpatterns = [
    *requirement_urls(
        "user-requirements",
        Requirement.RequirementType.USER,
        "user-requirements",
    ),
    *requirement_urls(
        "development-requirements",
        Requirement.RequirementType.DEVELOPMENT,
        "development-requirements",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-modules/",
        RequirementModuleViewSet.as_view({"get": "list", "post": "create"}),
        name="product-requirement-modules",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-modules/<uuid:pk>/",
        RequirementModuleViewSet.as_view({"patch": "partial_update", "delete": "destroy"}),
        name="product-requirement-module-detail",
    ),
]
