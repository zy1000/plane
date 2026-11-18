import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ChevronDown, Layers, PanelRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { getButtonStyling } from "@plane/propel/button";
import { IconButton } from "@plane/propel/icon-button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ICustomSearchSelectOption, ISearchIssueResponse } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { BreadcrumbNavigationSearchDropdown, Breadcrumbs, CustomMenu, Header } from "@plane/ui";
import { cn } from "@plane/utils";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { AddWorkItemsModal } from "@/components/core/modals/add-work-items-modal";
import { HeaderFilters } from "@/components/issues/filters";
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useProjectStage } from "@/hooks/store/use-project-stage";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import useLocalStorage from "@/hooks/use-local-storage";
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";
import { IssueService } from "@/services/issue";
import { PROJECT_STAGE_SIDEBAR_COLLAPSED_KEY, getProjectStageFilterEntityId } from "./constants";

const I18N = "project_stage";
const STAGE_SCOPE = "stage" as const;

const issueService = new IssueService();

/**
 * 阶段详情页的页头：面包屑「阶段 › 阶段名（可切换）」+ 工作项数，右侧是搜索 / 布局 / 筛选 / 显示 ·
 * 添加工作项 · 阶段信息栏开关。
 *
 * 「添加工作项」两条路：新建（弹窗按路由里的阶段 id 默认带上阶段）和添加已有（把选中的工作项的阶段
 * 改成当前阶段；阶段是单选，已挂别的阶段的会从原阶段移走）。
 *
 * 由正文（ProjectStageDetailRoot）在筛选实例建好之后渲染：搜索框订阅筛选实例，放进路由 layout
 * 先于正文挂载的话，实例创建那一刻会在别的组件渲染途中更新它。
 */
