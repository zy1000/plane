/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@plane/propel/button";
import type { TJobRolePermissionGroup } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { getPermissionGroupDetailPath } from "@/components/workspace/settings/permission-groups/helpers";
import { PermissionGroupSearch } from "@/components/workspace/settings/permission-groups/ui";
import { useJobRolePermissionGroups } from "@/hooks/store/use-workspace-job-roles";

const GRID =
  "grid grid-cols-[minmax(160px,1.1fr)_150px_minmax(200px,1.5fr)_minmax(180px,1.2fr)_56px] items-center gap-x-4 px-5";

const KIND_LABELS: Record<TJobRolePermissionGroup["kind"], string> = {
  workspace: "工作区权限组",
  data: "数据权限组",
  project_template: "项目标准权限组",
  project: "项目自定义权限组",
};

/** 生效对象：工作区权限组 / 数据权限对挂这个角色的工作区成员生效；项目里的组对挂这个角色的项目成员生效 */
const getTarget = (group: TJobRolePermissionGroup) => {
  if (group.kind === "project") return `项目成员 · ${group.project?.name ?? ""}`;
  if (group.kind === "project_template") return `项目成员 · ${group.referenced_project_count ?? 0} 个引用项目`;
  return "工作区成员";
};

const getPermissionText = (group: TJobRolePermissionGroup) => {
  if (group.kind === "data") return `${group.scope_project_count ?? 0} 个项目 · ${group.scope_product_count ?? 0} 个产品`;
  if (group.kind === "workspace") {
    return `工作区权限 ${group.workspace_permission_count} · 项目权限 ${group.project_permission_count}`;
  }
  return `项目权限 ${group.project_permission_count}`;
};

const getGroupPath = (workspaceSlug: string, group: TJobRolePermissionGroup) =>
  group.kind === "project" && group.project
    ? `/${workspaceSlug}/settings/projects/${group.project.id}/permission/${group.id}`
    : getPermissionGroupDetailPath(workspaceSlug, group.id, "job-roles");

/**
 * 角色详情「权限组」页签：这个角色绑在哪些权限组上——挂这个角色的人自动拥有这些组的权限。
 * 只读；绑定 / 解除在权限组详情的「角色」页签做，只留一个维护入口。
 */
export function JobRolePermissionGroups(props: { workspaceSlug: string; roleId: string }) {
  const { workspaceSlug, roleId } = props;
  const { data, isLoading, error, reload } = useJobRolePermissionGroups(workspaceSlug, roleId, true);
  const [query, setQuery] = useState("");

  const keyword = query.trim().toLowerCase();
  const rows = data.filter(
    (group) => !keyword || `${group.name} ${group.project?.name ?? ""}`.toLowerCase().includes(keyword)
  );

  return (
    <div className="flex flex-col gap-3">
      <PermissionGroupSearch value={query} onChange={setQuery} placeholder="搜索权限组" className="w-72" />
      <div className="overflow-x-auto rounded-xl border border-subtle bg-surface-1">
        <div className="min-w-[860px]">
          <div className={cn(GRID, "h-11 border-b border-subtle bg-layer-1 text-13 font-medium text-tertiary")}>
            <span>权限组</span>
            <span>类型</span>
            <span>生效对象</span>
            <span>权限</span>
            <span className="flex justify-end">操作</span>
          </div>
          {isLoading && data.length === 0 ? (
            <Loader className="flex flex-col gap-2 p-4">
              {[0, 1, 2].map((index) => (
                <Loader.Item key={index} height="40px" />
              ))}
            </Loader>
          ) : error ? (
            <div className="py-10 text-center">
              <p className="text-13 text-secondary">{error}</p>
              <Button className="mt-3" variant="secondary" size="lg" onClick={() => void reload()}>
                重试
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <p className="py-14 text-center text-14 text-placeholder">{keyword ? "没有匹配的权限组" : "尚未绑定权限组"}</p>
          ) : (
            rows.map((group) => (
              <div
                key={`${group.kind}-${group.id}`}
                className={cn(GRID, "min-h-[60px] border-b border-subtle py-2 text-14 last:border-b-0")}
              >
                <span className="truncate font-medium text-primary" title={group.name}>
                  {group.name}
                </span>
                <span>
                  <span className="inline-flex h-6 items-center rounded-md bg-layer-1 px-2 text-12 font-medium whitespace-nowrap text-secondary">
                    {KIND_LABELS[group.kind]}
                  </span>
                </span>
                <span className="truncate text-secondary" title={getTarget(group)}>
                  {getTarget(group)}
                </span>
                <span className="truncate text-secondary tabular-nums">{getPermissionText(group)}</span>
                <span className="flex justify-end">
                  <Link to={getGroupPath(workspaceSlug, group)} className="text-14 text-accent-primary hover:underline">
                    查看
                  </Link>
                </span>
              </div>
            ))
          )}
        </div>
      </div>
      {data.length > 0 && <p className="px-1 text-13 text-tertiary tabular-nums">共 {data.length} 个权限组</p>}
    </div>
  );
}
