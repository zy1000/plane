/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import type { IProjectRoleSource, IUserLite } from "@plane/types";
import { useMember } from "@/hooks/store/use-member";

export type TProjectMemberRow = {
  /** 项目成员行 id */
  membershipId: string;
  user: IUserLite;
  department: string | null;
  joinedAt: string | null;
  jobRoleIds: string[];
  /** 直接绑定的本项目权限组 id */
  groupIds: string[];
  /** 通过团队继承来的权限组 */
  inheritedSources: IProjectRoleSource[];
};

/**
 * 项目成员表的行与筛选（搜索姓名 / 邮箱 / 工号，按角色、权限组过滤）。
 * 数据来自成员 store（fetchProjectMembers 已带 job_role_ids / custom_role_ids / role_sources）。
 */
export const useProjectMembersTable = (projectId: string) => {
  const [query, setQuery] = useState("");
  const [jobRoleFilter, setJobRoleFilter] = useState<string[]>([]);
  const [groupFilter, setGroupFilter] = useState<string[]>([]);
  const {
    getUserDetails,
    project: { getProjectMemberIds, getProjectMemberDetails },
  } = useMember();

  const memberIds = getProjectMemberIds(projectId, true);

  // 不用 useMemo：保存角色 / 权限组只替换成员详情里的数组，成员 id 列表不变，
  // 缓存住会让表格和编辑弹窗一直拿旧值。调用方是 observer，渲染时读到的字段会被追踪。
  const rows: TProjectMemberRow[] = !memberIds
    ? []
    : memberIds
      .map((userId) => {
        const details = getProjectMemberDetails(userId, projectId);
        const user = details?.member ?? getUserDetails(userId);
        if (!details?.id || !user) return null;
        return {
          membershipId: details.id,
          user,
          department: getUserDetails(userId)?.department ?? null,
          joinedAt: details.created_at ?? null,
          jobRoleIds: details.job_role_ids ?? [],
          groupIds: details.custom_role_ids ?? [],
          inheritedSources: (details.role_sources ?? []).filter((source) => source.type === "group_role"),
        };
      })
      .filter((row): row is TProjectMemberRow => row !== null);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (q) {
        const haystack = [row.user.display_name, row.user.first_name, row.user.last_name, row.user.email, row.user.employee_id]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (jobRoleFilter.length && !jobRoleFilter.some((id) => row.jobRoleIds.includes(id))) return false;
      if (groupFilter.length) {
        const held = new Set([...row.groupIds, ...row.inheritedSources.map((source) => source.role.id)]);
        if (!groupFilter.some((id) => held.has(id))) return false;
      }
      return true;
    });
  }, [groupFilter, jobRoleFilter, query, rows]);

  return {
    isLoading: memberIds === null,
    rows,
    filteredRows,
    query,
    setQuery,
    jobRoleFilter,
    setJobRoleFilter,
    groupFilter,
    setGroupFilter,
  };
};
