/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useCallback, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
import { ChartNoAxesColumn, PanelRight, Rocket, SlidersHorizontal } from "lucide-react";
import {
  EIssueFilterType,
  ISSUE_DISPLAY_FILTERS_BY_PAGE,
  EUserPermissions,
  EUserPermissionsLevel,
  WORK_ITEM_TRACKER_ELEMENTS,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Tooltip } from "@plane/propel/tooltip";
import type { ICustomSearchSelectOption, IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";
import { EIssuesStoreType, EIssueLayoutTypes } from "@plane/types";
import { Breadcrumbs, Header, BreadcrumbNavigationSearchDropdown } from "@plane/ui";
import { cn } from "@plane/utils";
import { WorkItemsModal } from "@/components/analytics/work-items/modal";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { SwitcherLabel } from "@/components/common/switcher-label";
import {
  DisplayFiltersSelection,
  FiltersDropdown,
  LayoutSelection,
  MobileLayoutSelection,
} from "@/components/issues/issue-layouts/filters";
import { ReleaseQuickActions } from "@/components/releases/release-quick-actions";
import { WorkItemFiltersToggle } from "@/components/work-item-filters/filters-toggle";
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useRelease } from "@/hooks/store/use-release";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { useIssuesActions } from "@/hooks/use-issues-actions";
import useLocalStorage from "@/hooks/use-local-storage";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";
import { IconButton } from "@plane/propel/icon-button";

export const ReleaseIssuesHeader = observer(function ReleaseIssuesHeader() {
  const parentRef = useRef<HTMLDivElement>(null);
  const [analyticsModal, setAnalyticsModal] = useState(false);
  const { t } = useTranslation();
  const router = useAppRouter();
  const { workspaceSlug, projectId, releaseId: routerReleaseId } = useParams();
  const pathname = usePathname();
  const workspaceSlugValue = workspaceSlug?.toString();
  const projectIdValue = projectId?.toString();
  const releaseId = routerReleaseId ? routerReleaseId.toString() : undefined;
  const { isMobile } = usePlatformOS();
  const {
    issuesFilter: { issueFilters },
    issues: { getGroupIssueCount },
  } = useIssues(EIssuesStoreType.RELEASE);
  const { updateFilters } = useIssuesActions(EIssuesStoreType.RELEASE);
  const { getProjectReleaseIds, getReleaseById } = useRelease();
  const { toggleCreateIssueModal } = useCommandPalette();
  const { allowPermissions } = useUserPermissions();
  const { currentProjectDetails, loader } = useProject();
  const { setValue, storedValue } = useLocalStorage("release_sidebar_collapsed", "false");
  const isSidebarCollapsed = storedValue ? storedValue === "true" : false;
  const activeLayout = issueFilters?.displayFilters?.layout;
  const releaseDetails = releaseId ? getReleaseById(releaseId) : undefined;
  const canUserCreateIssue = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );
  const workItemsCount = getGroupIssueCount(undefined, undefined, false);
  const projectReleaseIds = projectIdValue ? getProjectReleaseIds(projectIdValue) : undefined;

  const releaseOverviewPath =
    workspaceSlugValue && projectIdValue && releaseId
      ? `/${workspaceSlugValue}/projects/${projectIdValue}/releases/${releaseId}/overview`
      : "";
  const releaseScopePath =
    workspaceSlugValue && projectIdValue && releaseId
      ? `/${workspaceSlugValue}/projects/${projectIdValue}/releases/${releaseId}`
      : "";
  const isOverviewActive = /\/overview\/?$/.test(pathname ?? "");
  const releaseTabs = [
    {
      key: "overview",
      label: t("sidebar.overview"),
      isActive: !!isOverviewActive,
      path: releaseOverviewPath,
    },
    {
      key: "release-scope",
      label: t("project_release.tab_release_scope"),
      isActive: !isOverviewActive,
      path: releaseScopePath,
    },
  ];

  const toggleSidebar = () => {
    setValue(`${!isSidebarCollapsed}`);
  };

  const handleLayoutChange = useCallback(
    (layout: EIssueLayoutTypes) => {
      if (!projectId) return;
      updateFilters(projectId.toString(), EIssueFilterType.DISPLAY_FILTERS, { layout });
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

  const switcherOptions = projectReleaseIds
    ?.map((id) => {
      const r = id === releaseId ? releaseDetails : getReleaseById(id);
      if (!r) return;
      return {
        value: r.id,
        query: r.name,
        content: <SwitcherLabel name={r.name} LabelIcon={Rocket} />,
      };
    })
    .filter((option) => option !== undefined) as ICustomSearchSelectOption[];

  return (
    <>
      <WorkItemsModal
        isOpen={analyticsModal}
        onClose={() => setAnalyticsModal(false)}
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
                    label={t("project_release.breadcrumb_releases_link")}
                    href={`/${workspaceSlug}/projects/${projectId}/releases`}
                    icon={<Rocket className="h-4 w-4 text-tertiary" />}
                  />
                }
              />
              <Breadcrumbs.Item
                component={
                  <BreadcrumbNavigationSearchDropdown
                    selectedItem={releaseId?.toString() ?? ""}
                    navigationItems={switcherOptions}
                    onChange={(value: string) => {
                      router.push(`/${workspaceSlug}/projects/${projectId}/releases/${value}/overview`);
                    }}
                    title={releaseDetails?.name}
                    icon={<Rocket className="h-4 w-4 flex-shrink-0 text-tertiary" />}
                    isLast
                  />
                }
                isLast
              />
            </Breadcrumbs>
            <span className="h-4 w-px flex-shrink-0 bg-[var(--border-subtle-1)]" />
            {releaseId && (
              <div className="flex h-full items-center gap-0.5">
                {releaseTabs.map((tab) => (
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
                          "relative flex items-center gap-2 rounded-md px-2 py-1.5 text-13 font-medium transition-colors z-10",
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
            )}
            {!isOverviewActive && workItemsCount && workItemsCount > 0 ? (
              <Tooltip
                isMobile={isMobile}
                tooltipContent={`There are ${workItemsCount} ${
                  workItemsCount > 1 ? "work items" : "work item"
                } in this release`}
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
              {releaseId && <WorkItemFiltersToggle entityType={EIssuesStoreType.RELEASE} entityId={releaseId} />}
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
                  <span className="hidden @4xl:flex">{t("common.analytics")}</span>
                  <span className="@4xl:hidden">
                    <ChartNoAxesColumn className="size-3.5" />
                  </span>
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  className="hidden sm:flex"
                  onClick={() => {
                    toggleCreateIssueModal(true, EIssuesStoreType.RELEASE);
                  }}
                  data-ph-element={WORK_ITEM_TRACKER_ELEMENTS.HEADER_ADD_BUTTON.RELEASE}
                >
                  {t("issue.add.label")}
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
            {releaseId && (
              <ReleaseQuickActions
                parentRef={parentRef}
                releaseId={releaseId}
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
