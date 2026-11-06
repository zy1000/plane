/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import type { IUserLite, TProjectVisibleMembers, TProjectVisiblePerson } from "@plane/types";
import { hasProjectPermission, personInChannel } from "./helpers";
import type { TVisibleChannel } from "./helpers";

export type TVisibleScope = "all" | "member" | "outside";

/** 名单分段：具有操作权限 / 仅可查看 */
export type TVisibleSection = "with" | "without";

export type TVisibleRow = { person: TProjectVisiblePerson; section: TVisibleSection };

export const ALL_CHANNELS = "__all__";

const PAGE_SIZE = 20;

/**
 * 可访问人员表的筛选：范围（全部 / 项目成员 / 非项目成员）、授权来源标签、搜索（姓名 / 工号 / 部门），
 * 结果按「具有操作权限 / 仅可查看」排成一列后分页（每页 20 人）。有非项目成员时默认看非项目成员。
 * 来源标签的人数按当前范围算，0 人的不显示；选中的来源在新范围里没人时回到「全部」。
 */
export const useVisiblePeopleFilter = (
  data: TProjectVisibleMembers,
  channels: TVisibleChannel[],
  getUserDetails: (userId: string) => IUserLite | undefined
) => {
  const memberCount = data.people.filter((person) => person.is_member).length;
  const outsideCount = data.people.length - memberCount;
  const [scope, setScope] = useState<TVisibleScope>(outsideCount > 0 ? "outside" : "all");
  const [channelKey, setChannelKey] = useState(ALL_CHANNELS);
  const [query, setQuery] = useState("");

  const scoped = data.people.filter((person) =>
    scope === "member" ? person.is_member : scope === "outside" ? !person.is_member : true
  );
  const channelItems = channels
    .map((item) => ({ channel: item, count: scoped.filter((person) => personInChannel(person, item)).length }))
    .filter((item) => item.count > 0);
  const channel = channelItems.find((item) => item.channel.key === channelKey)?.channel;
  const activeChannelKey = channel ? channel.key : ALL_CHANNELS;
  const keyword = query.trim().toLowerCase();
  const filtered = scoped.filter((person) => {
    if (channel && !personInChannel(person, channel)) return false;
    if (!keyword) return true;
    const user = getUserDetails(person.id);
    return [user?.display_name ?? person.display_name, user?.employee_id, user?.department].some((value) =>
      value?.toLowerCase().includes(keyword)
    );
  });

  const rows: TVisibleRow[] = [
    ...filtered.filter(hasProjectPermission).map((person) => ({ person, section: "with" as const })),
    ...filtered.filter((person) => !hasProjectPermission(person)).map((person) => ({ person, section: "without" as const })),
  ];
  const sectionCounts: Record<TVisibleSection, number> = {
    with: rows.filter((row) => row.section === "with").length,
    without: rows.filter((row) => row.section === "without").length,
  };

  // 换了筛选条件就回到第一页
  const signature = `${scope}|${activeChannelKey}|${keyword}`;
  const [pageState, setPageState] = useState({ signature, page: 1 });
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = pageState.signature === signature ? Math.min(pageState.page, pageCount) : 1;
  const setPage = (next: number) => setPageState({ signature, page: next });

  return {
    scope,
    setScope,
    channelKey: activeChannelKey,
    setChannelKey,
    channelItems,
    scopedCount: scoped.length,
    query,
    setQuery,
    counts: { all: data.people.length, member: memberCount, outside: outsideCount },
    sectionCounts,
    total: rows.length,
    pageRows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    page,
    pageCount,
    setPage,
  };
};
