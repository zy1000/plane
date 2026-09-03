from django.urls import path

from plane.app.views.external_integration import (
    ExternalIntegrationListAPIView,
    ExternalIntegrationSyncAPIView,
)

urlpatterns = [
    path(
        "workspaces/<str:slug>/external-integrations/",
        ExternalIntegrationListAPIView.as_view(),
        name="external-integrations",
    ),
    path(
        "workspaces/<str:slug>/external-integrations/<str:key>/sync/",
        ExternalIntegrationSyncAPIView.as_view(),
        name="external-integration-sync",
    ),
]
