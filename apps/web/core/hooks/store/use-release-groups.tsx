/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { Ban, CircleAlert, CircleCheck, CircleDashed, CirclePause, PlayCircle } from "lucide-react";
import { MODULE_STATUS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { IRelease, TReleaseGroupByOption, TReleaseStatus } from "@plane/types";
import { Avatar } from "@plane/ui";
import { getFileURL } from "@plane/utils";
import type { TReleaseSidebarGroup } from "@/components/releases/list/release-group-sidebar";
import { useMember } from "@/hooks/store/use-member";
import { useRelease } from "@/hooks/store/use-release";

const STATUS_ORDER: TReleaseStatus[] = ["in-progress", "planned", "backlog", "paused", "completed", "cancelled"];

const statusIconByValue: Record<TReleaseStatus, ComponentType<SVGProps<SVGSVGElement>>> = {
  "in-progress": PlayCircle,
  planned: CircleDashed,
  backlog: CircleAlert,
  paused: CirclePause,
  completed: CircleCheck,
  cancelled: Ban,
};

type TReleaseGroupsResult = {
  groups: TReleaseSidebarGroup[];
  releaseIdsByGroup: Record<string, string[]>;
};

/**
 * 根据 release id 列表和分组方式计算分组信息（用于左侧分组侧边栏和右侧内容）。
 */
export const useReleaseGroups = (
  releaseIds: string[],
  groupBy: TReleaseGroupByOption
): TReleaseGroupsResult => {
  const { t } = useTranslation();
  const { getReleaseById } = useRelease();
  const { getUserDetails } = useMember();

  const releases = useMemo(
    () =>
      releaseIds
        .map((releaseId) => getReleaseById(releaseId))
        .filter((release): release is IRelease => !!release),
    [releaseIds, getReleaseById]
  );

  return useMemo<TReleaseGroupsResult>(() => {
    if (groupBy === "status") {
      const statusMap: Record<string, string[]> = {};
      STATUS_ORDER.forEach((status) => {
        statusMap[status] = [];
      });
      releases.forEach((release) => {
        const statusKey: TReleaseStatus = (release.status as TReleaseStatus) ?? "backlog";
        const bucket = statusMap[statusKey] ?? statusMap.backlog ?? [];
        bucket.push(release.id);
        statusMap[statusKey] = bucket;
      });

      const groups: TReleaseSidebarGroup[] = STATUS_ORDER.map((statusValue) => {
        const statusInfo = MODULE_STATUS.find((s) => s.value === statusValue);
        const IconComponent = statusIconByValue[statusValue] ?? CircleDashed;
        const iconNode: ReactNode = (
          <IconComponent
            className="size-4"
            strokeWidth={2}
            style={statusInfo?.color ? { color: statusInfo.color } : undefined}
          />
        );
        return {
          id: statusValue,
          name: statusInfo ? t(statusInfo.i18n_label) : statusValue,
          count: statusMap[statusValue]?.length ?? 0,
          icon: iconNode,
        };
      });

      return { groups, releaseIdsByGroup: statusMap };
    }

    if (groupBy === "lead") {
      const leadMap: Record<string, string[]> = {};
      releases.forEach((release) => {
        const leadKey = release.lead_id || "unassigned";
        if (!leadMap[leadKey]) leadMap[leadKey] = [];
        leadMap[leadKey]?.push(release.id);
      });

      const groups: TReleaseSidebarGroup[] = Object.keys(leadMap)
        .map<TReleaseSidebarGroup>((leadKey) => {
          if (leadKey === "unassigned") {
            return {
              id: leadKey,
              name: t("no_assignee"),
              count: leadMap[leadKey]?.length ?? 0,
            };
          }
          const member = getUserDetails(leadKey);
          const iconNode: ReactNode = (
            <Avatar size="sm" name={member?.display_name ?? ""} src={getFileURL(member?.avatar_url ?? "")} />
          );
          return {
            id: leadKey,
            name: member?.display_name || t("common.unknown"),
            count: leadMap[leadKey]?.length ?? 0,
            icon: iconNode,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      const unassigned = groups.find((group) => group.id === "unassigned");
      const assigned = groups.filter((group) => group.id !== "unassigned");
      const ordered = [...assigned, ...(unassigned ? [unassigned] : [])];

      return { groups: ordered, releaseIdsByGroup: leadMap };
    }

    return { groups: [], releaseIdsByGroup: {} };
  }, [groupBy, releases, t, getUserDetails]);
};