export const ProjectStageDetailHeader = observer(function ProjectStageDetailHeader({
  onFilterToggle,
}: {
  /** 「筛选」按钮：切换正文里筛选条的显隐 */
  onFilterToggle: () => void;
}) {
  const router = useAppRouter();
  const params = useParams();
  const workspaceSlug = params.workspaceSlug?.toString();
  const projectId = params.projectId?.toString();
  const stageId = params.stageId?.toString();
  const { t } = useTranslation();
  const { currentProjectDetails, loader } = useProject();
  const { getStageById, getProjectStageOptions, refetchStages } = useProjectStage();
  const { issues } = useIssues(EIssuesStoreType.PROJECT);
  const { toggleCreateIssueModal } = useCommandPalette();
  const { allowIssuePermission } = useUserPermissions();
  const { setValue, storedValue } = useLocalStorage(PROJECT_STAGE_SIDEBAR_COLLAPSED_KEY, "false");
  const [isAddExistingOpen, setIsAddExistingOpen] = useState(false);

  const isSidebarCollapsed = storedValue === "true";
  const stage = stageId ? getStageById(stageId) : null;
  // 新建要创建权限；添加已有只是改已有工作项的阶段，看编辑权限
  const canCreateWorkItem = allowIssuePermission("create", undefined, workspaceSlug, projectId);
  const canAddExisting = allowIssuePermission("edit", undefined, workspaceSlug, projectId);
  const canAddWorkItems = canCreateWorkItem || canAddExisting;
  const workItemsCount = issues.getGroupIssueCount(undefined, undefined, false);

  const switcherOptions: ICustomSearchSelectOption[] = projectId
    ? getProjectStageOptions(projectId).map(({ stage: option, depth }) => ({
        value: option.id,
        query: `${option.name} ${option.code}`,
        // 子阶段用「└」缩进，同阶段下拉
        content: (
          <div className="flex items-center gap-1 text-secondary" style={{ paddingLeft: depth * 12 }}>
            {depth > 0 && <span className="text-placeholder">└</span>}
            <span className="truncate">{option.name}</span>
          </div>
        ),
      }))
    : [];

  const handleAddExisting = async (data: ISearchIssueResponse[]) => {
    if (!workspaceSlug || !projectId || !stageId || data.length === 0) return;
    const issueIds = data.map((item) => item.id);
    try {
      const response = await issueService.batchUpdateIssues(workspaceSlug, projectId, {
        issue_ids: issueIds,
        properties: { stage_id: stageId },
      });
      const failed = response?.blocked_issues?.length ?? 0;
      const added = issueIds.length - failed;
      setToast(
        failed > 0
          ? {
              type: TOAST_TYPE.WARNING,
              title: t(`${I18N}.detail.add_partial`, { count: added, failed }),
              message: response?.blocked_issues?.[0]?.error,
            }
          : { type: TOAST_TYPE.SUCCESS, title: t(`${I18N}.detail.add_success`, { count: added }) }
      );
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t(`${I18N}.detail.add_error`) });
      return;
    }
    // 列表与阶段统计（信息栏的进度、分布）都要跟上
    void issues.fetchIssuesWithExistingPagination(workspaceSlug, projectId, "mutation", STAGE_SCOPE);
    void refetchStages(workspaceSlug, projectId);
  };

  if (!workspaceSlug || !projectId || !stageId) return null;

  return (
    <>
      <AddWorkItemsModal
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        kind="stage"
        targetId={stageId}
        isOpen={isAddExistingOpen}
        handleClose={() => setIsAddExistingOpen(false)}
        handleOnSubmit={handleAddExisting}
      />
      <Header>
        <Header.LeftItem>
          <div className="flex items-center gap-2">
            <Breadcrumbs onBack={router.back} isLoading={loader === "init-loader"}>
              <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug} projectId={projectId} />
              <Breadcrumbs.Item
                component={
                  <BreadcrumbLink
                    label={t("sidebar.stages")}
                    href={`/${workspaceSlug}/projects/${projectId}/stages/`}
                    icon={<Layers className="h-4 w-4 text-tertiary" />}
                  />
                }
              />
              <Breadcrumbs.Item
                component={
                  <BreadcrumbNavigationSearchDropdown
                    selectedItem={stageId}
                    navigationItems={switcherOptions}
                    onChange={(value: string) => {
                      router.push(`/${workspaceSlug}/projects/${projectId}/stages/${value}`);
                    }}
                    title={stage?.name}
                    icon={<Layers className="h-4 w-4 flex-shrink-0 text-tertiary" />}
                    isLast
                  />
                }
                isLast
              />
            </Breadcrumbs>
            {workItemsCount && workItemsCount > 0 ? (
              <span className="flex flex-shrink-0 cursor-default items-center justify-center rounded-xl bg-accent-primary/20 px-2 text-center text-11 font-semibold text-accent-primary">
                {workItemsCount}
              </span>
            ) : null}
          </div>
        </Header.LeftItem>
        <Header.RightItem className="items-center">
          <div className="hidden items-center gap-2 md:flex">
            <HeaderFilters
              key={getProjectStageFilterEntityId(projectId)}
              projectId={projectId}
              workspaceSlug={workspaceSlug}
              currentProjectDetails={currentProjectDetails}
              scope={STAGE_SCOPE}
              onFilterToggle={onFilterToggle}
            />
            <CustomMenu
              placement="bottom-end"
              disabled={!canAddWorkItems}
              customButton={
                <span
                  className={cn(
                    getButtonStyling("primary", "lg"),
                    canAddWorkItems ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                  )}
                  aria-disabled={!canAddWorkItems}
                >
                  {t("issue.add.label")}
                  <ChevronDown className="size-4 shrink-0" strokeWidth={2} />
                </span>
              }
            >
              {canCreateWorkItem && (
                <CustomMenu.MenuItem onClick={() => toggleCreateIssueModal(true, EIssuesStoreType.PROJECT)}>
                  <span className="flex items-center justify-start gap-2">{t("create_work_item")}</span>
                </CustomMenu.MenuItem>
              )}
              {canAddExisting && (
                <CustomMenu.MenuItem onClick={() => setIsAddExistingOpen(true)}>
                  <span className="flex items-center justify-start gap-2">{t("issue.add.existing")}</span>
                </CustomMenu.MenuItem>
              )}
            </CustomMenu>
            <IconButton
              variant="tertiary"
              size="lg"
              icon={PanelRight}
              aria-label={t(`${I18N}.detail.toggle_sidebar`)}
              onClick={() => setValue(`${!isSidebarCollapsed}`)}
              className={cn({ "bg-accent-subtle text-accent-primary": !isSidebarCollapsed })}
            />
          </div>
        </Header.RightItem>
      </Header>
    </>
  );
});
