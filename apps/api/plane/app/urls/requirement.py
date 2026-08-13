from django.urls import path

from plane.app.views.requirement import (
    CycleRequirementViewSet,
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
    RequirementProjectsViewSet,
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
    path(
        "workspaces/<str:slug>/requirement-libraries/<uuid:library_id>/items/<uuid:pk>/",
        RequirementLibraryItemViewSet.as_view(
            {"patch": "partial_update", "delete": "destroy"}
        ),
        name="requirement-library-item",
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
    # --- 项目需求：迭代 / 发布关联（阶段派生的事实来源） -----------------
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
    # 工作项侧反查：详情属性栏的只读需求芯片供数
    path(
        "workspaces/<str:slug>/projects/<uuid:project_id>/issues/<uuid:issue_id>/requirement-link/",
        RequirementIssueViewSet.as_view({"get": "requirement_link"}),
        name="project-issue-requirement-link",
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
