from django.urls import path

from plane.app.views.requirement import (
    CycleRequirementViewSet,
    IssueRequirementViewSet,
    ProjectRequirementModuleTreeAPIView,
    ProjectRequirementViewSet,
    ReleaseRequirementViewSet,
    RequirementApprovalInboxAPIView,
    RequirementBaselineViewSet,
    RequirementConfigurationAPIView,
    RequirementChangeItemViewSet,
    RequirementChangeRequestViewSet,
    RequirementChangeTrailViewSet,
    RequirementIssueViewSet,
    RequirementLibraryConfigurationAPIView,
    RequirementLibraryItemViewSet,
    RequirementLibraryViewSet,
    RequirementModuleAPIView,
    RequirementModuleDetailAPIView,
    RequirementProjectsViewSet,
    RequirementTestCaseViewSet,
    RequirementTypeConfigurationAPIView,
    RequirementTypeViewSet,
    RequirementVersionViewSet,
    RequirementViewSet,
)


urlpatterns = [
    path(
        "workspaces/<str:slug>/requirement-types/",
        RequirementTypeViewSet.as_view({"get": "list", "post": "create"}),
        name="requirement-types",
    ),
    path(
        "workspaces/<str:slug>/requirement-types/<uuid:pk>/",
        RequirementTypeViewSet.as_view(
            {
                "get": "retrieve",
                "put": "update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="requirement-type-detail",
    ),
    path(
        "workspaces/<str:slug>/requirement-types/<uuid:pk>/configuration/",
        RequirementTypeConfigurationAPIView.as_view(),
        name="requirement-type-configuration",
    ),
    path(
        "workspaces/<str:slug>/requirement-approvals/",
        RequirementApprovalInboxAPIView.as_view(),
        name="requirement-approval-inbox",
    ),
    path(
        "workspaces/<str:slug>/requirement-libraries/",
        RequirementLibraryViewSet.as_view({"get": "list", "post": "create"}),
        name="requirement-libraries",
    ),
    path(
        "workspaces/<str:slug>/requirement-libraries/<uuid:pk>/",
        RequirementLibraryViewSet.as_view(
            {
                "get": "retrieve",
                "put": "update",
                "patch": "partial_update",
                "delete": "destroy",
            }
        ),
        name="requirement-library-detail",
    ),
    path(
        "workspaces/<str:slug>/requirement-libraries/<uuid:library_id>/configuration/",
        RequirementLibraryConfigurationAPIView.as_view(),
        name="requirement-library-configuration",
    ),
    path(
        "workspaces/<str:slug>/requirement-libraries/<uuid:library_id>/items/",
        RequirementLibraryItemViewSet.as_view({"get": "list", "post": "create"}),
        name="requirement-library-items",
    ),
    path(
        "workspaces/<str:slug>/requirement-libraries/<uuid:library_id>/items/bulk-delete/",
        RequirementLibraryItemViewSet.as_view({"post": "bulk_destroy"}),
        name="requirement-library-item-bulk-delete",
    ),
    path(
        "workspaces/<str:slug>/requirement-libraries/<uuid:library_id>/items/bulk-save/",
        RequirementLibraryItemViewSet.as_view({"post": "bulk_save"}),
        name="requirement-library-item-bulk-save",
    ),
    # Excel 导入 / 导出。`excel/` 前缀是为了避开产品侧已被「从标准库导入」占用的
    # `.../requirements/import/`，两侧保持同名以便前端一套 service 分派
    path(
        "workspaces/<str:slug>/requirement-libraries/<uuid:library_id>/items/excel/",
        RequirementLibraryItemViewSet.as_view({"get": "export_excel"}),
        name="requirement-library-item-excel-export",
    ),
    path(
        "workspaces/<str:slug>/requirement-libraries/<uuid:library_id>/items/excel/validate/",
        RequirementLibraryItemViewSet.as_view({"post": "validate_excel_import"}),
        name="requirement-library-item-excel-validate",
    ),
    path(
        "workspaces/<str:slug>/requirement-libraries/<uuid:library_id>/items/excel/import/",
        RequirementLibraryItemViewSet.as_view({"post": "import_excel"}),
        name="requirement-library-item-excel-import",
    ),
    path(
        "workspaces/<str:slug>/requirement-libraries/<uuid:library_id>/items/<uuid:pk>/",
        RequirementLibraryItemViewSet.as_view(
            {"patch": "partial_update", "delete": "destroy"}
        ),
        name="requirement-library-item",
    ),
    # 需求级附件多选打 ZIP；单个下载走工作区级资产端点，不在这里
    path(
        "workspaces/<str:slug>/requirement-libraries/<uuid:library_id>/items/<uuid:pk>/attachments/batch-download/",
        RequirementLibraryItemViewSet.as_view({"get": "batch_download_attachments"}),
        name="requirement-library-item-attachments-batch-download",
    ),
    # --- 需求模块：库 / 产品各一棵独立的树 -------------------------------
    path(
        "workspaces/<str:slug>/requirement-libraries/<uuid:library_id>/modules/",
        RequirementModuleAPIView.as_view(),
        name="requirement-library-modules",
    ),
    path(
        "workspaces/<str:slug>/requirement-libraries/<uuid:library_id>/modules/<uuid:module_id>/",
        RequirementModuleDetailAPIView.as_view(),
        name="requirement-library-module-detail",
    ),
    # 批量挂靠 / 移动条目到模块（module_id 显式传 null = 移回「全部」）
    path(
        "workspaces/<str:slug>/requirement-libraries/<uuid:library_id>/items/set-module/",
        RequirementLibraryItemViewSet.as_view({"post": "set_module"}),
        name="requirement-library-item-set-module",
    ),
    # --- 产品需求：条目本身 ---------------------------------------------
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/",
        RequirementViewSet.as_view({"get": "list", "post": "create"}),
        name="product-requirements",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/bulk-delete/",
        RequirementViewSet.as_view({"post": "bulk_destroy"}),
        name="product-requirement-bulk-delete",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/bulk-save/",
        RequirementViewSet.as_view({"post": "bulk_save"}),
        name="product-requirement-bulk-save",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/import/",
        RequirementViewSet.as_view({"post": "import_from_library"}),
        name="product-requirement-import",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/importable-library-items/",
        RequirementViewSet.as_view({"get": "importable_library_items"}),
        name="product-requirement-importable-library-items",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/excel/",
        RequirementViewSet.as_view({"get": "export_excel"}),
        name="product-requirement-excel-export",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/excel/validate/",
        RequirementViewSet.as_view({"post": "validate_excel_import"}),
        name="product-requirement-excel-validate",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/excel/import/",
        RequirementViewSet.as_view({"post": "import_excel"}),
        name="product-requirement-excel-import",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-modules/",
        RequirementModuleAPIView.as_view(),
        name="product-requirement-modules",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-modules/<uuid:module_id>/",
        RequirementModuleDetailAPIView.as_view(),
        name="product-requirement-module-detail",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/set-module/",
        RequirementViewSet.as_view({"post": "set_module"}),
        name="product-requirement-set-module",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/<uuid:pk>/",
        RequirementViewSet.as_view(
            {"patch": "partial_update", "delete": "destroy"}
        ),
        name="product-requirement-item",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/<uuid:pk>/rollback/",
        RequirementViewSet.as_view({"post": "rollback"}),
        name="product-requirement-rollback",
    ),
    # 需求级交付状态的独立写入口（不走内容 PATCH：不带 version、评审中也能改）
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/<uuid:pk>/status/",
        RequirementViewSet.as_view({"patch": "set_status"}),
        name="product-requirement-status",
    ),
    # 需求级附件多选打 ZIP；单个下载走工作区级资产端点，不在这里
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/<uuid:pk>/attachments/batch-download/",
        RequirementViewSet.as_view({"get": "batch_download_attachments"}),
        name="product-requirement-attachments-batch-download",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/<uuid:requirement_id>/trail/",
        RequirementChangeTrailViewSet.as_view({"get": "list"}),
        name="product-requirement-trail",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/<uuid:requirement_id>/versions/",
        RequirementVersionViewSet.as_view({"get": "list"}),
        name="product-requirement-versions",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/<uuid:requirement_id>/projects/",
        RequirementProjectsViewSet.as_view({"post": "create"}),
        name="product-requirement-projects",
    ),
    # --- 项目需求：引用产品需求 -------------------------------------------
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/requirements/",
        ProjectRequirementViewSet.as_view({"get": "list", "post": "create"}),
        name="project-requirements",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/linkable-requirements/",
        ProjectRequirementViewSet.as_view({"get": "linkable"}),
        name="project-linkable-requirements",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/requirement-configuration/",
        ProjectRequirementViewSet.as_view({"get": "configuration"}),
        name="project-requirement-configuration",
    ),
    # 项目需求页左侧的只读模块树（模块归产品，项目不落模块字段）
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/requirement-modules/",
        ProjectRequirementModuleTreeAPIView.as_view(),
        name="project-requirement-modules",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/requirements/<uuid:requirement_id>/",
        ProjectRequirementViewSet.as_view(
            {"patch": "partial_update", "delete": "destroy"}
        ),
        name="project-requirement-item",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/requirements/<uuid:requirement_id>/changes/",
        ProjectRequirementViewSet.as_view({"post": "submit_change"}),
        name="project-requirement-changes",
    ),
    # --- 项目需求：迭代 / 发布关联（圈定范围） ---------------------------
    # URL kwarg 统一叫 container_id：两套端点共用 BaseRequirementContainerViewSet，
    # 方法签名一致；kwarg 名不出现在 URL 文本里，对客户端不可见
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/<uuid:container_id>/requirements/",
        CycleRequirementViewSet.as_view({"get": "list", "post": "create"}),
        name="project-cycle-requirements",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/cycles/<uuid:container_id>/requirements/<uuid:requirement_id>/",
        CycleRequirementViewSet.as_view({"delete": "destroy"}),
        name="project-cycle-requirement-item",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/<uuid:container_id>/requirements/",
        ReleaseRequirementViewSet.as_view({"get": "list", "post": "create"}),
        name="project-release-requirements",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/releases/<uuid:container_id>/requirements/<uuid:requirement_id>/",
        ReleaseRequirementViewSet.as_view({"delete": "destroy"}),
        name="project-release-requirement-item",
    ),
    # --- 项目需求：工作项关联（研发段阶段派生的事实来源） -----------------
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/requirements/<uuid:requirement_id>/issues/",
        RequirementIssueViewSet.as_view({"get": "list", "post": "create"}),
        name="project-requirement-issues",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/requirements/<uuid:requirement_id>/issues/<uuid:issue_id>/",
        RequirementIssueViewSet.as_view({"delete": "destroy"}),
        name="project-requirement-issue-item",
    ),
    # 工作项侧：详情页「关联需求」区块的读写（复用容器基类，参数名必须是 container_id）
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:container_id>/requirements/",
        IssueRequirementViewSet.as_view({"get": "list", "post": "create"}),
        name="project-issue-requirements",
    ),
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:container_id>/requirements/<uuid:requirement_id>/",
        IssueRequirementViewSet.as_view({"delete": "destroy"}),
        name="project-issue-requirement-item",
    ),
    # --- 产品需求：测试用例关联 ------------------------------------------
    # 产品作用域而非项目作用域：用例的 project 可空（共享用例库），且一条需求的关联
    # 用例横跨它进过的所有项目 —— 按单个项目切开表达不出来。见 views/requirement/test_case.py
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/<uuid:requirement_id>/test-cases/",
        RequirementTestCaseViewSet.as_view({"get": "list", "post": "create"}),
        name="product-requirement-test-cases",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/<uuid:requirement_id>/test-cases/<uuid:case_id>/",
        RequirementTestCaseViewSet.as_view({"delete": "destroy"}),
        name="product-requirement-test-case-item",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirements/<uuid:requirement_id>/linkable-test-cases/",
        RequirementTestCaseViewSet.as_view({"get": "linkable"}),
        name="product-requirement-linkable-test-cases",
    ),
    # --- 产品需求：审批配置与变更单 -------------------------------------
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-configuration/",
        RequirementConfigurationAPIView.as_view(),
        name="requirement-configuration",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-change-requests/",
        RequirementChangeRequestViewSet.as_view({"get": "list", "post": "create"}),
        name="requirement-change-requests",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-change-requests/<uuid:pk>/",
        RequirementChangeRequestViewSet.as_view({"get": "retrieve"}),
        name="requirement-change-request-detail",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-change-requests/<uuid:pk>/items/",
        RequirementChangeItemViewSet.as_view({"get": "list"}),
        name="requirement-change-request-items",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-change-requests/<uuid:pk>/act/",
        RequirementChangeRequestViewSet.as_view({"post": "act"}),
        name="requirement-change-request-act",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-change-requests/<uuid:pk>/cancel/",
        RequirementChangeRequestViewSet.as_view({"post": "cancel"}),
        name="requirement-change-request-cancel",
    ),
    # --- 产品需求：基线快照 ---------------------------------------------
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-baselines/",
        RequirementBaselineViewSet.as_view({"get": "list", "post": "create"}),
        name="requirement-baselines",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-baselines/<uuid:pk>/",
        RequirementBaselineViewSet.as_view(
            {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
        ),
        name="requirement-baseline-detail",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-baselines/<uuid:pk>/requirements/",
        RequirementBaselineViewSet.as_view({"get": "requirements"}),
        name="requirement-baseline-requirements",
    ),
    path(
        "workspaces/<str:slug>/products/<uuid:product_id>/requirement-baselines/<uuid:pk>/compare/",
        RequirementBaselineViewSet.as_view({"get": "compare"}),
        name="requirement-baseline-compare",
    ),
]
