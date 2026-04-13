/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import { useParams, useSearchParams } from "next/navigation";
import { EUserPermissionsLevel, MODULE_TRACKER_ELEMENTS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { EUserProjectRoles } from "@plane/types";
import { ContentWrapper, Row, ERowVariant } from "@plane/ui";
import { ListLayout } from "@/components/core/list";
import { ReleasesListGanttChartView } from "@/components/releases/gantt-chart/releases-list-layout";
import { ReleaseCardItem } from "@/components/releases/release-card-item";
import { ReleaseListItem } from "@/components/releases/release-list-item";
import { ReleasePeekOverview } from "@/components/releases/release-peek-overview";
import { CycleModuleBoardLayoutLoader } from "@/components/ui/loader/cycle-module-board-loader";
import { CycleModuleListLayoutLoader } from "@/components/ui/loader/cycle-module-list-loader";
import { GanttLayoutLoader } from "@/components/ui/loader/layouts/gantt-layout-loader";
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useRelease } from "@/hooks/store/use-release";
import { useReleaseFilter } from "@/hooks/store/use-release-filter";
import { useUserPermissions } from "@/hooks/store/user";

export const ReleasesListView = observer(function ReleasesListView() {
  const { workspaceSlug, projectId } = useParams();
  const searchParams = useSearchParams();
  const peekRelease = searchParams.get("peekRelease");
  const { t } = useTranslation();
  const { toggleCreateReleaseModal } = useCommandPalette();
  const { getProjectReleaseIds, getFilteredReleaseIds, loader } = useRelease();
  const { currentProjectDisplayFilters: displayFilters } = useReleaseFilter();
  const { allowPermissions } = useUserPermissions();

  const projectReleaseIds = projectId ? getProjectReleaseIds(projectId.toString()) : undefined;
  const filteredReleaseIds = projectId ? getFilteredReleaseIds(projectId.toString()) : undefined;
  const canPerformEmptyStateActions = allowPermissions(
    [EUserProjectRoles.ADMIN, EUserProjectRoles.MEMBER],
    EUserPermissionsLevel.PROJECT
  );

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

  return (
    <ContentWrapper variant={ERowVariant.HUGGING}>
      <div className="flex size-full justify-between">
        {displayFilters?.layout === "list" && (
          <ListLayout>
            {filteredReleaseIds.map((releaseId) => (
              <ReleaseListItem key={releaseId} releaseId={releaseId} />
            ))}
          </ListLayout>
        )}
        {displayFilters?.layout === "board" && (
          <Row
            className={`grid size-full grid-cols-1 gap-6 overflow-y-auto py-page-y ${
              peekRelease
                ? "3xl:grid-cols-3 lg:grid-cols-1 xl:grid-cols-2"
                : "3xl:grid-cols-4 lg:grid-cols-2 xl:grid-cols-3"
            } vertical-scrollbar scrollbar-lg auto-rows-max transition-all`}
          >
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
        <div className="flex-shrink-0">
          <ReleasePeekOverview projectId={projectId?.toString() ?? ""} workspaceSlug={workspaceSlug?.toString() ?? ""} />
        </div>
      </div>
    </ContentWrapper>
  );
});
