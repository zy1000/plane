from django.urls import path

from plane.app.views.custom.no_auth_bug_export import PublicBugReportExportAPIView

urlpatterns = [
    path(
        "bug-reports/export-excel/",
        PublicBugReportExportAPIView.as_view(),
        name="public-bug-reports-export-excel",
    ),
]
