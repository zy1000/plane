/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import type { TPermissionGroupMember } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { JobRoleTag } from "@/components/workspace/settings/job-roles/job-role-tag";
import { useJobRoles } from "@/hooks/store/use-job-roles";
import { useMember } from "@/hooks/store/use-member";
import { MemberIdentityCell, getMemberDisplayName } from "./member-identity-cell";
import { PermissionGroupPager, PermissionGroupSearch, PermissionGroupSegmented } from "./ui";

type TSourceFilter = "all" | "direct" | "job-role";

type Props = {
  workspaceSlug: string;
  /** 直接添加 ∪ 经角色；null = 还在加载 */
  members: TPermissionGroupMember[] | null;
  /** 直接进组的叫法：工作区权限组「直接添加」，项目里「直接分配」 */
  directLabel?: string;
  /** 工具栏右侧：添加成员按钮 / 到成员页调整的链接 */
  action?: ReactNode;
  /** 给了才有「操作」列。只有直接进组的人能移出；经角色的要摘角色或解除组与角色的绑定 */
  onRemove?: (userId: string) => void;
  error?: string | null;
  onRetry?: () => void;
};

const PAGE_SIZE = 20;
const GRID_BASE = "grid items-center gap-x-4 px-5";
const GRID_COLUMNS = {
  withOps: "grid-cols-[minmax(220px,1.5fr)_104px_minmax(120px,1fr)_minmax(200px,1.5fr)_56px]",
  plain: "grid-cols-[minmax(220px,1.5fr)_104px_minmax(120px,1fr)_minmax(200px,1.5fr)]",
};

const matchesSource = (member: TPermissionGroupMember, filter: TSourceFilter) =>
  filter === "all" || (filter === "direct" ? member.is_direct : member.job_role_ids.length > 0);

/**
 * 权限组详情的成员表（工作区、项目两级共用）：组里的人 = 直接进组的 ∪ 挂着组所绑角色的，
 * 「授权来源」列标明是哪一种；可按来源筛选、搜索、分页。
 */
export const PermissionGroupMembersTable = observer(function PermissionGroupMembersTable(props: Props) {
  const { workspaceSlug, members, directLabel = "直接添加", action, onRemove, error, onRetry } = props;
  const { getUserDetails } = useMember();
  const { jobRoleMap } = useJobRoles(workspaceSlug);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TSourceFilter>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [query, filter]);

  const all = members ?? [];
  const directCount = all.filter((member) => member.is_direct).length;
  const jobRoleCount = all.filter((member) => member.job_role_ids.length > 0).length;

  const keyword = query.trim().toLowerCase();
  const rows = all
    .filter((member) => matchesSource(member, filter))
    .map((member) => ({ member, user: getUserDetails(member.id) }))
    .filter(({ user }) => {
      if (!keyword) return true;
      const employeeId = (user as { employee_id?: string | null } | undefined)?.employee_id ?? "";
      return `${getMemberDisplayName(user)} ${user?.email ?? ""} ${employeeId}`.toLowerCase().includes(keyword);
    });
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const grid = cn(GRID_BASE, onRemove ? GRID_COLUMNS.withOps : GRID_COLUMNS.plain);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <PermissionGroupSearch value={query} onChange={setQuery} placeholder="搜索姓名、邮箱、工号" className="w-72" />
          {jobRoleCount > 0 && (
            <PermissionGroupSegmented<TSourceFilter>
              items={[
                { key: "all", label: "全部", count: all.length },
                { key: "direct", label: directLabel, count: directCount },
                { key: "job-role", label: "经角色", count: jobRoleCount },
              ]}
              value={filter}
              onChange={setFilter}
            />
          )}
        </div>
        {action}
      </div>

      <div className="overflow-x-auto rounded-xl border border-subtle bg-surface-1">
        <div className="min-w-[780px]">
          <div className={cn(grid, "h-11 border-b border-subtle bg-layer-1 text-13 font-medium text-tertiary")}>
            <span>成员</span>
            <span>工号</span>
            <span>部门</span>
            <span>授权来源</span>
            {onRemove && <span className="flex justify-end">操作</span>}
          </div>
          {members === null ? (
            <Loader className="flex flex-col gap-2 p-4">
              {[0, 1, 2].map((index) => (
                <Loader.Item key={index} height="36px" />
              ))}
            </Loader>
          ) : error ? (
            <div className="py-10 text-center">
              <p className="text-13 text-secondary">{error}</p>
              {onRetry && (
                <button type="button" className="mt-3 text-14 text-accent-primary hover:underline" onClick={onRetry}>
                  重试
                </button>
              )}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-14 text-center text-14 text-placeholder">
              {keyword || filter !== "all" ? "没有匹配的成员" : "还没有成员"}
            </p>
          ) : (
            pageRows.map(({ member, user }) => {
              const extra = user as { employee_id?: string | null; department?: string | null } | undefined;
              return (
                <div key={member.id} className={cn(grid, "min-h-16 border-b border-subtle py-2 text-14 last:border-b-0")}>
                  <MemberIdentityCell user={user} size="lg" />
                  <span className="truncate text-secondary tabular-nums">{extra?.employee_id || "—"}</span>
                  <span className="truncate text-secondary" title={extra?.department ?? ""}>
                    {extra?.department || "—"}
                  </span>
                  <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {member.is_direct && (
                      <span className="inline-flex h-6 shrink-0 items-center rounded-md border border-subtle px-2 text-12 font-medium text-secondary">
                        {directLabel}
                      </span>
                    )}
                    {member.job_role_ids.map((jobRoleId) => {
                      const role = jobRoleMap.get(jobRoleId);
                      return role ? (
                        <JobRoleTag key={jobRoleId} role={role} className="h-6 rounded-md px-2 text-12" />
                      ) : null;
                    })}
                  </span>
                  {onRemove && (
                    <span className="flex justify-end">
                      {member.is_direct ? (
                        <button
                          type="button"
                          className="text-14 text-secondary hover:text-danger-primary hover:underline"
                          onClick={() => onRemove(member.id)}
                        >
                          移出
                        </button>
                      ) : (
                        <span className="text-placeholder">—</span>
                      )}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
      {rows.length > 0 && (
        <PermissionGroupPager
          total={rows.length}
          page={currentPage}
          pageCount={pageCount}
          onPageChange={setPage}
          unit="人"
        />
      )}
    </div>
  );
});
