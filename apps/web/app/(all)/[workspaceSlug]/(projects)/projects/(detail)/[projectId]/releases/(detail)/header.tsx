/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useCallback, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
import { ChartNoAxesColumn, ChevronDown, PanelRight, Rocket, SlidersHorizontal } from "lucide-react";
import {
  EIssueFilterType,
  ISSUE_DISPLAY_FILTERS_BY_PAGE,
  WORK_ITEM_TRACKER_ELEMENTS,
  PROJECT_ERROR_MESSAGES,
  PROJECT_RELEASES_ISSUE_MANAGE_PERMISSION_KEY,
  isProjectPermissionError,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button, getButtonStyling } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  ICustomSearchSelectOption,
  IIssueDisplayFilterOptions,
  IIssueDisplayProperties,
  ISearchIssueResponse,
} from "@plane/types";
import { EIssuesStoreType, EIssueLayoutTypes } from "@plane/types";
import { Breadcrumbs, CustomMenu, Header, BreadcrumbNavigationSearchDropdown } from "@plane/ui";
import { cn } from "@plane/utils";
import { WorkItemsModal } from "@/components/analytics/work-items/modal";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { SwitcherLabel } from "@/components/common/switcher-label";
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
import {
  DisplayFiltersSelection,
  FiltersDropdown,
  LayoutSelection,
  MobileLayoutSelection,
} from "@/components/issues/issue-layouts/filters";
import {
  RELEASE_DETAIL_TABS,
  DEFAULT_RELEASE_DETAIL_TAB,
  getReleaseDetailTabStorageKey,
} from "@/components/releases/release-overview";
import type { ReleaseDetailTabKey } from "@/components/releases/release-overview";
import { ReleaseQuickActions } from "@/components/releases/release-quick-actions";
import { WorkItemFiltersToggle } from "@/components/work-item-filters/filters-toggle";
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useRelease } from "@/hooks/store/use-release";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { setValueIntoLocalStorage } from "@/hooks/use-local-storage";
import { useIssuesActions } from "@/hooks/use-issues-actions";
import {
  getReleaseScopeSubTabStorageKey,
  useScopeSubTab,
} from "@/components/common/use-scope-sub-tab";
import useLocalStorage from "@/hooks/use-local-storage";
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";
import { IconButton } from "@plane/propel/icon-button";

const DEFAULT_RELEASE_DETAIL_TAB_KEY = DEFAULT_RELEASE_DETAIL_TAB;

