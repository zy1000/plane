from django.urls import path, include
from rest_framework.routers import SimpleRouter

from plane.app.views import (
    PlanAPIView,
    RepositoryAPIView,
    CaseModuleAPIView,
    LabelAPIView,
    CaseAPIView,
    EnumDataAPIView,
    CaseAttachmentV2Endpoint,
    CaseDetailAPIView,
    PlanView,
    PlanModuleAPIView,
    PlanCaseAPIView,
    PlanModuleCountAPIView,
)
from plane.app.views.qa.case import (
    CaseAssetAPIView,
    CaseIssueWithType,
    TestCaseCommentAPIView,
    TestCaseActivityAPIView,
    CaseAPI,
    CaseLabelAPIView,
    CaseModuleView,
)
from plane.app.views.qa.case_requirement import (
    CaseLinkableRequirementAPIView,
    CaseRequirementAPIView,
)
from plane.app.views.qa.case_version import (
    CaseVersionAPIView,
    CaseVersionCompareAPIView,
)
from plane.app.views.qa.module import CaseModuleCountAPIView, CaseModuleDetailAPIView
from plane.app.views.qa.plan import (
    PlanModuleDetailAPIView,
    PlanListAPIView,
    CaseMindmapAPIView,
    UserCaseModuleTreeAPIView,
)
from plane.app.views.qa.review import (
    ReviewModuleAPIView,
    ReviewModuleDetailAPIView,
    CaseReviewAPIView,
    CaseReviewView,
    ReviewListAPIView,
)
from plane.app.views.qa.execution_file import PlanCaseRecordFileAPI
from plane.app.views.qa.report import TestReportAPIView, ReportView
from plane.app.views.qa.template import (
    TemplateCaseAPIView,
    TemplateCaseIdsAPIView,
    TemplateCaseImportAPIView,
)

router = SimpleRouter()
router.register("review", CaseReviewView, basename="review")
router.register("plan", PlanView, basename="plan")
router.register("case", CaseAPI, basename="case")
router.register("execution-file", PlanCaseRecordFileAPI, basename="execution-file")
router.register("report", ReportView, basename="report")

