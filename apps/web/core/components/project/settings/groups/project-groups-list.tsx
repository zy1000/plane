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
import { MembersSettingsLoader } from "@/components/ui/loader/settings/members";
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
    return <MembersSettingsLoader />;
  }

  if (error && groups.length === 0) {
    return (
      <div className="mt-16 flex flex-col items-center text-center">
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
      <div className="mt-16 text-center">
        <p className="text-13 font-medium text-primary">{hasSearch ? "没有匹配的团队" : "工作区还没有团队"}</p>
        <p className="mx-auto mt-1 max-w-80 text-13 leading-5 text-secondary">
          {hasSearch ? "尝试更换关键词。" : "请先在工作区设置中创建团队并添加成员。"}
        </p>
      </div>
    );
  }

  return (
    <Table className="min-w-[760px] table-auto overflow-hidden whitespace-nowrap">
      <TableHeader className="border-y-0 border-b border-subtle bg-transparent py-0">
        <TableRow className="divide-x-0 text-13 text-primary hover:bg-transparent">
          <TableHead className="h-auto px-2.5 py-2 font-medium text-placeholder">团队</TableHead>
          <TableHead className="h-auto px-2.5 py-2 font-medium text-placeholder">描述</TableHead>
          <TableHead className="h-auto w-32 px-2.5 py-2 font-medium text-placeholder">项目成员</TableHead>
          <TableHead className="h-auto w-56 px-2.5 py-2 font-medium text-placeholder">项目角色</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => (
          <TableRow
            key={group.id}
            className={cn("h-10 text-secondary", activeGroupId === group.id && "bg-accent-subtle")}
          >
            <TableCell className="px-2.5 py-2">
              <div className="flex w-72 min-w-0 items-center gap-2">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-layer-1 text-secondary">
                  <UsersRound className="size-3.5" />
                </div>
                <button
                  type="button"
                  onClick={() => onOpen(group)}
                  className="min-w-0 cursor-pointer truncate rounded-sm text-left text-13 font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
                >
                  {group.name}
                </button>
              </div>
            </TableCell>
            <TableCell className="px-2.5 py-2">
              <div className="w-64 truncate text-secondary">{group.description?.trim() || "暂无团队描述"}</div>
            </TableCell>
            <TableCell className="px-2.5 py-2 text-secondary tabular-nums">
              {group.project_member_count}/{group.member_count}
            </TableCell>
            <TableCell className="px-2.5 py-2">
              <div className="w-56">
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
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
