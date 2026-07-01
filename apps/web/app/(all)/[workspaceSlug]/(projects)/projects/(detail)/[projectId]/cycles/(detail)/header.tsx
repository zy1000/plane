/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
// icons
import { ChartNoAxesColumn, ChevronDown, PanelRight, SlidersHorizontal } from "lucide-react";
// plane imports
import {
  EIssueFilterType,
  EUserPermissions,
  EUserPermissionsLevel,
  ISSUE_DISPLAY_FILTERS_BY_PAGE,
  WORK_ITEM_TRACKER_ELEMENTS,
  PROJECT_SPRINTS_ISSUE_MANAGE_PERMISSION_KEY,
  PROJECT_ERROR_MESSAGES,
  isProjectPermissionError,
} from "@plane/constants";
import { usePlatformOS } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { Button, getButtonStyling } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { IconButton } from "@plane/propel/icon-button";
import { CycleIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type {
  ICustomSearchSelectOption,
  IIssueDisplayFilterOptions,
  IIssueDisplayProperties,
  ISearchIssueResponse,
} from "@plane/types";
import { EIssuesStoreType, EIssueLayoutTypes } from "@plane/types";
import { Breadcrumbs, BreadcrumbNavigationSearchDropdown, CustomMenu, Header } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { WorkItemsModal } from "@/components/analytics/work-items/modal";
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { SwitcherLabel } from "@/components/common/switcher-label";
import { CycleQuickActions } from "@/components/cycles/quick-actions";
import {
  DisplayFiltersSelection,
  FiltersDropdown,
  LayoutSelection,
  MobileLayoutSelection,
} from "@/components/issues/issue-layouts/filters";
import { WorkItemFiltersToggle } from "@/components/work-item-filters/filters-toggle";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useCycle } from "@/hooks/store/use-cycle";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import useLocalStorage from "@/hooks/use-local-storage";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";

