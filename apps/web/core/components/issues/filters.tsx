/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import { observer } from "mobx-react";
import { usePathname } from "next/navigation";
import { ChartNoAxesColumn, SlidersHorizontal } from "lucide-react";
// plane imports
import { EIssueFilterType, ISSUE_DISPLAY_FILTERS_BY_PAGE, ISSUE_STORE_TO_FILTERS_MAP } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";
import { EIssueLayoutTypes, EIssuesStoreType } from "@plane/types";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
// plane web imports
import type { TProject } from "@/plane-web/types";
import { getProjectScopeFilterConfig } from "@/components/issues/typed-page-filter-config";
import { getProjectIssueScopeFromPathname } from "@/store/issue/project";
// local imports
import { WorkItemsModal } from "../analytics/work-items/modal";
import { WorkItemFiltersToggle } from "../work-item-filters/filters-toggle";
import {
  DisplayFiltersSelection,
  FiltersDropdown,
  LayoutSelection,
  MobileLayoutSelection,
} from "./issue-layouts/filters";

type Props = {
  currentProjectDetails: TProject | undefined;
  projectId: string;
  workspaceSlug: string;
  canUserCreateIssue: boolean | undefined;
  storeType?: EIssuesStoreType.PROJECT | EIssuesStoreType.EPIC;
};
const LAYOUTS = [
  EIssueLayoutTypes.LIST,
  EIssueLayoutTypes.KANBAN,
  EIssueLayoutTypes.CALENDAR,
  EIssueLayoutTypes.SPREADSHEET,
  EIssueLayoutTypes.GANTT,
];

export const HeaderFilters = observer(function HeaderFilters(props: Props) {
  const {
    currentProjectDetails,
    projectId,
    workspaceSlug,
    canUserCreateIssue,
    storeType = EIssuesStoreType.PROJECT,
  } = props;
  // i18n
  const { t } = useTranslation();
  // states
  const [analyticsModal, setAnalyticsModal] = useState(false);
  // router — detect typed pages (requirements / defects)
  const pathname = usePathname();
  const scope = getProjectIssueScopeFromPathname(pathname);
  // typed pages use a variant-scoped filter entityId to keep their instances isolated
  const filterEntityId = scope === "issues" ? projectId : `${projectId}_${scope}`;
  // store hooks
  const { issuesFilter } = useIssues(storeType);
  // derived values
  const scopedIssueFilters =
    storeType === EIssuesStoreType.PROJECT
      ? issuesFilter?.getIssueFilters?.(projectId, scope)
      : issuesFilter?.issueFilters;
  const activeLayout = scopedIssueFilters?.displayFilters?.layout;
  const projectScopeFilterConfig = getProjectScopeFilterConfig(scope);
  const layoutDisplayFiltersOptions =
    storeType === EIssuesStoreType.PROJECT
      ? projectScopeFilterConfig?.layoutOptions?.[activeLayout]
      : ISSUE_STORE_TO_FILTERS_MAP[storeType]?.layoutOptions[activeLayout];

  const handleLayoutChange = useCallback(
    (layout: EIssueLayoutTypes) => {
      if (!workspaceSlug || !projectId) return;
      issuesFilter.updateFilters(workspaceSlug, projectId, EIssueFilterType.DISPLAY_FILTERS, { layout: layout }, scope);
    },
    [workspaceSlug, projectId, issuesFilter, scope]
  );

  const handleDisplayFilters = useCallback(
    (updatedDisplayFilter: Partial<IIssueDisplayFilterOptions>) => {
      if (!workspaceSlug || !projectId) return;
      issuesFilter.updateFilters(workspaceSlug, projectId, EIssueFilterType.DISPLAY_FILTERS, updatedDisplayFilter, scope);
    },
    [workspaceSlug, projectId, issuesFilter, scope]
  );

  const handleDisplayProperties = useCallback(
    (property: Partial<IIssueDisplayProperties>) => {
      if (!workspaceSlug || !projectId) return;
      issuesFilter.updateFilters(workspaceSlug, projectId, EIssueFilterType.DISPLAY_PROPERTIES, property, scope);
    },
    [workspaceSlug, projectId, issuesFilter, scope]
  );

  return (
    <>
      <WorkItemsModal
        isOpen={analyticsModal}
        onClose={() => setAnalyticsModal(false)}
        projectDetails={currentProjectDetails ?? undefined}
        isEpic={storeType === EIssuesStoreType.EPIC}
      />
      <div className="hidden @4xl:flex">
        <LayoutSelection
          layouts={LAYOUTS}
          onChange={(layout) => handleLayoutChange(layout)}
          selectedLayout={activeLayout}
        />
      </div>
      <div className="flex @4xl:hidden">
        <MobileLayoutSelection
          layouts={LAYOUTS}
          onChange={(layout) => handleLayoutChange(layout)}
          activeLayout={activeLayout}
        />
      </div>
      <WorkItemFiltersToggle
        entityType={storeType}
        entityId={filterEntityId}
        initialExpression={scopedIssueFilters?.richFilters}
        filterRowHiddenOnMount={scope === "requirements" || scope === "defects"}
      />
      <FiltersDropdown
        miniIcon={<SlidersHorizontal className="size-3.5" />}
        title={t("common.display")}
        placement="bottom-end"
      >
        <DisplayFiltersSelection
          layoutDisplayFiltersOptions={layoutDisplayFiltersOptions}
          displayFilters={scopedIssueFilters?.displayFilters ?? {}}
          handleDisplayFiltersUpdate={handleDisplayFilters}
          displayProperties={scopedIssueFilters?.displayProperties ?? {}}
          handleDisplayPropertiesUpdate={handleDisplayProperties}
          cycleViewDisabled={!currentProjectDetails?.cycle_view}
          moduleViewDisabled={!currentProjectDetails?.module_view}
          isEpic={storeType === EIssuesStoreType.EPIC}
        />
      </FiltersDropdown>
      {canUserCreateIssue ? (
        <Button className="hidden px-2 md:block" onClick={() => setAnalyticsModal(true)} variant="secondary" size="lg">
          <div className="hidden @4xl:flex">{t("common.analytics")}</div>
          <div className="flex @4xl:hidden">
            <ChartNoAxesColumn className="size-3.5" />
          </div>
        </Button>
      ) : (
        <></>
      )}
    </>
  );
});
