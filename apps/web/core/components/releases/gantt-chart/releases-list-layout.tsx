/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { PROJECT_RELEASES_EDIT_PERMISSION_KEY } from "@plane/constants";
import { GANTT_TIMELINE_TYPE } from "@plane/types";
import type { IBlockUpdateData, IBlockUpdateDependencyData, IRelease } from "@plane/types";
import { GanttChartRoot, ReleaseGanttSidebar } from "@/components/gantt-chart";
import { TimeLineTypeContext } from "@/components/gantt-chart/contexts";
import { ReleaseGanttBlock } from "@/components/releases/gantt-chart/blocks";
import { useRelease } from "@/hooks/store/use-release";
import { useReleaseFilter } from "@/hooks/store/use-release-filter";
import { useUserPermissions } from "@/hooks/store/user";

export const ReleasesListGanttChartView = observer(function ReleasesListGanttChartView() {
  const { workspaceSlug, projectId } = useParams();
  const { allowProjectPermissionKeys } = useUserPermissions();
  const { getFilteredReleaseIds, updateReleaseDetails } = useRelease();
  const { currentProjectDisplayFilters: displayFilters } = useReleaseFilter();

  const filteredReleaseIds = projectId ? getFilteredReleaseIds(projectId.toString()) : undefined;

  const handleReleaseUpdate = async (release: IRelease, data: IBlockUpdateData) => {
    if (!workspaceSlug || !release) return;

    const payload: Record<string, unknown> = { ...data };
    if (data.sort_order) payload.sort_order = data.sort_order.newSortOrder;

    await updateReleaseDetails(
      workspaceSlug.toString(),
      release.project_id,
      release.id,
      payload as Partial<IRelease>
    );
  };

  const updateBlockDates = async (blockUpdates: IBlockUpdateDependencyData[]) => {
    const blockUpdate = blockUpdates[0];

    if (!blockUpdate) return;

    const payload: Partial<IRelease> = {};

    if (blockUpdate.start_date) payload.start_date = blockUpdate.start_date;
    if (blockUpdate.target_date) payload.target_date = blockUpdate.target_date;

    await updateReleaseDetails(workspaceSlug.toString(), projectId.toString(), blockUpdate.id, payload);
  };

  // 拖动改日期 / 排序 / 加块都是改发布
  const isAllowed = allowProjectPermissionKeys([PROJECT_RELEASES_EDIT_PERMISSION_KEY]);

  if (!filteredReleaseIds) return null;

  return (
    <TimeLineTypeContext.Provider value={GANTT_TIMELINE_TYPE.RELEASE}>
      <GanttChartRoot
        title="Releases"
        loaderTitle="Releases"
        blockIds={filteredReleaseIds}
        sidebarToRender={(sidebarProps) => <ReleaseGanttSidebar {...sidebarProps} />}
        blockUpdateHandler={(block, payload) => handleReleaseUpdate(block, payload)}
        blockToRender={(data: IRelease) => <ReleaseGanttBlock releaseId={data.id} />}
        enableBlockLeftResize={isAllowed}
        enableBlockRightResize={isAllowed}
        enableBlockMove={isAllowed}
        enableReorder={isAllowed && displayFilters?.order_by === "sort_order"}
        enableAddBlock={isAllowed}
        updateBlockDates={updateBlockDates}
        showAllBlocks
      />
    </TimeLineTypeContext.Provider>
  );
});
