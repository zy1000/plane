/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { PROJECT_REQUIREMENT_LINK_MANAGE_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
// assets
import emptyCycle from "@/app/assets/empty-state/cycle.svg?url";
// components
import { EmptyState } from "@/components/common/empty-state";
import { ScopeSubTabs } from "@/components/common/scope-sub-tabs";
import {
  getCycleScopeSubTabStorageKey,
  SCOPE_SUB_TAB_ICONS,
  useScopeSubTab,
} from "@/components/common/use-scope-sub-tab";
import { PageHead } from "@/components/core/page-title";
import useCyclesDetails from "@/components/cycles/active-cycle/use-cycles-details";
import { CycleDetailsSidebar } from "@/components/cycles/analytics-sidebar";
import { CycleRequirementLinkModal } from "@/components/cycles/cycle-overview/cycle-requirement-link-modal";
import { useCycleRequirements } from "@/components/cycles/cycle-overview/use-cycle-requirements";
import { CycleScopeRequirementsPane } from "@/components/cycles/cycle-scope-requirements-pane";
import { CycleLayoutRoot } from "@/components/issues/issue-layouts/roots/cycle-layout-root";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import useLocalStorage from "@/hooks/use-local-storage";
import type { Route } from "./+types/page";

function CycleDetailPage({ params }: Route.ComponentProps) {
  // router
  const router = useAppRouter();
  const { workspaceSlug, projectId, cycleId } = params;
  // store hooks
  const { getCycleById, loader } = useCycle();
  const { getProjectById } = useProject();
  const { allowProjectPermissionKeys } = useUserPermissions();
  // const { issuesFilter } = useIssues(EIssuesStoreType.CYCLE);
  // hooks
  const { setValue, storedValue } = useLocalStorage("cycle_sidebar_collapsed", false);
  const { t } = useTranslation();
  // 二级切换：工作项 | 需求。header 右侧工具条也读这个 key，切到需求时换成需求那套
  const { activeSubTab, setSubTab } = useScopeSubTab(getCycleScopeSubTabStorageKey(cycleId));

  /**
   * 需求列表由页面持有：切换条两侧都要显示条数，所以工作项子页也得知道需求有几条。
   * header 里的「关联需求」用的是同一个 SWR key，那边关联完这里会自己刷新。
   */
  const {
    cycleRequirements,
    requirementsLoading,
    requirementsError,
    linkModalOpen,
    unlinkingRequirementId,
    updatingStageRequirementId,
    openLinkModal,
    closeLinkModal,
    linkRequirements,
    unlinkRequirement,
    updateStage,
  } = useCycleRequirements({ workspaceSlug, projectId, cycleId });

  useCyclesDetails({
    workspaceSlug,
    projectId,
    cycleId,
  });
  // derived values
  const isSidebarCollapsed = storedValue ? (storedValue === true ? true : false) : false;
  const cycle = getCycleById(cycleId);
  const project = getProjectById(projectId);
  const pageTitle = project?.name && cycle?.name ? `${project?.name} - ${cycle?.name}` : undefined;
  // 归档的迭代不允许再改关联
  const canManageRequirements =
    allowProjectPermissionKeys([PROJECT_REQUIREMENT_LINK_MANAGE_PERMISSION_KEY], workspaceSlug, projectId) &&
    !cycle?.archived_at;

  /**
   * Toggles the sidebar
   */
  const toggleSidebar = () => setValue(!isSidebarCollapsed);

  // const activeLayout = issuesFilter?.issueFilters?.displayFilters?.layout;
  return (
    <>
      <PageHead title={pageTitle} />
      {!cycle && !loader ? (
        <EmptyState
          image={emptyCycle}
          title="Cycle does not exist"
          description="The cycle you are looking for does not exist or has been deleted."
          primaryButton={{
            text: "View other cycles",
            onClick: () => router.push(`/${workspaceSlug}/projects/${projectId}/cycles`),
          }}
        />
      ) : (
        <>
          {/* relative 是必需的：侧栏 absolute right-0，没有它会盖到二级切换条上 */}
          <div className="relative flex h-full w-full">
            {/*
              列方向 flex：切换条 flex-shrink-0，内容区 min-h-0 flex-1。
              CycleLayoutRoot 内部是 h-full，要求父容器高度确定 —— 看板垂直不滚，
              父高度变成 auto 会把卡片裁掉且滚不到。
            */}
            <div className="flex h-full w-full flex-col overflow-hidden">
              <ScopeSubTabs
                value={activeSubTab}
                onChange={setSubTab}
                tabs={[
                  {
                    key: "work-items",
                    label: t("project_requirements.scope_tabs.work_items"),
                    icon: SCOPE_SUB_TAB_ICONS["work-items"],
                    // 迭代详情自带的总数，与工作项列表是否已加载无关
                    count: cycle?.total_issues,
                  },
                  {
                    key: "requirements",
                    label: t("project_requirements.scope_tabs.requirements"),
                    icon: SCOPE_SUB_TAB_ICONS.requirements,
                    count: requirementsLoading ? undefined : cycleRequirements.length,
                  },
                ]}
              />
              <div className="min-h-0 flex-1">
                {activeSubTab === "requirements" ? (
                  <CycleScopeRequirementsPane
                    workspaceSlug={workspaceSlug}
                    projectId={projectId}
                    requirements={cycleRequirements}
                    isLoading={requirementsLoading}
                    error={requirementsError}
                    canManage={canManageRequirements}
                    unlinkingRequirementId={unlinkingRequirementId}
                    updatingStageRequirementId={updatingStageRequirementId}
                    onOpenLinkModal={openLinkModal}
                    onUnlink={unlinkRequirement}
                    onStageChange={(requirementId, stage) => void updateStage(requirementId, stage)}
                  />
                ) : (
                  <CycleLayoutRoot />
                )}
              </div>
            </div>
            {!isSidebarCollapsed && (
              <div
                className={cn(
                  "vertical-scrollbar absolute right-0 z-13 flex scrollbar-sm h-full w-[21.5rem] flex-shrink-0 flex-col gap-3.5 overflow-y-auto border-l border-subtle bg-surface-1 px-4 shadow-raised-200 duration-300"
                )}
              >
                <CycleDetailsSidebar
                  handleClose={toggleSidebar}
                  cycleId={cycleId}
                  projectId={projectId}
                  workspaceSlug={workspaceSlug}
                />
              </div>
            )}
          </div>

          {/*
            空状态里的「关联需求」用的弹窗。header 上那颗常驻按钮有自己的一份 ——
            弹窗关着时不发任何请求，两份互不影响，而它们提交后走的是同一个 SWR key，
            无论从哪边关联，列表都会刷新。这比为了共用一份状态在两棵渲染树之间
            搭一条通道便宜得多。
          */}
          <CycleRequirementLinkModal
            isOpen={linkModalOpen}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            cycleId={cycleId}
            handleClose={closeLinkModal}
            onSubmit={linkRequirements}
          />
        </>
      )}
    </>
  );
}

export default observer(CycleDetailPage);
