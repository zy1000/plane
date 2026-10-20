from django.urls import path

from plane.app.views.external_integration import (
    ExternalIntegrationListAPIView,
    ExternalIntegrationSyncAPIView,
    JiandaoyunRiskPushAPIView,
)

urlpatterns = [
    # 简道云「数据推送」回调（免登录，签名校验）：在简道云推送设置里填 http://<host>/api/integrations/jiandaoyun/risks/push/
    path(
        "integrations/jiandaoyun/risks/push/",
        JiandaoyunRiskPushAPIView.as_view(),
        name="jiandaoyun-risk-push",
    ),
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
