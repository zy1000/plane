/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
import { Building2, BriefcaseBusiness, Search, ShieldCheck, X } from "lucide-react";
import { MultiSelectFilterChip } from "@/components/common/multi-select-filter-chip";
import { useJobRoles } from "@/hooks/store/use-job-roles";
import { useMember } from "@/hooks/store/use-member";
import { useWorkspaceRoles } from "@/hooks/store/use-workspace-roles";

type Props = {
  workspaceSlug: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  /** 搜索 + 筛选之后剩几个人 */
  resultCount: number | null;
};

/** 工作区成员页的工具栏：搜索（姓名 / 邮箱 / 工号）+ 角色 / 权限组 / 部门三个筛选 + 人数 */
export const WorkspaceMembersFilterBar = observer(function WorkspaceMembersFilterBar(props: Props) {
  const { workspaceSlug, searchQuery, onSearchChange, resultCount } = props;
  const {
    getUserDetails,
    workspace: { filtersStore, getWorkspaceMemberIds },
  } = useMember();
  const { jobRoles } = useJobRoles(workspaceSlug);
  const { roles } = useWorkspaceRoles(workspaceSlug);
  const filters = filtersStore.filters;

  const jobRoleOptions = useMemo(() => jobRoles.map((item) => ({ id: item.id, label: item.label })), [jobRoles]);
  const groupOptions = useMemo(() => roles.map((role) => ({ id: role.id, label: role.name })), [roles]);
  const memberIds = getWorkspaceMemberIds(workspaceSlug);
  const departmentOptions = useMemo(() => {
    const departments = new Set<string>();
    memberIds.forEach((userId) => {
      const department = getUserDetails(userId)?.department;
      if (department) departments.add(department);
    });
    return [...departments].sort((a, b) => a.localeCompare(b, "zh-CN")).map((label) => ({ id: label, label }));
  }, [memberIds, getUserDetails]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex h-8 w-64 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5 focus-within:border-accent-strong">
        <Search className="size-3.5 shrink-0 text-placeholder" />
        <input
          className="min-w-0 flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
          placeholder="搜索姓名、邮箱、工号"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        {searchQuery && (
          <button type="button" aria-label="清除搜索" onClick={() => onSearchChange("")}>
            <X className="size-3 text-placeholder hover:text-primary" />
          </button>
        )}
      </div>
      <MultiSelectFilterChip
        icon={BriefcaseBusiness}
        label="角色"
        options={jobRoleOptions}
        value={filters?.job_role_ids ?? []}
        onChange={(value) => filtersStore.updateFilters({ job_role_ids: value.length ? value : undefined })}
      />
      <MultiSelectFilterChip
        icon={ShieldCheck}
        label="权限组"
        options={groupOptions}
        value={filters?.permission_group_ids ?? []}
        onChange={(value) => filtersStore.updateFilters({ permission_group_ids: value.length ? value : undefined })}
        searchable={groupOptions.length > 8}
      />
      <MultiSelectFilterChip
        icon={Building2}
        label="部门"
        options={departmentOptions}
        value={filters?.departments ?? []}
        onChange={(value) => filtersStore.updateFilters({ departments: value.length ? value : undefined })}
      />
      {resultCount !== null && <span className="ml-auto text-13 text-tertiary tabular-nums">{resultCount} 人</span>}
    </div>
  );
});
