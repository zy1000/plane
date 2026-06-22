from django.urls import path

from plane.app.views.custom.project_analytics import (
    CustomProjectAdvanceAnalyticsEndpoint,
    ProjectDefectAnalyticsEndpoint,
)
from plane.app.views.custom.simple_api import SimpleTestAPIView, HealthCheckAPIView
from plane.app.views.custom.ldap_sync import LdapUserSyncAPIView

urlpatterns = [
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/analytics/",
        CustomProjectAdvanceAnalyticsEndpoint.as_view(),
        name="analytics",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/defect-analytics/",
        ProjectDefectAnalyticsEndpoint.as_view(),
        name="defect-analytics",
    ),
    # 新增的简单API接口
    path(
        "test/simple/",
        SimpleTestAPIView.as_view(),
        name="simple_test_api",
    ),
    path(
        "test/health/",
        HealthCheckAPIView.as_view(),
        name="health_check_api",
    ),
    # LDAP 人员信息同步（无鉴权，无参数）
    path(
        "ldap/sync-users/",
        LdapUserSyncAPIView.as_view(),
        name="ldap_sync_users",
    ),
]