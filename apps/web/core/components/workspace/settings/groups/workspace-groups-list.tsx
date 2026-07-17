/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { MoreHorizontal, PencilIcon, RotateCcw, ShieldCheck, Trash2Icon, UsersRound } from "lucide-react";
import type { IWorkspaceGroup } from "@plane/types";
import { Button } from "@plane/propel/button";
import { Menu } from "@plane/propel/menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { cn, renderFormattedPayloadDate } from "@plane/utils";

type Props = {
  groups: IWorkspaceGroup[];
  totalGroupCount: number;
  isLoading: boolean;
  error: string | null;
  hasSearchQuery: boolean;
  activeGroupId: string | null;
  canEdit: boolean;
  canDelete: boolean;
  onOpen: (group: IWorkspaceGroup) => void;
  onEdit: (group: IWorkspaceGroup) => void;
  onDelete: (group: IWorkspaceGroup) => void;
  onRetry: () => void;
  onCreate: () => void;
  canCreate: boolean;
};

function GroupActions({
  group,
  canEdit,
  canDelete,
  onEdit,
  onDelete,
}: Pick<Props, "canEdit" | "canDelete" | "onEdit" | "onDelete"> & { group: IWorkspaceGroup }) {
  if (!canEdit && !canDelete) return null;

  return (
    <Menu
      ariaLabel={`管理团队 ${group.name}`}
      customButtonClassName="flex size-8 items-center justify-center rounded-md text-placeholder transition-colors hover:bg-layer-1-hover hover:text-primary focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
      optionsClassName="min-w-36 space-y-0.5"
      customButton={<MoreHorizontal className="size-4" />}
    >
      {canEdit && (
        <Menu.MenuItem onClick={() => onEdit(group)} className="flex items-center gap-2 px-2 py-1.5 text-13">
          <PencilIcon className="size-3.5" />
          编辑团队
        </Menu.MenuItem>
      )}
      {canDelete && (
        <Menu.MenuItem
          onClick={() => onDelete(group)}
          className="flex items-center gap-2 px-2 py-1.5 text-13 text-danger-primary hover:bg-danger-subtle"
        >
          <Trash2Icon className="size-3.5" />
          删除团队
        </Menu.MenuItem>
      )}
    </Menu>
  );
}

