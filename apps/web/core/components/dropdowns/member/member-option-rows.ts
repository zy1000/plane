/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IUserLite } from "@plane/types";

/** 部门路径的层级分隔符，与后端 Department.path 一致 */
const DEPARTMENT_PATH_SEPARATOR = " / ";

/** 部门名按拼音排序；复用一个 Collator，每次 localeCompare 带 locale 会重新建一个，几百次就要几十毫秒 */
const departmentCollator = new Intl.Collator("zh-CN");

export type TMemberOptionMemberRow = {
  type: "member";
  key: string;
  userId: string;
  /** 部门全路径，悬停提示用 */
  department: string | null;
  /** 行内展示的部门末级名称；在部门分组里为 null（组标题已经写了） */
  departmentLabel: string | null;
  /** 只在重名或按工号搜中时展示 */
  employeeId: string | null;
};

export type TMemberOptionHeaderRow = {
  type: "header";
  key: string;
  /** 部门全路径；null 表示未分配部门 */
  department: string | null;
  /** 浏览时当前用户所在的部门，标题写成「同部门 · 部门名」 */
  isSameDepartment: boolean;
  count: number;
};

export type TMemberOptionRow = TMemberOptionMemberRow | TMemberOptionHeaderRow;

type TBuildMemberOptionRowsArgs = {
  memberIds: string[];
  getUserDetails: (userId: string) => IUserLite | undefined;
  query: string;
  selectedIds: string[];
  currentUserId: string | undefined;
  groupByDepartment: boolean;
};

export const getDepartmentLeafName = (department: string) =>
  department.split(DEPARTMENT_PATH_SEPARATOR).pop() ?? department;

/**
 * 把候选人排成选择器的行。
 * 平铺：你 → 已选 → 其余（保持传入顺序）；搜索时姓名/工号命中在前、部门命中在后。
 * 按部门分组：浏览时你和已选的人平铺在最前，其余按部门成组（本人部门最前、未分配部门最后）；
 * 搜索时姓名/工号命中的平铺在前，部门命中的整组列在后面。
 */
export const buildMemberOptionRows = (args: TBuildMemberOptionRowsArgs): TMemberOptionRow[] => {
  const { memberIds, getUserDetails, query, selectedIds, currentUserId, groupByDepartment } = args;
  const keyword = query.trim().toLowerCase();
  const selectedSet = new Set(selectedIds);
  const departmentOf = (userId: string) => getUserDetails(userId)?.department || null;
  const currentDepartment = currentUserId ? departmentOf(currentUserId) : null;
  const isOwnDepartment = (department: string | null) => department !== null && department === currentDepartment;

  const nameCount = new Map<string, number>();
  for (const userId of memberIds) {
    const name = getUserDetails(userId)?.display_name;
    if (name) nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  }

  const pinRank = (userId: string) => (userId === currentUserId ? 0 : selectedSet.has(userId) ? 1 : 2);
  const sortPinned = (userIds: string[]) => [...userIds].sort((a, b) => pinRank(a) - pinRank(b));

  const toMemberRow = (userId: string, inGroup: boolean): TMemberOptionMemberRow => {
    const user = getUserDetails(userId);
    const department = user?.department || null;
    const employeeId = user?.employee_id || null;
    const isDuplicateName = !!user?.display_name && (nameCount.get(user.display_name) ?? 0) > 1;
    const matchesEmployeeId = !!keyword && !!employeeId?.toLowerCase().includes(keyword);
    return {
      type: "member",
      key: `member:${userId}`,
      userId,
      department,
      departmentLabel: inGroup || !department ? null : getDepartmentLeafName(department),
      employeeId: isDuplicateName || matchesEmployeeId ? employeeId : null,
    };
  };

  const toGroupedRows = (userIds: string[]): TMemberOptionRow[] => {
    const groups = new Map<string | null, string[]>();
    for (const userId of userIds) {
      const department = departmentOf(userId);
      const group = groups.get(department);
      if (group) group.push(userId);
      else groups.set(department, [userId]);
    }
    // 整个名单都没有部门数据（如还没同步人员信息）时，只剩一个「未分配部门」标题没有意义，直接平铺
    if (groups.size === 1 && groups.has(null)) return sortPinned(userIds).map((userId) => toMemberRow(userId, false));
    const departments = [...groups.keys()].sort((a, b) => {
      if (isOwnDepartment(a)) return -1;
      if (isOwnDepartment(b)) return 1;
      if (a === null) return 1;
      if (b === null) return -1;
      return departmentCollator.compare(a, b);
    });
    return departments.flatMap((department) => {
      const members = sortPinned(groups.get(department) ?? []);
      const header: TMemberOptionHeaderRow = {
        type: "header",
        key: `header:${department ?? ""}`,
        department,
        isSameDepartment: !keyword && isOwnDepartment(department),
        count: members.length,
      };
      return [header, ...members.map((userId) => toMemberRow(userId, true))];
    });
  };

  if (!keyword) {
    const ordered = sortPinned(memberIds);
    if (!groupByDepartment) return ordered.map((userId) => toMemberRow(userId, false));
    const pinned = ordered.filter((userId) => pinRank(userId) < 2);
    const rest = ordered.filter((userId) => pinRank(userId) === 2);
    return [...pinned.map((userId) => toMemberRow(userId, false)), ...toGroupedRows(rest)];
  }

  const personMatched = memberIds.filter((userId) => {
    const user = getUserDetails(userId);
    return `${user?.display_name} ${user?.first_name} ${user?.last_name} ${user?.employee_id ?? ""}`
      .toLowerCase()
      .includes(keyword);
  });
  const personMatchedSet = new Set(personMatched);
  const departmentMatched = memberIds.filter(
    (userId) => !personMatchedSet.has(userId) && !!departmentOf(userId)?.toLowerCase().includes(keyword)
  );
  const personRows = sortPinned(personMatched).map((userId) => toMemberRow(userId, false));
  if (!groupByDepartment) {
    return [...personRows, ...sortPinned(departmentMatched).map((userId) => toMemberRow(userId, false))];
  }
  return [...personRows, ...toGroupedRows(departmentMatched)];
};
