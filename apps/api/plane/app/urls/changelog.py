from django.urls import path

from plane.app.views import (
    ChangeLogDetailEndpoint,
    ChangeLogLatestEndpoint,
    ChangeLogListCreateEndpoint,
    ChangeLogReadEndpoint,
)

urlpatterns = [
    path("changelog/", ChangeLogListCreateEndpoint.as_view(), name="changelog"),
    path("changelog/latest/", ChangeLogLatestEndpoint.as_view(), name="changelog-latest"),
    path("changelog/read/", ChangeLogReadEndpoint.as_view(), name="changelog-read"),
    path("changelog/<uuid:pk>/", ChangeLogDetailEndpoint.as_view(), name="changelog"),
]