urlpatterns = [
    path(
        "users/me/test/module-tree/",
        UserCaseModuleTreeAPIView.as_view(),
        name="user-test-module-tree",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/test/plane/",
        PlanAPIView.as_view(),
        name="test-plan",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/test/report/",
        TestReportAPIView.as_view(),
        name="test-report",
    ),
    path(
        "workspaces/<str:slug>/test/plan/list/",
        PlanListAPIView.as_view(),
        name="test-plan",
    ),
    path(
        "workspaces/<str:slug>/test/plane/case/",
        PlanCaseAPIView.as_view(),
        name="test-plan",
    ),
    path(
        "workspaces/<str:slug>/test/plan/module/",
        PlanModuleAPIView.as_view(),
        name="test-plan",
    ),
    path(
        "workspaces/<str:slug>/test/plan/module/<uuid:module_id>/",
        PlanModuleDetailAPIView.as_view(),
        name="test-plan-module-detail",
    ),
    path(
        "workspaces/<str:slug>/test/plan/module/count/",
        PlanModuleCountAPIView.as_view(),
        name="test-plan",
    ),
    path(
        "workspaces/<str:slug>/test/plane-assignee/",
        PlanAPIView.as_view(),
        name="test-plan",
    ),
    path(
        "workspaces/<str:slug>/test/module/",
        CaseModuleAPIView.as_view(),
        name="test-case",
    ),
    path(
        "workspaces/<str:slug>/test/module/copy/",
        CaseModuleView.as_view({"post": "copy"}),
        name="test-case-module-copy",
    ),
    path(
        "workspaces/<str:slug>/test/module/<uuid:module_id>/",
        CaseModuleDetailAPIView.as_view(),
        name="test-case-module-detail",
    ),
    path(
        "workspaces/<str:slug>/test/module/count/",
        CaseModuleCountAPIView.as_view(),
        name="test-case",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/test/case/",
        CaseAPIView.as_view(),
        name="test-case",
    ),
    # 用例侧的需求关联。项目作用域（而非 workspace 级的 CaseAPI）是为了吃现成的
    # QA_CASE_* 权限 —— 另一扇门在产品侧要 can_edit_product_requirements，
    # 这边裸奔就成了绕过口。见 views/qa/case_requirement.py
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/test/case/<uuid:case_id>/requirements/",
        CaseRequirementAPIView.as_view(),
        name="test-case-requirements",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/test/case/<uuid:case_id>/linkable-requirements/",
        CaseLinkableRequirementAPIView.as_view(),
        name="test-case-linkable-requirements",
    ),
    path(
        "workspaces/<str:slug>/test/case/mindmap/",
        CaseMindmapAPIView.as_view(),
        name="test-case-mindmap",
    ),
    path(
        "workspaces/<str:slug>/test/case/issues/",
        CaseIssueWithType.as_view(),
        name="test-case",
    ),
    path(
        "workspaces/<str:slug>/test/case/label/",
        LabelAPIView.as_view(),
        name="test-case",
    ),
    path(
        "workspaces/<str:slug>/test/case/version/",
        CaseVersionAPIView.as_view(),
        name="test-case",
    ),
    path(
        "workspaces/<str:slug>/test/case/version/compare/",
        CaseVersionCompareAPIView.as_view(),
        name="test-case",
    ),
    path(
        "workspaces/<str:slug>/test/case/<uuid:case_id>/",
        CaseDetailAPIView.as_view(),
        name="test-case",
    ),
    path(
        "workspaces/<str:slug>/test/case/<uuid:case_id>/assets/",
        CaseAssetAPIView.as_view(),
        name="test-case",
    ),
    path(
        "workspaces/<str:slug>/test/repository/",
        RepositoryAPIView.as_view(),
        name="test-repository",
    ),
    path(
        "workspaces/<str:slug>/test/template-case/",
        TemplateCaseAPIView.as_view(),
        name="test-template-case",
    ),
    path(
        "workspaces/<str:slug>/test/template-case/import/",
        TemplateCaseImportAPIView.as_view(),
        name="test-template-case-import",
    ),
    path(
        "workspaces/<str:slug>/test/template-case-ids/",
        TemplateCaseIdsAPIView.as_view(),
        name="test-template-case-ids",
    ),
    path(
        "workspaces/<str:slug>/test/enums/",
        EnumDataAPIView.as_view(),
        name="test-repository-enums",
    ),
    path(
        "workspaces/<str:slug>/test/review/module/",
        ReviewModuleAPIView.as_view(),
        name="test-repository-enums",
    ),
    path(
        "workspaces/<str:slug>/test/review/module/<uuid:module_id>/",
        ReviewModuleDetailAPIView.as_view(),
        name="test-review-module-detail",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/test/review/",
        CaseReviewAPIView.as_view(),
        name="test-repository-enums",
    ),
    path(
        "workspaces/<str:slug>/test/review/list/",
        ReviewListAPIView.as_view(),
        name="test-repository-enums",
    ),
    path("workspaces/<str:slug>/test/", include(router.urls)),
    path(
        "workspaces/<str:slug>/cases/<uuid:case_id>/attachments/<uuid:pk>/",
        CaseAttachmentV2Endpoint.as_view(),
        name="case-attachments-v2",
    ),
    path(
        "workspaces/<str:slug>/test/comments/",
        TestCaseCommentAPIView.as_view(),
        name="test-comments",
    ),
    path(
        "workspaces/<str:slug>/test/comments/<uuid:id>/",
        TestCaseCommentAPIView.as_view(),
        name="test-comments-detail",
    ),
    path(
        "workspaces/<str:slug>/test/case/<uuid:case_id>/activities/",
        TestCaseActivityAPIView.as_view(),
        name="test-case-activities",
    ),
]
