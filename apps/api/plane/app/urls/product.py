from django.urls import path

from plane.app.views.product import ProductViewSet


urlpatterns = [
    path(
        "workspaces/<str:slug>/products/",
        ProductViewSet.as_view({"get": "list", "post": "create"}),
        name="products",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:pk>/",
        ProductViewSet.as_view(
            {
                "get": "retrieve",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="product-detail",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:pk>/members/",
        ProductViewSet.as_view({"get": "members", "post": "members"}),
        name="product-members",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:pk>/eligible-members/",
        ProductViewSet.as_view({"get": "eligible_members"}),
        name="product-eligible-members",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:pk>/members/<uuid:member_id>/",
        ProductViewSet.as_view({"delete": "remove_member"}),
        name="product-member-detail",
    ),
]