export const ReleaseIssuesHeader = observer(function ReleaseIssuesHeader() {
  const parentRef = useRef<HTMLDivElement>(null);
  const [analyticsModal, setAnalyticsModal] = useState(false);
  const [openExistingIssueListModal, setOpenExistingIssueListModal] = useState(false);
  const { t } = useTranslation();
  const router = useAppRouter();
  const { workspaceSlug, projectId, releaseId: routerReleaseId } = useParams();
  const pathname = usePathname();
  const workspaceSlugValue = workspaceSlug?.toString();
  const projectIdValue = projectId?.toString();
  const releaseId = routerReleaseId ? routerReleaseId.toString() : undefined;
  const {
    issuesFilter: { issueFilters },
    issues: { addIssuesToRelease },
  } = useIssues(EIssuesStoreType.RELEASE);
  const { updateFilters } = useIssuesActions(EIssuesStoreType.RELEASE);
  const { getProjectReleaseIds, getReleaseById } = useRelease();
  const { toggleCreateIssueModal } = useCommandPalette();
  const { allowProjectPermissionKeys } = useUserPermissions();
  const { currentProjectDetails, loader } = useProject();
  const { setValue, storedValue } = useLocalStorage("release_sidebar_collapsed", "false");
  const isSidebarCollapsed = storedValue ? storedValue === "true" : false;
  /**
   * 「发布内容」页里的二级切换。右侧那排工具条（布局切换 / 筛选 / 分析 / 添加工作项）
   * 只服务于工作项子页，切到需求时必须整排隐藏 —— 否则「添加工作项」看起来像是往
   * 需求列表里加东西。页面与 header 是两棵渲染树，靠 useLocalStorage 的同 key 广播同步。
   */
  const { activeSubTab: activeScopeSubTab } = useScopeSubTab(
    getReleaseScopeSubTabStorageKey(releaseId?.toString() ?? "unknown")
  );
  const activeLayout = issueFilters?.displayFilters?.layout;
  const releaseDetails = releaseId ? getReleaseById(releaseId) : undefined;
  const { setValue: setStoredReleaseDetailTab, storedValue: storedReleaseDetailTab } = useLocalStorage<
    ReleaseDetailTabKey | "scope" | "note"
  >(getReleaseDetailTabStorageKey(releaseId ?? "unknown"), DEFAULT_RELEASE_DETAIL_TAB_KEY);
  const activeReleaseDetailTab: ReleaseDetailTabKey =
    storedReleaseDetailTab === "scope" || storedReleaseDetailTab === "note"
      ? "materials"
      : (storedReleaseDetailTab ?? DEFAULT_RELEASE_DETAIL_TAB_KEY);
  const canManageReleaseIssues = allowProjectPermissionKeys(
    [PROJECT_RELEASES_ISSUE_MANAGE_PERMISSION_KEY],
    workspaceSlugValue ?? "",
    projectIdValue ?? ""
  );
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
  const releaseScopeTab = {
    key: "release-scope",
    label: t("project_release.tab_release_scope"),
    isActive: !isOverviewActive,
    onClick: () => {
      if (releaseScopePath) router.push(releaseScopePath);
    },
  };
  const releaseTabs = [
    ...RELEASE_DETAIL_TABS.flatMap((tab) => {
      const detailTab = {
        key: tab.key,
        label: tab.label,
        isActive: !!isOverviewActive && activeReleaseDetailTab === tab.key,
        onClick: () => {
          setStoredReleaseDetailTab(tab.key);
          if (!isOverviewActive && releaseOverviewPath) router.push(releaseOverviewPath);
        },
      };

      return tab.key === "overview" ? [detailTab, releaseScopeTab] : [detailTab];
    }),
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

  const handleAddExistingIssuesToRelease = async (data: ISearchIssueResponse[]) => {
    if (!workspaceSlugValue || !projectIdValue || !releaseId || !canManageReleaseIssues) return;

    const issueIds = data.map((i) => i.id);

    try {
      await addIssuesToRelease(workspaceSlugValue, projectIdValue, releaseId, issueIds);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "Work items added to the release successfully.",
      });
    } catch (error) {
      if (isProjectPermissionError(error)) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
          message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
            ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
            : undefined,
        });
      } else {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: "Selected work items could not be added to the release. Please try again.",
        });
      }
    }
  };

  return (
    <>
      <WorkItemsModal
        isOpen={analyticsModal}
        onClose={() => setAnalyticsModal(false)}
        projectDetails={currentProjectDetails}
      />
      <ExistingIssuesListModal
        workspaceSlug={workspaceSlugValue}
        projectId={projectIdValue}
        isOpen={openExistingIssueListModal}
        handleClose={() => setOpenExistingIssueListModal(false)}
        searchParams={{ search: "", release: true }}
        handleOnSubmit={handleAddExistingIssuesToRelease}
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
                      setValueIntoLocalStorage(getReleaseDetailTabStorageKey(value), DEFAULT_RELEASE_DETAIL_TAB);
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
                    <button type="button" className="cursor-pointer outline-none" onClick={tab.onClick}>
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
            )}
          </div>
        </Header.LeftItem>
        {!isOverviewActive && activeScopeSubTab === "work-items" && (
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

            <Button className="hidden md:block" onClick={() => setAnalyticsModal(true)} variant="secondary" size="lg">
              <span className="hidden @4xl:flex">{t("common.analytics")}</span>
              <span className="@4xl:hidden">
                <ChartNoAxesColumn className="size-3.5" />
              </span>
            </Button>
            <CustomMenu
              placement="bottom-end"
              disabled={!canManageReleaseIssues}
              customButton={
                <span
                  className={cn(
                    getButtonStyling("primary", "lg"),
                    "hidden sm:inline-flex",
                    canManageReleaseIssues ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                  )}
                  data-ph-element={WORK_ITEM_TRACKER_ELEMENTS.HEADER_ADD_BUTTON.RELEASE}
                  aria-disabled={!canManageReleaseIssues}
                >
                  {t("issue.add.label")}
                  <ChevronDown className="size-4 shrink-0" strokeWidth={2} />
                </span>
              }
            >
              <CustomMenu.MenuItem
                onClick={() => {
                  if (!canManageReleaseIssues) return;
                  toggleCreateIssueModal(true, EIssuesStoreType.RELEASE);
                }}
              >
                <span className="flex items-center justify-start gap-2">{t("create_work_item")}</span>
              </CustomMenu.MenuItem>
              <CustomMenu.MenuItem
                onClick={() => {
                  if (!canManageReleaseIssues) return;
                  setOpenExistingIssueListModal(true);
                }}
              >
                <span className="flex items-center justify-start gap-2">{t("issue.add.existing")}</span>
              </CustomMenu.MenuItem>
            </CustomMenu>
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
