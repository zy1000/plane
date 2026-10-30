/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
// plane imports
import { EUserPermissions, EUserPermissionsLevel, WORK_ITEM_TRACKER_ELEMENTS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EIssuesStoreType } from "@plane/types";
// components
import { WorkItemsModal } from "@/components/analytics/work-items/modal";
import { HeaderFilters } from "@/components/issues/filters";
import { HeaderMoreMenu } from "@/components/issues/header-more-menu";
import { WorkflowApprovalModal } from "@/components/issues/workflow-approval-modal";
import { WorkflowFlowchartModal } from "@/components/issues/workflow-flowchart-modal";
import { IssueExportModal } from "@/components/issues/export/export-modal";
import { stringifyAppliedFilters } from "@/components/issues/export/utils";
import { ImportIssuesModal } from "@/components/issues/import";
import { useEffect, useMemo, useState } from "react";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useIssues } from "@/hooks/store/use-issues";
import { useMultipleSelectStore } from "@/hooks/store/use-multiple-select-store";
import { useLabel } from "@/hooks/store/use-label";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkflowApprovals } from "@/hooks/store/use-workflow-approvals";
import { useProjectWorkflowFlowchart } from "@/hooks/store/use-project-workflow-flowchart";
import { getProjectIssueScopeFromPathname } from "@/store/issue/project";

/**
 * 工作项页的工具栏：搜索 / 布局 / 筛选 / 显示 · 审批 · 添加工作项 · ⋯。
 * 渲染在视图页签栏右侧（ViewTabsRoot 的 trailing），页头不再单独占一行。
 */
export const IssuesHeaderActions = observer(function IssuesHeaderActions() {
  // router
  const { workspaceSlug, projectId } = useParams();
  const pathname = usePathname();
  const scope = getProjectIssueScopeFromPathname(pathname);
  const { issues, issuesFilter } = useIssues(EIssuesStoreType.PROJECT);
  const { selectedEntityIds } = useMultipleSelectStore();
  const { fetchProjectLabels } = useLabel();
  // i18n
  const { t } = useTranslation();

  const refreshAfterImport = async () => {
    if (workspaceSlug && projectId) {
      await fetchProjectLabels(workspaceSlug.toString(), projectId.toString());
    }
    await issues.fetchIssuesWithExistingPagination(
      workspaceSlug?.toString(),
      projectId?.toString(),
      "mutation",
      scope
    );
  };

  const { currentProjectDetails } = useProject();

  const { toggleCreateIssueModal } = useCommandPalette();
  const { allowPermissions } = useUserPermissions();

  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isFlowchartModalOpen, setIsFlowchartModalOpen] = useState(false);

  const { pendingCount, fetchPendingCount } = useWorkflowApprovals(
    workspaceSlug?.toString(),
    projectId?.toString()
  );

  // 工作流流程图：仅当项目存在启用中的工作流时展示入口，所有项目成员均可查看
  const {
    flowcharts,
    hasActiveWorkflow,
    isLoading: isFlowchartLoading,
    fetchFlowchart,
  } = useProjectWorkflowFlowchart(workspaceSlug?.toString(), projectId?.toString());

  // 页面加载时拉取待审批数量（用于红点）
  useEffect(() => {
    if (workspaceSlug && projectId) {
      fetchPendingCount();
    }
  }, [workspaceSlug, projectId, fetchPendingCount]);

  // 页面加载时拉取启用中的工作流流程图（用于入口可见性与弹框渲染）
  useEffect(() => {
    if (workspaceSlug && projectId) {
      fetchFlowchart();
    }
  }, [workspaceSlug, projectId, fetchFlowchart]);

  const filteredQueryString = useMemo(() => {
    if (!projectId) return "";
    const applied = issuesFilter?.appliedFilters;
    return stringifyAppliedFilters(applied as Record<string, unknown> | undefined);
  }, [issuesFilter, projectId, issuesFilter?.appliedFilters]);

  const canUserCreateIssue = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

  return (
    <>
      <div className="hidden items-center gap-2 md:flex">
        <HeaderFilters projectId={projectId} currentProjectDetails={currentProjectDetails} workspaceSlug={workspaceSlug} />
      </div>
      {canUserCreateIssue && (
        <>
          {/* 审批常显：有待办时按钮本身就是红字计数，收进菜单就看不见了 */}
          <Button variant="secondary" size="lg" className="hidden md:flex" onClick={() => setIsApprovalModalOpen(true)}>
            {pendingCount > 0 ? (
              <span style={{ color: "#f87171" }}>待审批·{pendingCount > 99 ? "99+" : pendingCount}</span>
            ) : (
              "审批"
            )}
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={() => {
              toggleCreateIssueModal(true, EIssuesStoreType.PROJECT);
            }}
            data-ph-element={WORK_ITEM_TRACKER_ELEMENTS.HEADER_ADD_BUTTON.WORK_ITEMS}
          >
            <div className="block sm:hidden">{t("issue.label", { count: 1 })}</div>
            <div className="hidden sm:block">{t("issue.add.label")}</div>
          </Button>
        </>
      )}
      <HeaderMoreMenu
        items={[
          {
            key: "analytics",
            label: t("common.analytics"),
            onClick: () => setIsAnalyticsModalOpen(true),
            shouldRender: canUserCreateIssue,
          },
          { key: "workflow", label: "工作流", onClick: () => setIsFlowchartModalOpen(true), shouldRender: hasActiveWorkflow },
          { key: "import", label: "导入", onClick: () => setIsImportModalOpen(true), shouldRender: canUserCreateIssue },
          { key: "export", label: "导出", onClick: () => setIsExportModalOpen(true), shouldRender: canUserCreateIssue },
        ]}
      />
      <WorkItemsModal
        isOpen={isAnalyticsModalOpen}
        onClose={() => setIsAnalyticsModalOpen(false)}
        projectDetails={currentProjectDetails ?? undefined}
      />
      {isApprovalModalOpen && workspaceSlug && projectId && (
        <WorkflowApprovalModal
          isOpen={isApprovalModalOpen}
          onClose={() => {
            setIsApprovalModalOpen(false);
            fetchPendingCount();
          }}
          workspaceSlug={workspaceSlug.toString()}
          projectId={projectId.toString()}
        />
      )}
      {isFlowchartModalOpen && (
        <WorkflowFlowchartModal
          isOpen={isFlowchartModalOpen}
          onClose={() => setIsFlowchartModalOpen(false)}
          flowcharts={flowcharts}
          isLoading={isFlowchartLoading}
        />
      )}
      {workspaceSlug && projectId && (
        <IssueExportModal
          open={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          workspaceSlug={workspaceSlug.toString()}
          projectId={projectId.toString()}
          selectedIds={selectedEntityIds}
          filteredQueryString={filteredQueryString}
        />
      )}
      {workspaceSlug && projectId && (
        <ImportIssuesModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          workspaceSlug={workspaceSlug.toString()}
          projectId={projectId.toString()}
          onSuccess={refreshAfterImport}
        />
      )}
    </>
  );
});
