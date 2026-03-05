/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
// icons
import { ChartNoAxesColumn, PanelRight, SlidersHorizontal } from "lucide-react";
// plane imports
import {
  EIssueFilterType,
  ISSUE_DISPLAY_FILTERS_BY_PAGE,
  EUserPermissions,
  EUserPermissionsLevel,
  WORK_ITEM_TRACKER_ELEMENTS,
} from "@plane/constants";
import { Button } from "@plane/propel/button";
import { ModuleIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { ICustomSearchSelectOption, IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";
import { EIssuesStoreType, EIssueLayoutTypes } from "@plane/types";
import { Breadcrumbs, Header, BreadcrumbNavigationSearchDropdown } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { WorkItemsModal } from "@/components/analytics/work-items/modal";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { SwitcherLabel } from "@/components/common/switcher-label";
import {
  DisplayFiltersSelection,
  FiltersDropdown,
  LayoutSelection,
  MobileLayoutSelection,
} from "@/components/issues/issue-layouts/filters";
import { ModuleQuickActions } from "@/components/modules";
import { WorkItemFiltersToggle } from "@/components/work-item-filters/filters-toggle";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useIssues } from "@/hooks/store/use-issues";
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { useIssuesActions } from "@/hooks/use-issues-actions";
import useLocalStorage from "@/hooks/use-local-storage";
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web imports
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";
import { IconButton } from "@plane/propel/icon-button";

export const ModuleIssuesHeader = observer(function ModuleIssuesHeader() {
  // refs
  const parentRef = useRef<HTMLDivElement>(null);
  // states
  const [analyticsModal, setAnalyticsModal] = useState(false);
  // router
  const router = useAppRouter();
  const { workspaceSlug, projectId, moduleId: routerModuleId } = useParams();
  const pathname = usePathname();
  const workspaceSlugValue = workspaceSlug?.toString();
  const projectIdValue = projectId?.toString();
  const moduleId = routerModuleId ? routerModuleId.toString() : undefined;
  // hooks
  const { isMobile } = usePlatformOS();
  // store hooks
  const {
    issuesFilter: { issueFilters },
    issues: { getGroupIssueCount },
  } = useIssues(EIssuesStoreType.MODULE);
  const { updateFilters } = useIssuesActions(EIssuesStoreType.MODULE);
  const { projectModuleIds, getModuleById } = useModule();
  const { toggleCreateIssueModal } = useCommandPalette();
  const { allowPermissions } = useUserPermissions();
  const { currentProjectDetails, loader } = useProject();
  // local storage
  const { setValue, storedValue } = useLocalStorage("module_sidebar_collapsed", "false");
  // derived values
  const isSidebarCollapsed = storedValue ? (storedValue === "true" ? true : false) : false;
  const activeLayout = issueFilters?.displayFilters?.layout;
  const moduleDetails = moduleId ? getModuleById(moduleId) : undefined;
  const canUserCreateIssue = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );
  const workItemsCount = getGroupIssueCount(undefined, undefined, false);
  const moduleOverviewPath =
    workspaceSlugValue && projectIdValue && moduleId
      ? `/${workspaceSlugValue}/projects/${projectIdValue}/modules/${moduleId}/overview`
      : "";
  const moduleReleaseScopePath =
    workspaceSlugValue && projectIdValue && moduleId
      ? `/${workspaceSlugValue}/projects/${projectIdValue}/modules/${moduleId}`
      : "";
  const isOverviewActive = /\/overview\/?$/.test(pathname ?? "");
  const moduleTabs = [
    {
      key: "overview",
      label: "概览",
      isActive: !!isOverviewActive,
      path: moduleOverviewPath,
    },
    {
      key: "release-scope",
      label: "发布范围",
      isActive: !isOverviewActive,
      path: moduleReleaseScopePath,
    },
  ];

  const toggleSidebar = () => {
    setValue(`${!isSidebarCollapsed}`);
  };

  const handleLayoutChange = useCallback(
    (layout: EIssueLayoutTypes) => {
      if (!projectId) return;
      updateFilters(projectId.toString(), EIssueFilterType.DISPLAY_FILTERS, { layout: layout });
    },
    [projectId, updateFilters]
  );

  const handleDisplayFilters = useCallback(
    (updatedDisplayFilter: Partial<IIssueDisplayFilterOptions>) => {
      if (!projectId) return;
      updateFilters(projectId.toString(), EIssueFilterType.DISPLAY_FILTERS, updatedDisplayFilter);
    },
    [projectId, updateFilters]
  );

  const handleDisplayProperties = useCallback(
    (property: Partial<IIssueDisplayProperties>) => {
      if (!projectId) return;
      updateFilters(projectId.toString(), EIssueFilterType.DISPLAY_PROPERTIES, property);
    },
    [projectId, updateFilters]
  );

  const switcherOptions = projectModuleIds
    ?.map((id) => {
      const _module = id === moduleId ? moduleDetails : getModuleById(id);
      if (!_module) return;
      return {
        value: _module.id,
        query: _module.name,
        content: <SwitcherLabel name={_module.name} LabelIcon={ModuleIcon} />,
      };
    })
    .filter((option) => option !== undefined) as ICustomSearchSelectOption[];

  return (
    <>
      <WorkItemsModal
        isOpen={analyticsModal}
        onClose={() => setAnalyticsModal(false)}
        moduleDetails={moduleDetails ?? undefined}
        projectDetails={currentProjectDetails}
      />
      <Header>
        <Header.LeftItem>
          <div className="flex items-center gap-2">
            <Breadcrumbs onBack={router.back} isLoading={loader === "init-loader"}>
              <CommonProjectBreadcrumbs workspaceSlug={workspaceSlug?.toString()} projectId={projectId?.toString()} />
              <Breadcrumbs.Item
                component={
                  <BreadcrumbLink
                    label="Releases"
                    href={`/${workspaceSlug}/projects/${projectId}/modules/`}
                    icon={<ModuleIcon className="h-4 w-4 text-tertiary" />}
                    isLast
                  />
                }
                isLast
              />
              <Breadcrumbs.Item
                component={
                  <BreadcrumbNavigationSearchDropdown
                    selectedItem={moduleId?.toString() ?? ""}
                    navigationItems={switcherOptions}
                    onChange={(value: string) => {
                      router.push(`/${workspaceSlug}/projects/${projectId}/modules/${value}/overview/`);
                    }}
                    title={moduleDetails?.name}
                    icon={<ModuleIcon className="size-3.5 flex-shrink-0 text-tertiary" />}
                    isLast
                  />
                }
              />
            </Breadcrumbs>
            <span className="h-4 w-px flex-shrink-0 bg-custom-border-300" />
            {moduleId && (
              <div className="flex h-full items-center gap-0.5">
                {moduleTabs.map((tab) => (
                  <div key={tab.key} className="relative flex h-full items-center transition-all duration-300">
                    {tab.isActive && (
                      <span className="pointer-events-none absolute bottom-[-8px] left-1/2 z-20 h-0.5 w-[80%] -translate-x-1/2 rounded-t-md bg-black transition-all duration-300" />
                    )}
                    <button
                      type="button"
                      className="cursor-pointer outline-none"
                      onClick={() => tab.path && router.push(tab.path)}
                    >
                      <div
                        className={cn(
                          "relative flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors z-10",
                          tab.isActive ? "text-custom-text-100" : "text-custom-text-200 hover:text-custom-text-100"
                        )}
                      >
                        {tab.isActive && <div className="absolute inset-0 -z-10 rounded-md bg-[#f6f6f6]" />}
                        <span>{tab.label}</span>
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {!isOverviewActive && workItemsCount && workItemsCount > 0 ? (
              <Tooltip
                isMobile={isMobile}
                tooltipContent={`There are ${workItemsCount} ${
                  workItemsCount > 1 ? "work items" : "work item"
                } in this module`}
                position="bottom"
              >
                <span className="flex flex-shrink-0 cursor-default items-center justify-center rounded-xl bg-accent-primary/20 px-2 text-center text-11 font-semibold text-accent-primary">
                  {workItemsCount}
                </span>
              </Tooltip>
            ) : null}
          </div>
        </Header.LeftItem>
        {!isOverviewActive && (
          <Header.RightItem className="items-center">
            <div className="hidden gap-2 md:flex">
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
              {moduleId && <WorkItemFiltersToggle entityType={EIssuesStoreType.MODULE} entityId={moduleId} />}
              <FiltersDropdown
                title="Display"
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
                  ignoreGroupedFilters={["module"]}
                  cycleViewDisabled={!currentProjectDetails?.cycle_view}
                  moduleViewDisabled={!currentProjectDetails?.module_view}
                />
              </FiltersDropdown>
            </div>

            {canUserCreateIssue ? (
              <>
                <Button
                  className="hidden md:block"
                  onClick={() => setAnalyticsModal(true)}
                  variant="secondary"
                  size="lg"
                >
                  <span className="hidden @4xl:flex">Analytics</span>
                  <span className="@4xl:hidden">
                    <ChartNoAxesColumn className="size-3.5" />
                  </span>
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  className="hidden sm:flex"
                  onClick={() => {
                    toggleCreateIssueModal(true, EIssuesStoreType.MODULE);
                  }}
                  data-ph-element={WORK_ITEM_TRACKER_ELEMENTS.HEADER_ADD_BUTTON.MODULE}
                >
                  Add work item
                </Button>
              </>
            ) : (
              <></>
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
            {moduleId && (
              <ModuleQuickActions
                parentRef={parentRef}
                moduleId={moduleId}
                projectId={projectId.toString()}
                workspaceSlug={workspaceSlug.toString()}
                customClassName="flex-shrink-0 flex items-center justify-center bg-layer-1/70 rounded-sm size-[26px]"
              />
            )}
          </Header.RightItem>
        )}
      </Header>
    </>
  );
});
