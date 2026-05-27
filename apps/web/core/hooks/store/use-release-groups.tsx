/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { useTranslation } from "@plane/i18n";
import type { IRelease, TReleaseGroupByOption, TReleaseStatus } from "@plane/types";
import { Avatar } from "@plane/ui";
import { getReleaseStatusDetails, RELEASE_STATUS_ORDER } from "@/components/releases/release-status-config";
import { getFileURL } from "@plane/utils";
import type { TReleaseSidebarGroup } from "@/components/releases/list/release-group-sidebar";
import { useMember } from "@/hooks/store/use-member";
import { useRelease } from "@/hooks/store/use-release";

const STATUS_ORDER: TReleaseStatus[] = RELEASE_STATUS_ORDER;

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
        const statusKey = getReleaseStatusDetails(release.status).value;
        const bucket = statusMap[statusKey] ?? statusMap["not-started"] ?? [];
        bucket.push(release.id);
        statusMap[statusKey] = bucket;
      });

      const groups: TReleaseSidebarGroup[] = STATUS_ORDER.map((statusValue) => {
        const statusInfo = getReleaseStatusDetails(statusValue);
        const IconComponent: ComponentType<SVGProps<SVGSVGElement>> = statusInfo.icon;
        const iconNode: ReactNode = (
          <IconComponent
            className="size-4"
            strokeWidth={2}
            style={{ color: statusInfo.color }}
          />
        );
        return {
          id: statusValue,
          name: statusInfo.label,
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
