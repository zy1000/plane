/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useCallback, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { EIssueFilterType, ISSUE_LAYOUTS, ISSUE_DISPLAY_FILTERS_BY_PAGE } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { CalendarLayoutIcon, BoardLayoutIcon, ListLayoutIcon, ChevronDownIcon } from "@plane/propel/icons";
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties, EIssueLayoutTypes } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { WorkItemsModal } from "@/components/analytics/work-items/modal";
import { DisplayFiltersSelection, FiltersDropdown } from "@/components/issues/issue-layouts/filters";
import { IssueLayoutIcon } from "@/components/issues/issue-layouts/layout-icon";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useIssuesActions } from "@/hooks/use-issues-actions";

const SUPPORTED_LAYOUTS = [
  { key: "list", i18n_title: "issue.layouts.list", icon: ListLayoutIcon },
  { key: "kanban", i18n_title: "issue.layouts.kanban", icon: BoardLayoutIcon },
  { key: "calendar", i18n_title: "issue.layouts.calendar", icon: CalendarLayoutIcon },
];

export const ReleaseIssuesMobileHeader = observer(function ReleaseIssuesMobileHeader() {
  const { projectId } = useParams();
  const [analyticsModal, setAnalyticsModal] = useState(false);
  const { t } = useTranslation();
  const { currentProjectDetails } = useProject();
  const { updateFilters } = useIssuesActions(EIssuesStoreType.RELEASE);
  const {
    issuesFilter: { issueFilters },
  } = useIssues(EIssuesStoreType.RELEASE);
  const activeLayout = issueFilters?.displayFilters?.layout;
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

  return (
    <div className="block md:hidden">
      <WorkItemsModal
        isOpen={analyticsModal}
        onClose={() => setAnalyticsModal(false)}
        projectDetails={currentProjectDetails}
      />
      <div className="flex justify-evenly border-b border-subtle bg-surface-1 py-2">
        <CustomMenu
          maxHeight={"md"}
          className="flex flex-grow justify-center text-13 text-secondary"
          placement="bottom-start"
          customButton={
            <span className="flex flex-grow justify-center text-13 text-secondary">{t("common.layout")}</span>
          }
          customButtonClassName="flex flex-grow justify-center text-secondary text-13"
          closeOnSelect
        >
          {SUPPORTED_LAYOUTS.map((layout, index) => (
            <CustomMenu.MenuItem
              key={layout.key}
              onClick={() => {
                handleLayoutChange(ISSUE_LAYOUTS[index].key);
              }}
              className="flex items-center gap-2"
            >
              <IssueLayoutIcon layout={ISSUE_LAYOUTS[index].key} className="h-3 w-3" />
              <div className="text-tertiary">{t(layout.i18n_title)}</div>
            </CustomMenu.MenuItem>
          ))}
        </CustomMenu>
        <div className="flex flex-grow items-center justify-center border-l border-subtle text-13 text-secondary">
          <FiltersDropdown
            title={t("common.display")}
            placement="bottom-end"
            menuButton={
              <span className="flex items-center text-13 text-secondary">
                {t("common.display")}
                <ChevronDownIcon className="ml-2 h-4 w-4 text-secondary" />
              </span>
            }
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

        <button
          type="button"
          onClick={() => setAnalyticsModal(true)}
          className="flex flex-grow justify-center border-l border-subtle text-13 text-secondary"
        >
          {t("common.analytics")}
        </button>
      </div>
    </div>
  );
});