function EmptyState({ hasSearchQuery, canCreate, onCreate }: Pick<Props, "hasSearchQuery" | "canCreate" | "onCreate">) {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex size-11 items-center justify-center rounded-lg border border-subtle bg-layer-1">
        <UsersRound className="size-5 text-secondary" />
      </div>
      <p className="text-13 font-medium text-primary">{hasSearchQuery ? "没有匹配的团队" : "还没有团队"}</p>
      <p className="mt-1 max-w-80 text-13 leading-5 text-secondary">
        {hasSearchQuery ? "尝试更换关键词，或清除搜索条件。" : "创建团队后，可以统一管理成员并批量授予工作区角色。"}
      </p>
      {!hasSearchQuery && canCreate && (
        <Button variant="primary" className="mt-4" onClick={onCreate}>
          创建第一个团队
        </Button>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="divide-y divide-subtle">
      {[1, 2, 3, 4, 5].map((item) => (
        <div key={item} className="flex animate-pulse items-center gap-3 px-4 py-3.5">
          <div className="size-9 shrink-0 rounded-lg bg-layer-transparent-hover" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="h-3.5 w-32 rounded bg-layer-transparent-hover" />
            <div className="h-3 w-full max-w-72 rounded bg-layer-transparent-hover" />
          </div>
          <div className="hidden h-3 w-16 rounded bg-layer-transparent-hover md:block" />
          <div className="hidden h-3 w-20 rounded bg-layer-transparent-hover md:block" />
        </div>
      ))}
    </div>
  );
}

export function WorkspaceGroupsList({
  groups,
  totalGroupCount,
  isLoading,
  error,
  hasSearchQuery,
  activeGroupId,
  canEdit,
  canDelete,
  onOpen,
  onEdit,
  onDelete,
  onRetry,
  onCreate,
  canCreate,
}: Props) {
  if (isLoading && totalGroupCount === 0) return <LoadingState />;

  if (error && totalGroupCount === 0) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-4 flex size-11 items-center justify-center rounded-lg bg-danger-subtle">
          <RotateCcw className="size-5 text-danger-primary" />
        </div>
        <p className="text-13 font-medium text-primary">团队列表加载失败</p>
        <p className="mt-1 max-w-80 text-13 leading-5 text-secondary">{error}</p>
        <Button variant="secondary" className="mt-4" prependIcon={<RotateCcw />} onClick={onRetry}>
          重新加载
        </Button>
      </div>
    );
  }

  if (groups.length === 0) {
    return <EmptyState hasSearchQuery={hasSearchQuery} canCreate={canCreate} onCreate={onCreate} />;
  }

  const openGroup = (group: IWorkspaceGroup) => onOpen(group);

  return (
    <>
      <div className="hidden lg:block">
        <Table className="min-w-[760px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-10 w-[48%] px-4">团队</TableHead>
              <TableHead className="h-10 w-28 px-4 text-center">成员</TableHead>
              <TableHead className="h-10 w-36 px-4 text-center">角色与权限</TableHead>
              <TableHead className="h-10 w-36 px-4">最近更新</TableHead>
              {(canEdit || canDelete) && <TableHead className="h-10 w-14 px-3" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((group) => {
              const isActive = activeGroupId === group.id;
              return (
                <TableRow
                  key={group.id}
                  tabIndex={0}
                  aria-label={`打开团队 ${group.name}`}
                  onClick={() => openGroup(group)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openGroup(group);
                    }
                  }}
                  className={cn(
                    "group cursor-pointer border-b border-subtle transition-colors outline-none hover:bg-layer-1-hover focus-visible:bg-layer-1-hover",
                    isActive && "bg-accent-subtle hover:bg-accent-subtle"
                  )}
                >
                  <TableCell className="px-4 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-lg border border-subtle bg-layer-1 text-secondary",
                          isActive && "border-accent-strong bg-surface-1 text-accent-primary"
                        )}
                      >
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
                  <TableCell className="px-4 py-3.5 text-center">
                    <span className="inline-flex items-center gap-1.5 text-13 text-secondary tabular-nums">
                      <UsersRound className="size-3.5 text-placeholder" />
                      {group.member_count}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-center">
                    {group.role_count > 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-accent-subtle px-2 py-1 text-13 font-medium text-accent-primary">
                        <ShieldCheck className="size-3.5" />
                        {group.role_count} 个角色
                      </span>
                    ) : (
                      <span className="text-13 text-tertiary">未分配角色</span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-3.5 text-13 text-secondary tabular-nums">
                    {renderFormattedPayloadDate(group.updated_at) ?? "—"}
                  </TableCell>
                  {(canEdit || canDelete) && (
                    <TableCell className="px-3 py-3.5" onClick={(event) => event.stopPropagation()}>
                      <div className="flex justify-end opacity-60 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                        <GroupActions
                          group={group}
                          canEdit={canEdit}
                          canDelete={canDelete}
                          onEdit={onEdit}
                          onDelete={onDelete}
                        />
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y divide-subtle lg:hidden">
        {groups.map((group) => {
          const isActive = activeGroupId === group.id;
          return (
            <li key={group.id} className={cn("flex items-center gap-3 px-3 py-3", isActive && "bg-accent-subtle")}>
              <button
                type="button"
                onClick={() => openGroup(group)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-subtle bg-layer-1 text-secondary">
                  <UsersRound className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-13 font-medium text-primary">{group.name}</p>
                  <p className="mt-0.5 truncate text-13 text-secondary">
                    {group.description?.trim() || "暂无团队描述"}
                  </p>
                  <div className="mt-1.5 flex items-center gap-3 text-11 text-tertiary">
                    <span>{group.member_count} 位成员</span>
                    <span>{group.role_count > 0 ? `${group.role_count} 个角色` : "未分配角色"}</span>
                  </div>
                </div>
              </button>
              <GroupActions group={group} canEdit={canEdit} canDelete={canDelete} onEdit={onEdit} onDelete={onDelete} />
            </li>
          );
        })}
      </ul>
    </>
  );
}
