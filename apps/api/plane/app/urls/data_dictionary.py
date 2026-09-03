from django.urls import path

from plane.app.views.data_dictionary import (
    DataDictionaryItemViewSet,
    DataDictionaryViewSet,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/data-dictionaries/",
        DataDictionaryViewSet.as_view({"get": "list", "post": "create"}),
        name="data-dictionaries",
    ),
    path(
        "workspaces/<str:slug>/data-dictionaries/<uuid:pk>/",
        DataDictionaryViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="data-dictionary-detail",
    ),
    path(
        "workspaces/<str:slug>/data-dictionaries/<uuid:pk>/usage/",
        DataDictionaryViewSet.as_view({"get": "usage"}),
        name="data-dictionary-usage",
    ),
    path(
        "workspaces/<str:slug>/data-dictionaries/<uuid:dictionary_id>/items/",
        DataDictionaryItemViewSet.as_view({"post": "create"}),
        name="data-dictionary-items",
    ),
    path(
        "workspaces/<str:slug>/data-dictionaries/<uuid:dictionary_id>/items/bulk/",
        DataDictionaryItemViewSet.as_view({"post": "bulk_create"}),
        name="data-dictionary-item-bulk",
    ),
    path(
        "workspaces/<str:slug>/data-dictionaries/<uuid:dictionary_id>/items/<uuid:pk>/",
        DataDictionaryItemViewSet.as_view(
            {"patch": "partial_update", "delete": "destroy"}
        ),
        name="data-dictionary-item-detail",
    ),
]
