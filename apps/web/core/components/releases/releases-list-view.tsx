/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { MODULE_TRACKER_ELEMENTS, PROJECT_RELEASES_CREATE_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import type { TReleaseGroupByOption } from "@plane/types";
import { ContentWrapper, Row, ERowVariant } from "@plane/ui";
import { ListLayout } from "@/components/core/list";
import { ReleasesListGanttChartView } from "@/components/releases/gantt-chart/releases-list-layout";
import { ReleaseCardItem } from "@/components/releases/release-card-item";
import { ReleaseGroupSidebar } from "@/components/releases/list/release-group-sidebar";
import { ReleaseListItem } from "@/components/releases/release-list-item";
import { ReleasePeekOverview } from "@/components/releases/release-peek-overview";
import { CycleModuleBoardLayoutLoader } from "@/components/ui/loader/cycle-module-board-loader";
import { CycleModuleListLayoutLoader } from "@/components/ui/loader/cycle-module-list-loader";
import { GanttLayoutLoader } from "@/components/ui/loader/layouts/gantt-layout-loader";
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useRelease } from "@/hooks/store/use-release";
import { useReleaseFilter } from "@/hooks/store/use-release-filter";
import { useReleaseGroups } from "@/hooks/store/use-release-groups";
import { useUserPermissions } from "@/hooks/store/user";

export const ReleasesListView = observer(function ReleasesListView() {
  const { workspaceSlug, projectId } = useParams();
  const { t } = useTranslation();
  const { toggleCreateReleaseModal } = useCommandPalette();
  const { getProjectReleaseIds, getFilteredReleaseIds, loader } = useRelease();
  const { currentProjectDisplayFilters: displayFilters } = useReleaseFilter();
  const { allowProjectPermissionKeys } = useUserPermissions();

  const projectReleaseIds = projectId ? getProjectReleaseIds(projectId.toString()) : undefined;
  const filteredReleaseIds = projectId ? getFilteredReleaseIds(projectId.toString()) : undefined;
  const workspaceSlugValue = workspaceSlug?.toString() ?? "";
  const projectIdValue = projectId?.toString() ?? "";
  const canPerformEmptyStateActions =
    !!workspaceSlugValue &&
    !!projectIdValue &&
    allowProjectPermissionKeys([PROJECT_RELEASES_CREATE_PERMISSION_KEY], workspaceSlugValue, projectIdValue);

  const rawGroupBy = displayFilters?.group_by;
  const groupBy: TReleaseGroupByOption =
    rawGroupBy === "status" || rawGroupBy === "lead" || rawGroupBy === "none" ? rawGroupBy : "status";

  const releaseIdsForGrouping = useMemo(() => filteredReleaseIds ?? [], [filteredReleaseIds]);
  const { groups: groupsForSidebar, releaseIdsByGroup } = useReleaseGroups(releaseIdsForGrouping, groupBy);

  const [selectedGroupId, setSelectedGroupId] = useState<string>("");

  useEffect(() => {
    const currentIsValid = selectedGroupId && groupsForSidebar.some((group) => group.id === selectedGroupId);
    if (!currentIsValid) {
      setSelectedGroupId(groupsForSidebar[0]?.id ?? "");
    }
  }, [groupBy, groupsForSidebar, selectedGroupId]);

  if (loader || !projectReleaseIds || !filteredReleaseIds)
    return (
      <>
        {displayFilters?.layout === "list" && <CycleModuleListLayoutLoader />}
        {displayFilters?.layout === "board" && <CycleModuleBoardLayoutLoader />}
        {displayFilters?.layout === "gantt" && <GanttLayoutLoader />}
      </>
    );

  if (projectReleaseIds.length === 0)
    return (
      <EmptyStateDetailed
        assetKey="module"
        title={t("project_empty_state.releases.title") ?? "No releases yet"}
        description={
          t("project_empty_state.releases.description") ?? "Create your first release to organize work items."
        }
        actions={[
          {
            label: t("project_empty_state.releases.cta_primary") ?? t("project_release.add_release") ?? "添加发布",
            onClick: () => toggleCreateReleaseModal(true),
            disabled: !canPerformEmptyStateActions,
            variant: "primary",
            "data-ph-element": MODULE_TRACKER_ELEMENTS.RIGHT_HEADER_ADD_BUTTON,
          },
        ]}
      />
    );

  if (filteredReleaseIds.length === 0)
    return (
      <EmptyStateDetailed
        assetKey="search"
        title={t("common_empty_state.search.title")}
        description={t("common_empty_state.search.description")}
      />
    );

  const isListLayout = displayFilters?.layout === "list";
  const useGroupedListLayout = isListLayout && groupBy !== "none";
  const visibleReleaseIds = useGroupedListLayout
    ? selectedGroupId
      ? (releaseIdsByGroup[selectedGroupId] ?? [])
      : []
    : filteredReleaseIds;

  return (
    <ContentWrapper variant={ERowVariant.HUGGING} className={useGroupedListLayout ? "flex-row" : undefined}>
      {useGroupedListLayout ? (
        <div className="relative flex size-full overflow-hidden bg-surface-2">
          <ReleaseGroupSidebar
            groups={groupsForSidebar}
            groupBy={groupBy}
            selectedGroupId={selectedGroupId}
            onSelectGroup={setSelectedGroupId}
          />
          <div className="vertical-scrollbar scrollbar-lg h-full min-w-0 flex-1 overflow-y-auto bg-surface-1">
            <ListLayout>
              {visibleReleaseIds.map((releaseId) => (
                <ReleaseListItem key={releaseId} releaseId={releaseId} />
              ))}
            </ListLayout>
          </div>
        </div>
      ) : (
        <div className="flex size-full justify-between">
          {displayFilters?.layout === "list" && (
            <ListLayout>
              {filteredReleaseIds.map((releaseId) => (
                <ReleaseListItem key={releaseId} releaseId={releaseId} />
              ))}
            </ListLayout>
          )}
          {displayFilters?.layout === "board" && (
            <Row className="3xl:grid-cols-4 vertical-scrollbar grid scrollbar-lg size-full auto-rows-max grid-cols-1 gap-6 overflow-y-auto py-page-y transition-all lg:grid-cols-2 xl:grid-cols-3">
              {filteredReleaseIds.map((releaseId) => (
                <ReleaseCardItem key={releaseId} releaseId={releaseId} />
              ))}
            </Row>
          )}
          {displayFilters?.layout === "gantt" && (
            <div className="size-full overflow-hidden">
              <ReleasesListGanttChartView />
            </div>
          )}
          <ReleasePeekOverview
            projectId={projectId?.toString() ?? ""}
            workspaceSlug={workspaceSlug?.toString() ?? ""}
          />
        </div>
      )}
      {useGroupedListLayout && (
        <ReleasePeekOverview projectId={projectId?.toString() ?? ""} workspaceSlug={workspaceSlug?.toString() ?? ""} />
      )}
    </ContentWrapper>
  );
});
