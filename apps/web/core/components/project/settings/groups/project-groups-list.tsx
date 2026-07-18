/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { RotateCcw, UsersRound } from "lucide-react";
import type { IProjectGroup, IProjectRole } from "@plane/types";
import { Button } from "@plane/propel/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { cn } from "@plane/utils";
import type { TProjectGroupRoleMutationResult } from "@/hooks/store/use-project-groups";
import { ProjectGroupRoleMultiSelect } from "./project-group-role-multi-select";

type Props = {
  groups: IProjectGroup[];
  isLoading: boolean;
  error: string | null;
  hasSearch: boolean;
  activeGroupId: string | null;
  roles: IProjectRole[];
  isRolesLoading: boolean;
  canCreateRole: boolean;
  canDeleteRole: boolean;
  onOpen: (group: IProjectGroup) => void;
  onRetry: () => void;
  onAddRoles: (groupId: string, roleIds: string[]) => Promise<TProjectGroupRoleMutationResult>;
  onRemoveRole: (groupId: string, grantId: string) => Promise<void>;
  onPermissionsChanged: () => Promise<void>;
};

export function ProjectGroupsList({
  groups,
  isLoading,
  error,
  hasSearch,
  activeGroupId,
  roles,
  isRolesLoading,
  canCreateRole,
  canDeleteRole,
  onOpen,
  onRetry,
  onAddRoles,
  onRemoveRole,
  onPermissionsChanged,
}: Props) {
  if (isLoading && groups.length === 0) {
    return (
      <div className="divide-y divide-subtle">
        {[1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="flex animate-pulse items-center gap-3 px-4 py-3.5">
            <div className="size-9 rounded-lg bg-layer-transparent-hover" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-3.5 w-32 rounded bg-layer-transparent-hover" />
              <div className="h-3 w-56 rounded bg-layer-transparent-hover" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error && groups.length === 0) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 flex size-11 items-center justify-center rounded-lg bg-danger-subtle">
          <RotateCcw className="size-5 text-danger-primary" />
        </div>
        <p className="text-13 font-medium text-primary">项目团队加载失败</p>
        <p className="mt-1 max-w-80 text-13 leading-5 text-secondary">{error}</p>
        <Button variant="secondary" className="mt-4" prependIcon={<RotateCcw />} onClick={onRetry}>
          重新加载
        </Button>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 flex size-11 items-center justify-center rounded-lg border border-subtle bg-layer-1">
          <UsersRound className="size-5 text-secondary" />
        </div>
        <p className="text-13 font-medium text-primary">{hasSearch ? "没有匹配的团队" : "工作区还没有团队"}</p>
        <p className="mt-1 max-w-80 text-13 leading-5 text-secondary">
          {hasSearch ? "尝试更换关键词。" : "请先在工作区设置中创建团队并添加成员。"}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="hidden lg:block">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-10 px-4">团队</TableHead>
              <TableHead className="h-10 w-32 px-4 text-center">项目成员</TableHead>
              <TableHead className="h-10 w-72 px-4">项目角色</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => (
              <TableRow
                key={group.id}
                tabIndex={0}
                onClick={() => onOpen(group)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpen(group);
                  }
                }}
                className={cn(
                  "cursor-pointer outline-none hover:bg-layer-1-hover focus-visible:bg-layer-1-hover",
                  activeGroupId === group.id && "bg-accent-subtle hover:bg-accent-subtle"
                )}
              >
                <TableCell className="px-4 py-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-subtle bg-layer-1 text-secondary">
                      <UsersRound className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-13 font-medium text-primary">{group.name}</p>
                      <p className="mt-0.5 truncate text-13 text-secondary">
                        {group.description?.trim() || "暂无团队描述"}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-4 py-3.5 text-center text-13 text-secondary tabular-nums">
                  {group.project_member_count}/{group.member_count}
                </TableCell>
                <TableCell className="px-4 py-3.5">
                  <ProjectGroupRoleMultiSelect
                    group={group}
                    roles={roles}
                    isRolesLoading={isRolesLoading}
                    canCreate={canCreateRole}
                    canDelete={canDeleteRole}
                    className="w-full"
                    onAddRoles={onAddRoles}
                    onRemoveRole={onRemoveRole}
                    onPermissionsChanged={onPermissionsChanged}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y divide-subtle lg:hidden">
        {groups.map((group) => (
          <li key={group.id} className={cn(activeGroupId === group.id && "bg-accent-subtle")}>
            <button
              type="button"
              onClick={() => onOpen(group)}
              className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-layer-1-hover"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-subtle bg-layer-1 text-secondary">
                <UsersRound className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-13 font-medium text-primary">{group.name}</p>
                <p className="mt-0.5 truncate text-13 text-secondary">{group.description?.trim() || "暂无团队描述"}</p>
                <div className="mt-1.5 flex items-center gap-3 text-11 text-tertiary">
                  <span>
                    {group.project_member_count}/{group.member_count} 位项目成员
                  </span>
                  <span>{group.grants.length > 0 ? `${group.grants.length} 个角色` : "未分配角色"}</span>
                </div>
              </div>
            </button>
            <div className="px-3 pb-3 pl-[3.75rem]">
              <ProjectGroupRoleMultiSelect
                group={group}
                roles={roles}
                isRolesLoading={isRolesLoading}
                canCreate={canCreateRole}
                canDelete={canDeleteRole}
                className="w-full"
                onAddRoles={onAddRoles}
                onRemoveRole={onRemoveRole}
                onPermissionsChanged={onPermissionsChanged}
              />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
