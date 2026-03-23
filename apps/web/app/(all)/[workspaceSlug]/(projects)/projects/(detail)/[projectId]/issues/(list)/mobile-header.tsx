/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
// plane imports
import { EIssueFilterType, ISSUE_DISPLAY_FILTERS_BY_PAGE } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { ChevronDownIcon } from "@plane/propel/icons";
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";
import { EIssuesStoreType, EIssueLayoutTypes } from "@plane/types";
// components
import { WorkItemsModal } from "@/components/analytics/work-items/modal";
import {
  DisplayFiltersSelection,
  FiltersDropdown,
  MobileLayoutSelection,
} from "@/components/issues/issue-layouts/filters";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { getProjectScopeFilterConfig } from "@/components/issues/typed-page-filter-config";
import { getProjectIssueScopeFromPathname } from "@/store/issue/project";

export const ProjectIssuesMobileHeader = observer(function ProjectIssuesMobileHeader() {
  // i18n
  const { t } = useTranslation();
  const [analyticsModal, setAnalyticsModal] = useState(false);
  const { workspaceSlug, projectId } = useParams();
  const pathname = usePathname();
  const { currentProjectDetails } = useProject();
  const scope = getProjectIssueScopeFromPathname(pathname);

  // store hooks
  const { issuesFilter } = useIssues(EIssuesStoreType.PROJECT);
  const scopedIssueFilters = projectId ? issuesFilter.getIssueFilters(projectId.toString(), scope) : issuesFilter.issueFilters;
  const activeLayout = scopedIssueFilters?.displayFilters?.layout;
  const projectScopeFilterConfig = getProjectScopeFilterConfig(scope);

  const handleLayoutChange = useCallback(
    (layout: EIssueLayoutTypes) => {
      if (!workspaceSlug || !projectId) return;
      issuesFilter.updateFilters(workspaceSlug.toString(), projectId.toString(), EIssueFilterType.DISPLAY_FILTERS, {
        layout: layout,
      }, scope);
    },
    [workspaceSlug, projectId, issuesFilter, scope]
  );

  const handleDisplayFilters = useCallback(
    (updatedDisplayFilter: Partial<IIssueDisplayFilterOptions>) => {
      if (!workspaceSlug || !projectId) return;
      issuesFilter.updateFilters(
        workspaceSlug.toString(),
        projectId.toString(),
        EIssueFilterType.DISPLAY_FILTERS,
        updatedDisplayFilter,
        scope
      );
    },
    [workspaceSlug, projectId, issuesFilter, scope]
  );

  const handleDisplayProperties = useCallback(
    (property: Partial<IIssueDisplayProperties>) => {
      if (!workspaceSlug || !projectId) return;
      issuesFilter.updateFilters(
        workspaceSlug.toString(),
        projectId.toString(),
        EIssueFilterType.DISPLAY_PROPERTIES,
        property,
        scope
      );
    },
    [workspaceSlug, projectId, issuesFilter, scope]
  );

  return (
    <>
      <WorkItemsModal
        isOpen={analyticsModal}
        onClose={() => setAnalyticsModal(false)}
        projectDetails={currentProjectDetails ?? undefined}
      />
      <div className="z-[13] flex justify-evenly border-b border-subtle bg-surface-1 py-2 md:hidden">
        <MobileLayoutSelection
          layouts={[EIssueLayoutTypes.LIST, EIssueLayoutTypes.KANBAN, EIssueLayoutTypes.CALENDAR]}
          onChange={handleLayoutChange}
        />
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
                activeLayout ? projectScopeFilterConfig.layoutOptions[activeLayout] : undefined
              }
              displayFilters={scopedIssueFilters?.displayFilters ?? {}}
              handleDisplayFiltersUpdate={handleDisplayFilters}
              displayProperties={scopedIssueFilters?.displayProperties ?? {}}
              handleDisplayPropertiesUpdate={handleDisplayProperties}
              cycleViewDisabled={!currentProjectDetails?.cycle_view}
              moduleViewDisabled={!currentProjectDetails?.module_view}
            />
          </FiltersDropdown>
        </div>

        <button
          onClick={() => setAnalyticsModal(true)}
          className="flex flex-grow justify-center border-l border-subtle text-13 text-secondary"
        >
          {t("common.analytics")}
        </button>
      </div>
    </>
  );
});
