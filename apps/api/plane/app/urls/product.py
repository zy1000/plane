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
]
