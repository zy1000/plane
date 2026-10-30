/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { observer } from "mobx-react";
import { usePathname } from "next/navigation";
// plane imports
import { EIssueFilterType, ISSUE_DISPLAY_FILTERS_BY_PAGE, ISSUE_STORE_TO_FILTERS_MAP } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { IIssueDisplayFilterOptions, IIssueDisplayProperties } from "@plane/types";
import { EIssueLayoutTypes, EIssuesStoreType } from "@plane/types";
// hooks
import { useIssues } from "@/hooks/store/use-issues";
// plane web imports
import type { TProject } from "@/plane-web/types";
import { getProjectScopeFilterConfig } from "@/components/issues/typed-page-filter-config";
import { getProjectIssueScopeFromPathname, type TProjectIssueScope } from "@/store/issue/project";
// local imports
import { WorkItemFiltersToggle } from "../work-item-filters/filters-toggle";
import { WorkItemSearch } from "./work-item-search";
import { DisplayFiltersSelection, FiltersDropdown, LayoutSelection } from "./issue-layouts/filters";

type Props = {
  currentProjectDetails: TProject | undefined;
  projectId: string;
  workspaceSlug: string;
  storeType?: EIssuesStoreType.PROJECT | EIssuesStoreType.EPIC;
  scope?: TProjectIssueScope;
  onFilterToggle?: () => void;
};
const LAYOUTS = [
  EIssueLayoutTypes.LIST,
  EIssueLayoutTypes.KANBAN,
  EIssueLayoutTypes.CALENDAR,
  EIssueLayoutTypes.SPREADSHEET,
  EIssueLayoutTypes.GANTT,
];

/**
 * 工作项 / 缺陷页工具栏里的搜索、布局切换、筛选、显示四件套。
 * 分析入口已挪到工具栏的「⋯」菜单里，由调用方自己渲染弹窗。
 */
export const HeaderFilters = observer(function HeaderFilters(props: Props) {
  const {
    currentProjectDetails,
    projectId,
    workspaceSlug,
    storeType = EIssuesStoreType.PROJECT,
    scope: scopeProp,
    onFilterToggle,
  } = props;
  // i18n
  const { t } = useTranslation();
  // router — detect typed pages (requirements / defects)
  const pathname = usePathname();
  const scope = scopeProp ?? getProjectIssueScopeFromPathname(pathname);
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
      {storeType === EIssuesStoreType.PROJECT && <WorkItemSearch entityType={storeType} entityId={filterEntityId} />}
      <LayoutSelection
        layouts={LAYOUTS}
        onChange={(layout) => handleLayoutChange(layout)}
        selectedLayout={activeLayout}
      />
      <WorkItemFiltersToggle
        entityType={storeType}
        entityId={filterEntityId}
        initialExpression={scopedIssueFilters?.richFilters}
        filterRowHiddenOnMount={scope === "defects"}
        onToggleFilter={onFilterToggle}
      />
      {/* 不传 miniIcon：工具栏不在 @container 里，@4xl 分支永远不命中，直接显示「显示」两个字 */}
      <FiltersDropdown title={t("common.display")} placement="bottom-end">
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
    </>
  );
});
