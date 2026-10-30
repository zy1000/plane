import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EIssuesStoreType } from "@plane/types";
import { HeaderFilters } from "@/components/issues/filters";
import { HeaderMoreMenu } from "@/components/issues/header-more-menu";
import { IssueExportModal } from "@/components/issues/export/export-modal";
import { stringifyAppliedFilters } from "@/components/issues/export/utils";
import { BugIssueModal } from "@/components/issues/issue-modal/bug-modal";
import { WorkflowApprovalModal } from "@/components/issues/workflow-approval-modal";
import { WorkflowFlowchartModal } from "@/components/issues/workflow-flowchart-modal";
import { PROJECT_DEFECTS_REFRESH_EVENT, useProjectDefects } from "@/hooks/store/use-project-defects";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useProjectWorkflowFlowchart } from "@/hooks/store/use-project-workflow-flowchart";
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkflowApprovals } from "@/hooks/store/use-workflow-approvals";
import { useMultipleSelectStore } from "@/hooks/store/use-multiple-select-store";
import { DefectAnalysisModal } from "./defect-analysis-modal";
import { PROJECT_DEFECT_FILTER_TOGGLE_EVENT } from "./defect-filter-events";

/**
 * 缺陷页的工具栏：搜索 / 布局 / 筛选 / 显示 · 审批 · 新增缺陷 · ⋯。
 * 渲染在视图页签栏右侧（ViewTabsRoot 的 trailing），页头不再单独占一行。
 */
export const ProjectDefectsToolbar = observer(function ProjectDefectsToolbar() {
  const { workspaceSlug, projectId } = useParams();
  const workspaceSlugValue = workspaceSlug?.toString();
  const projectIdValue = projectId?.toString();
  const { t } = useTranslation();
  const { currentProjectDetails } = useProject();
  const { allowPermissions } = useUserPermissions();
  const { issues, issuesFilter } = useIssues(EIssuesStoreType.PROJECT);
  const { selectedEntityIds } = useMultipleSelectStore();
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isFlowchartModalOpen, setIsFlowchartModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const defects = useProjectDefects(workspaceSlugValue, projectIdValue, { includeList: false });
  const { pendingCount, fetchPendingCount } = useWorkflowApprovals(workspaceSlugValue, projectIdValue);
  const {
    flowcharts,
    hasActiveWorkflow,
    isLoading: isFlowchartLoading,
    fetchFlowchart,
  } = useProjectWorkflowFlowchart(workspaceSlugValue, projectIdValue);

  useEffect(() => {
    if (workspaceSlugValue && projectIdValue) {
      fetchFlowchart();
      fetchPendingCount();
    }
  }, [workspaceSlugValue, projectIdValue, fetchFlowchart, fetchPendingCount]);

  const filteredQueryString = useMemo(() => {
    if (!projectIdValue) return "";
    const applied = issuesFilter?.appliedFilters;
    return stringifyAppliedFilters(applied as Record<string, unknown> | undefined);
  }, [issuesFilter, projectIdValue, issuesFilter?.appliedFilters]);

  const canCreateDefect =
    workspaceSlugValue && projectIdValue
      ? allowPermissions(
          [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
          EUserPermissionsLevel.PROJECT,
          workspaceSlugValue,
          projectIdValue
        )
      : false;
  const handleFilterToggle = useCallback(() => {
    if (!projectIdValue) return;
    window.dispatchEvent(
      new CustomEvent(PROJECT_DEFECT_FILTER_TOGGLE_EVENT, {
        detail: { entityId: `${projectIdValue}_defects` },
      })
    );
  }, [projectIdValue]);

  if (!workspaceSlugValue || !projectIdValue) return null;

  return (
    <>
      <div className="hidden items-center gap-2 md:flex">
        <HeaderFilters
          key={`${projectIdValue}_defects`}
          projectId={projectIdValue}
          workspaceSlug={workspaceSlugValue}
          currentProjectDetails={currentProjectDetails}
          scope="defects"
          onFilterToggle={handleFilterToggle}
        />
      </div>
      {canCreateDefect ? (
        <>
          {/* 审批常显：有待办时按钮本身就是红字计数，收进菜单就看不见了 */}
          <Button variant="secondary" size="lg" className="hidden md:flex" onClick={() => setIsApprovalModalOpen(true)}>
            {pendingCount > 0 ? (
              <span style={{ color: "#f87171" }}>待审批·{pendingCount > 99 ? "99+" : pendingCount}</span>
            ) : (
              "审批"
            )}
          </Button>
          <Button variant="primary" size="lg" onClick={() => setIsCreateModalOpen(true)}>
            <span className="hidden sm:inline">新增缺陷</span>
            <span className="sm:hidden">新增</span>
          </Button>
        </>
      ) : null}
      <HeaderMoreMenu
        items={[
          {
            key: "analytics",
            label: t("common.analytics"),
            onClick: () => setIsAnalyticsModalOpen(true),
            shouldRender: canCreateDefect,
          },
          { key: "workflow", label: "工作流", onClick: () => setIsFlowchartModalOpen(true), shouldRender: hasActiveWorkflow },
          { key: "export", label: "导出", onClick: () => setIsExportModalOpen(true), shouldRender: canCreateDefect },
        ]}
      />
      <DefectAnalysisModal
        isOpen={isAnalyticsModalOpen}
        onClose={() => setIsAnalyticsModalOpen(false)}
        workspaceSlug={workspaceSlugValue}
        projectId={projectIdValue}
        projectDetails={currentProjectDetails ?? undefined}
      />
      <BugIssueModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        modalTitle="新增缺陷"
        data={{ project_id: projectIdValue }}
        isProjectSelectionDisabled
        allowedProjectIds={[projectIdValue]}
        onSubmit={async () => {
          setIsCreateModalOpen(false);
          // 刷新缺陷列表（MobX defects scope）与顶部指标条统计
          await issues.fetchIssuesWithExistingPagination(workspaceSlugValue, projectIdValue, "mutation", "defects");
          defects.refetch();
          window.dispatchEvent(new Event(PROJECT_DEFECTS_REFRESH_EVENT));
        }}
      />
      {isFlowchartModalOpen ? (
        <WorkflowFlowchartModal
          isOpen={isFlowchartModalOpen}
          onClose={() => setIsFlowchartModalOpen(false)}
          flowcharts={flowcharts}
          isLoading={isFlowchartLoading}
        />
      ) : null}
      {isApprovalModalOpen ? (
        <WorkflowApprovalModal
          isOpen={isApprovalModalOpen}
          onClose={() => {
            setIsApprovalModalOpen(false);
            fetchPendingCount();
          }}
          workspaceSlug={workspaceSlugValue}
          projectId={projectIdValue}
        />
      ) : null}
      <IssueExportModal
        open={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        workspaceSlug={workspaceSlugValue}
        projectId={projectIdValue}
        selectedIds={selectedEntityIds}
        filteredQueryString={filteredQueryString}
      />
    </>
  );
});
