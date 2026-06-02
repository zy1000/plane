/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useEffect, useMemo, useState } from "react";
import type { ComponentType, SVGProps } from "react";
import { observer } from "mobx-react";
import { Ban, Circle, CircleCheck, CircleDashed } from "lucide-react";
// components
import { CYCLE_STATUS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { ContrastIcon } from "@plane/propel/icons";
import { Avatar, ContentWrapper, ERowVariant } from "@plane/ui";
import type { ICycle, TCycleGroups } from "@plane/types";
import { getFileURL } from "@plane/utils";
import { ListLayout } from "@/components/core/list";
import { useCycle } from "@/hooks/store/use-cycle";
import { useCycleFilter } from "@/hooks/store/use-cycle-filter";
import { useMember } from "@/hooks/store/use-member";
import { useRelease } from "@/hooks/store/use-release";
// local imports
import { CyclePeekOverview } from "../cycle-peek-overview";
import { CycleGroupSidebar } from "./cycle-group-sidebar";
import { CyclesListMap } from "./cycles-list-map";

export interface ICyclesList {
  cycleIds: string[];
  workspaceSlug: string;
  projectId: string;
  isArchived?: boolean;
}

export const CyclesList = observer(function CyclesList(props: ICyclesList) {
  const { cycleIds, workspaceSlug, projectId, isArchived = false } = props;
  const { t } = useTranslation();
  const { getCycleById } = useCycle();
  const { currentProjectDisplayFilters } = useCycleFilter();
  const { getUserDetails } = useMember();
  const { getReleaseNameById } = useRelease();
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const rawGroupBy = currentProjectDisplayFilters?.group_by;
  const groupBy: "state" | "owned_by" | "release" | "none" =
    rawGroupBy === "owned_by" || rawGroupBy === "release" || rawGroupBy === "none" ? rawGroupBy : "state";

  const getStatusTitle = (status: TCycleGroups) =>
    t(CYCLE_STATUS.find((s) => s.value === status)?.i18n_title ?? status);

  const getStatusIcon = (status: TCycleGroups) => {
    const color = CYCLE_STATUS.find((s) => s.value === status)?.color;
    const iconByStatus: Record<TCycleGroups, ComponentType<SVGProps<SVGSVGElement>>> = {
      in_progress: ContrastIcon as unknown as ComponentType<SVGProps<SVGSVGElement>>,
      testing: Circle,
      not_started: CircleDashed,
      completed: CircleCheck,
      cancelled: Ban,
    };
    const IconComponent = iconByStatus[status] ?? CircleDashed;
    return <IconComponent className="size-4" style={color ? { color } : undefined} strokeWidth={2} />;
  };

  const cycles = useMemo(
    () => cycleIds.map((cycleId) => getCycleById(cycleId)).filter((cycle): cycle is ICycle => !!cycle),
    [cycleIds, getCycleById]
  );

  const groupedCycleIds = useMemo(() => {
    const groups: Record<TCycleGroups, string[]> = {
      not_started: [],
      in_progress: [],
      testing: [],
      completed: [],
      cancelled: [],
    };

    cycleIds.forEach((cycleId) => {
      const cycle = getCycleById(cycleId);
      const status = cycle?.status ?? "not_started";
      (groups[status] ?? groups.not_started).push(cycleId);
    });

    return groups;
  }, [cycleIds, getCycleById]);

  const stateSidebarGroups = useMemo(
    () => [
      {
        id: "not_started",
        name: getStatusTitle("not_started"),
        count: groupedCycleIds.not_started.length,
        icon: getStatusIcon("not_started"),
      },
      {
        id: "in_progress",
        name: getStatusTitle("in_progress"),
        count: groupedCycleIds.in_progress.length,
        icon: getStatusIcon("in_progress"),
      },
      {
        id: "testing",
        name: getStatusTitle("testing"),
        count: groupedCycleIds.testing.length,
        icon: getStatusIcon("testing"),
      },
      {
        id: "completed",
        name: getStatusTitle("completed"),
        count: groupedCycleIds.completed.length,
        icon: getStatusIcon("completed"),
      },
      {
        id: "cancelled",
        name: getStatusTitle("cancelled"),
        count: groupedCycleIds.cancelled.length,
        icon: getStatusIcon("cancelled"),
      },
    ],
    [getStatusTitle, getStatusIcon, groupedCycleIds]
  );

  const ownerGroupData = useMemo(() => {
    const groupedByOwner: Record<string, string[]> = {};
    cycles.forEach((cycle) => {
      const ownerKey = cycle.owned_by_id || "unassigned";
      if (!groupedByOwner[ownerKey]) groupedByOwner[ownerKey] = [];
      groupedByOwner[ownerKey]?.push(cycle.id);
    });

    const groups = Object.keys(groupedByOwner)
      .map((ownerKey) => {
        if (ownerKey === "unassigned") {
          return {
            id: ownerKey,
            name: t("no_assignee"),
            count: groupedByOwner[ownerKey]?.length ?? 0,
            cycleIds: groupedByOwner[ownerKey] ?? [],
          };
        }
        const member = getUserDetails(ownerKey);
        return {
          id: ownerKey,
          name: member?.display_name || t("common.unknown"),
          count: groupedByOwner[ownerKey]?.length ?? 0,
          cycleIds: groupedByOwner[ownerKey] ?? [],
          icon: <Avatar size="sm" name={member?.display_name ?? ""} src={getFileURL(member?.avatar_url ?? "")} />,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const unassigned = groups.find((group) => group.id === "unassigned");
    const assigned = groups.filter((group) => group.id !== "unassigned");
    return [...assigned, ...(unassigned ? [unassigned] : [])];
  }, [cycles, getUserDetails, t]);

  const releaseGroupData = useMemo(() => {
    const groupedByRelease: Record<string, string[]> = {};
    cycles.forEach((cycle) => {
      const key = cycle.release_id || "no_release";
      if (!groupedByRelease[key]) groupedByRelease[key] = [];
      groupedByRelease[key]?.push(cycle.id);
    });

    const groups = Object.keys(groupedByRelease)
      .map((key) => {
        if (key === "no_release") {
          return {
            id: key,
            name: t("release.no_release"),
            count: groupedByRelease[key]?.length ?? 0,
            cycleIds: groupedByRelease[key] ?? [],
          };
        }
        return {
          id: key,
          name: getReleaseNameById(key) || t("common.unknown"),
          count: groupedByRelease[key]?.length ?? 0,
          cycleIds: groupedByRelease[key] ?? [],
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const noRelease = groups.find((group) => group.id === "no_release");
    const withRelease = groups.filter((group) => group.id !== "no_release");
    return [...withRelease, ...(noRelease ? [noRelease] : [])];
  }, [cycles, getReleaseNameById, t]);

  const groupsForSidebar =
    groupBy === "state" ? stateSidebarGroups : groupBy === "owned_by" ? ownerGroupData : releaseGroupData;

  const groupedCycleIdsMap = useMemo(() => {
    if (groupBy === "state") return groupedCycleIds;
    const map: Record<string, string[]> = {};
    const source = groupBy === "owned_by" ? ownerGroupData : releaseGroupData;
    source.forEach((group) => {
      map[group.id] = group.cycleIds;
    });
    return map;
  }, [groupBy, groupedCycleIds, ownerGroupData, releaseGroupData]);

  useEffect(() => {
    const currentIsValid = selectedGroupId && groupsForSidebar.some((group) => group.id === selectedGroupId);
    if (!currentIsValid) {
      setSelectedGroupId(groupsForSidebar[0]?.id ?? "");
    }
  }, [groupBy, groupsForSidebar, selectedGroupId]);

  const selectedCycleIds = selectedGroupId ? groupedCycleIdsMap[selectedGroupId] ?? [] : [];

  const isFlatLayout = isArchived || groupBy === "none";

  return (
    <ContentWrapper variant={ERowVariant.HUGGING} className="flex-row">
      {isFlatLayout ? (
        <ListLayout>
          <CyclesListMap cycleIds={cycleIds} projectId={projectId} workspaceSlug={workspaceSlug} />
        </ListLayout>
      ) : (
        <div className="relative flex h-full w-full overflow-hidden bg-surface-2">
          <CycleGroupSidebar
            groups={groupsForSidebar}
            groupBy={groupBy}
            selectedGroupId={selectedGroupId}
            onSelectGroup={setSelectedGroupId}
          />
          <div className="vertical-scrollbar scrollbar-lg h-full min-w-0 flex-1 overflow-y-auto bg-surface-1">
            <CyclesListMap cycleIds={selectedCycleIds} projectId={projectId} workspaceSlug={workspaceSlug} />
          </div>
        </div>
      )}
      <CyclePeekOverview projectId={projectId} workspaceSlug={workspaceSlug} isArchived={isArchived} />
    </ContentWrapper>
  );
});