export const CycleIssuesHeader = observer(function CycleIssuesHeader() {
  // refs
  const parentRef = useRef<HTMLDivElement>(null);
  // states
  const [analyticsModal, setAnalyticsModal] = useState(false);
  const [openExistingIssueListModal, setOpenExistingIssueListModal] = useState(false);
  // router
  const router = useAppRouter();
  const { workspaceSlug, projectId, cycleId } = useParams();
  const pathname = usePathname();
  // i18n
  const { t } = useTranslation();
  // store hooks
  const {
    issuesFilter: { issueFilters, updateFilters },
    issues: { getGroupIssueCount, addIssueToCycle },
  } = useIssues(EIssuesStoreType.CYCLE);
  const { currentProjectCycleIds, getCycleById } = useCycle();
  const { toggleCreateIssueModal } = useCommandPalette();
  const { currentProjectDetails, loader } = useProject();
  const { isMobile } = usePlatformOS();
  const { allowPermissions, allowProjectPermissionKeys } = useUserPermissions();
  const workspaceSlugValue = workspaceSlug?.toString() ?? "";
  const projectIdValue = projectId?.toString() ?? "";

  const activeLayout = issueFilters?.displayFilters?.layout;

  const { setValue, storedValue } = useLocalStorage("cycle_sidebar_collapsed", false);

  const isSidebarCollapsed = storedValue ? (storedValue === true ? true : false) : false;
  const toggleSidebar = () => {
    setValue(!isSidebarCollapsed);
  };

  const handleLayoutChange = useCallback(
    (layout: EIssueLayoutTypes) => {
      if (!workspaceSlug || !projectId) return;
      updateFilters(workspaceSlug, projectId, EIssueFilterType.DISPLAY_FILTERS, { layout: layout }, cycleId);
    },
    [workspaceSlug, projectId, cycleId, updateFilters]
  );

  const handleDisplayFilters = useCallback(
    (updatedDisplayFilter: Partial<IIssueDisplayFilterOptions>) => {
      if (!workspaceSlug || !projectId) return;
      updateFilters(workspaceSlug, projectId, EIssueFilterType.DISPLAY_FILTERS, updatedDisplayFilter, cycleId);
    },
    [workspaceSlug, projectId, cycleId, updateFilters]
  );

  const handleDisplayProperties = useCallback(
    (property: Partial<IIssueDisplayProperties>) => {
      if (!workspaceSlug || !projectId) return;
      updateFilters(workspaceSlug, projectId, EIssueFilterType.DISPLAY_PROPERTIES, property, cycleId);
    },
    [workspaceSlug, projectId, cycleId, updateFilters]
  );

  // derived values
  const cycleDetails = cycleId ? getCycleById(cycleId.toString()) : undefined;
  const isCompletedCycle = cycleDetails?.status === "completed";
  const canUserCreateIssue = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );
  const canManageSprintIssues = allowProjectPermissionKeys(
    [PROJECT_SPRINTS_ISSUE_MANAGE_PERMISSION_KEY],
    workspaceSlugValue,
    projectIdValue
  );
  const canCreateIssueInCycle = canUserCreateIssue && canManageSprintIssues;
  const canOpenCycleIssueActionMenu = canManageSprintIssues;

  const switcherOptions = currentProjectCycleIds
    ?.map((id) => {
      const _cycle = id === cycleId ? cycleDetails : getCycleById(id);
      if (!_cycle) return;
      return {
        value: _cycle.id,
        query: _cycle.name,
        content: <SwitcherLabel name={_cycle.name} LabelIcon={CycleIcon} />,
      };
    })
    .filter((option) => option !== undefined) as ICustomSearchSelectOption[];

  const workItemsCount = getGroupIssueCount(undefined, undefined, false);
  const cycleOverviewPath =
    workspaceSlug && projectId && cycleId ? `/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/overview` : "";
  const cycleAttachmentsPath =
    workspaceSlug && projectId && cycleId
      ? `/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/attachments`
      : "";
  const cycleScopePath = workspaceSlug && projectId && cycleId ? `/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}` : "";
  const isOverviewActive = /\/overview\/?$/.test(pathname ?? "");
  const isAttachmentsActive = /\/attachments\/?$/.test(pathname ?? "");
  const activeCycleTab = isOverviewActive
    ? "overview"
    : isAttachmentsActive
      ? "attachments"
      : "scope";
  const cycleTabs = [
    {
      key: "overview",
      label: t("sidebar.overview"),
      isActive: activeCycleTab === "overview",
      path: cycleOverviewPath,
    },
    {
      key: "scope",
      label: t("project_cycles.tab_iteration_scope"),
      isActive: activeCycleTab === "scope",
      path: cycleScopePath,
    },
    {
      key: "attachments",
      label: t("project_cycles.tab_attachments"),
      isActive: activeCycleTab === "attachments",
      path: cycleAttachmentsPath,
    },
  ];

  const showPermissionError = () => {
    setToast({
      type: TOAST_TYPE.ERROR,
      title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
    });
  };

  const handleAddExistingIssuesToCycle = async (data: ISearchIssueResponse[]) => {
    if (!workspaceSlug || !projectId || !cycleId) return;
    if (!canManageSprintIssues) return showPermissionError();

    const issueIds = data.map((i) => i.id);

    try {
      await addIssueToCycle(workspaceSlug.toString(), projectId.toString(), cycleId.toString(), issueIds);

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "Work items added to the cycle successfully.",
      });
    } catch (error) {
      if (isProjectPermissionError(error)) {
        showPermissionError();
      } else {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: "Selected work items could not be added to the cycle. Please try again.",
        });
      }
    }
  };

  return (
    <>
      <WorkItemsModal
        projectDetails={currentProjectDetails}
        isOpen={analyticsModal}
        onClose={() => setAnalyticsModal(false)}
        cycleDetails={cycleDetails ?? undefined}
      />
      <ExistingIssuesListModal
        workspaceSlug={workspaceSlug?.toString()}
        projectId={projectId?.toString()}
        isOpen={openExistingIssueListModal}
        handleClose={() => setOpenExistingIssueListModal(false)}
        searchParams={{ cycle: true }}
        handleOnSubmit={handleAddExistingIssuesToCycle}
      />
      <Header>
        <Header.LeftItem>
          <div className="flex items-center gap-2">
            <Breadcrumbs onBack={router.back} isLoading={loader === "init-loader"}>
              <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
              <Breadcrumbs.Item
                component={
                  <BreadcrumbLink
                    label="Sprints"
                    href={`/${workspaceSlug}/projects/${projectId}/cycles/`}
                    icon={<CycleIcon className="h-4 w-4 text-tertiary" />}
                  />
                }
              />
              <Breadcrumbs.Item
                component={
                  <BreadcrumbNavigationSearchDropdown
                    selectedItem={cycleId}
                    navigationItems={switcherOptions}
                    onChange={(value: string) => {
                      const nextPath =
                        activeCycleTab === "overview"
                          ? `/${workspaceSlug}/projects/${projectId}/cycles/${value}/overview`
                          : activeCycleTab === "attachments"
                            ? `/${workspaceSlug}/projects/${projectId}/cycles/${value}/attachments`
                            : `/${workspaceSlug}/projects/${projectId}/cycles/${value}`;
                      router.push(nextPath);
                    }}
                    title={cycleDetails?.name}
                    icon={<CycleIcon className="h-4 w-4 flex-shrink-0 text-tertiary" />}
                    isLast
                  />
                }
                isLast
              />
            </Breadcrumbs>
            <span className="h-4 w-px flex-shrink-0 bg-[var(--border-subtle-1)]" />
            <div className="flex h-full items-center gap-0.5">
              {cycleTabs.map((tab) => (
                <div key={tab.key} className="relative flex h-full items-center transition-all duration-300">
                  {tab.isActive && (
                    <span className="pointer-events-none absolute bottom-[-4px] left-1/2 z-20 h-0.5 w-[80%] -translate-x-1/2 rounded-t-md bg-black transition-all duration-300" />
                  )}
                  <button
                    type="button"
                    className="cursor-pointer outline-none"
                    onClick={() => tab.path && router.push(tab.path)}
                  >
                    <div
                      className={cn(
                        "relative z-10 flex items-center gap-2 rounded-md px-2 py-1.5 text-13 font-medium transition-colors",
                        tab.isActive ? "text-primary" : "text-primary hover:text-primary"
                      )}
                    >
                      {tab.isActive && <div className="absolute inset-0 -z-10 rounded-md bg-[#f6f6f6]" />}
                      <span>{tab.label}</span>
                    </div>
                  </button>
                </div>
              ))}
            </div>
            {activeCycleTab === "scope" && workItemsCount && workItemsCount > 0 ? (
              <Tooltip
                isMobile={isMobile}
                tooltipContent={`There are ${workItemsCount} ${
                  workItemsCount > 1 ? "work items" : "work item"
                } in this cycle`}
                position="bottom"
              >
                <span className="flex flex-shrink-0 cursor-default items-center justify-center rounded-xl bg-accent-primary/20 px-2 text-center text-11 font-semibold text-accent-primary">
                  {workItemsCount}
                </span>
              </Tooltip>
            ) : null}
          </div>
        </Header.LeftItem>
        {activeCycleTab === "scope" && (
          <Header.RightItem className="items-center">
            <div className="hidden items-center gap-2 md:flex">
              <div className="hidden @4xl:flex">
                <LayoutSelection
                  layouts={[
                    EIssueLayoutTypes.LIST,
                    EIssueLayoutTypes.KANBAN,
                    EIssueLayoutTypes.CALENDAR,
                    EIssueLayoutTypes.SPREADSHEET,
                    EIssueLayoutTypes.GANTT,
                  ]}
                  onChange={(layout) => handleLayoutChange(layout)}
                  selectedLayout={activeLayout}
                />
              </div>
              <div className="flex @4xl:hidden">
                <MobileLayoutSelection
                  layouts={[
                    EIssueLayoutTypes.LIST,
                    EIssueLayoutTypes.KANBAN,
                    EIssueLayoutTypes.CALENDAR,
                    EIssueLayoutTypes.SPREADSHEET,
                    EIssueLayoutTypes.GANTT,
                  ]}
                  onChange={(layout) => handleLayoutChange(layout)}
                  activeLayout={activeLayout}
                />
              </div>
              <WorkItemFiltersToggle entityType={EIssuesStoreType.CYCLE} entityId={cycleId} />
              <FiltersDropdown
                title={t("common.display")}
                placement="bottom-end"
                miniIcon={<SlidersHorizontal className="size-3.5" />}
              >
                <DisplayFiltersSelection
                  layoutDisplayFiltersOptions={
                    activeLayout ? ISSUE_DISPLAY_FILTERS_BY_PAGE.issues.layoutOptions[activeLayout] : undefined
                  }
                  displayFilters={issueFilters?.displayFilters ?? {}}
                  handleDisplayFiltersUpdate={handleDisplayFilters}
                  displayProperties={issueFilters?.displayProperties ?? {}}
                  handleDisplayPropertiesUpdate={handleDisplayProperties}
                  ignoreGroupedFilters={["cycle"]}
                  cycleViewDisabled={!currentProjectDetails?.cycle_view}
                  moduleViewDisabled={!currentProjectDetails?.module_view}
                />
              </FiltersDropdown>

              <Button onClick={() => setAnalyticsModal(true)} variant="secondary" size="lg">
                <span className="hidden @4xl:flex">{t("common.analytics")}</span>
                <span className="@4xl:hidden">
                  <ChartNoAxesColumn className="size-3.5" />
                </span>
              </Button>
              {!isCompletedCycle && (
                <CustomMenu
                  placement="bottom-end"
                  disabled={!canOpenCycleIssueActionMenu}
                  customButton={
                    <span
                      className={cn(
                        getButtonStyling("primary", "lg"),
                        canOpenCycleIssueActionMenu ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                      )}
                      data-ph-element={WORK_ITEM_TRACKER_ELEMENTS.HEADER_ADD_BUTTON.CYCLE}
                    >
                      {t("issue.add.label")}
                      <ChevronDown className="size-4 shrink-0" strokeWidth={2} />
                    </span>
                  }
                >
                  <CustomMenu.MenuItem
                    onClick={() => {
                      if (!canCreateIssueInCycle) return showPermissionError();
                      toggleCreateIssueModal(true, EIssuesStoreType.CYCLE);
                    }}
                    disabled={!canCreateIssueInCycle}
                  >
                    <span className="flex items-center justify-start gap-2">{t("create_work_item")}</span>
                  </CustomMenu.MenuItem>
                  <CustomMenu.MenuItem
                    onClick={() => {
                      if (!canManageSprintIssues) return showPermissionError();
                      setOpenExistingIssueListModal(true);
                    }}
                    disabled={!canManageSprintIssues}
                  >
                    <span className="flex items-center justify-start gap-2">{t("issue.add.existing")}</span>
                  </CustomMenu.MenuItem>
                </CustomMenu>
              )}
              <IconButton
                variant="tertiary"
                size="lg"
                icon={PanelRight}
                onClick={toggleSidebar}
                className={cn({
                  "bg-accent-subtle text-accent-primary": !isSidebarCollapsed,
                })}
              />
              <CycleQuickActions
                parentRef={parentRef}
                cycleId={cycleId}
                projectId={projectId}
                workspaceSlug={workspaceSlug}
                customClassName="flex-shrink-0 flex items-center justify-center size-[26px] bg-layer-1/70 rounded-sm"
              />
            </div>
          </Header.RightItem>
        )}
      </Header>
    </>
  );
});
