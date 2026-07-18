/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { MoreHorizontal, PencilIcon, RotateCcw, Trash2Icon, UsersRound } from "lucide-react";
import type { IWorkspaceGroup } from "@plane/types";
import { Button } from "@plane/propel/button";
import { Menu } from "@plane/propel/menu";
import { Table } from "@plane/ui";
import { renderFormattedPayloadDate } from "@plane/utils";
import { MembersSettingsLoader } from "@/components/ui/loader/settings/members";

type Props = {
  groups: IWorkspaceGroup[];
  totalGroupCount: number;
  isLoading: boolean;
  error: string | null;
  hasSearchQuery: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onOpen: (group: IWorkspaceGroup) => void;
  onEdit: (group: IWorkspaceGroup) => void;
  onDelete: (group: IWorkspaceGroup) => void;
  onRetry: () => void;
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

function EmptyState({ hasSearchQuery }: Pick<Props, "hasSearchQuery">) {
  return (
    <h4 className="mt-16 text-center text-body-xs-regular text-placeholder">
      {hasSearchQuery ? "没有匹配的团队" : "还没有团队"}
    </h4>
  );
}

export function WorkspaceGroupsList({
  groups,
  totalGroupCount,
  isLoading,
  error,
  hasSearchQuery,
  canEdit,
  canDelete,
  onOpen,
  onEdit,
  onDelete,
  onRetry,
}: Props) {
  if (isLoading && totalGroupCount === 0) return <MembersSettingsLoader />;

  if (error && totalGroupCount === 0) {
    return (
      <div className="mt-16 flex flex-col items-center text-center">
        <p className="text-13 font-medium text-primary">团队列表加载失败</p>
        <p className="mt-1 max-w-80 text-13 leading-5 text-secondary">{error}</p>
        <Button variant="secondary" className="mt-4" prependIcon={<RotateCcw />} onClick={onRetry}>
          重新加载
        </Button>
      </div>
    );
  }

  if (groups.length === 0) {
    return <EmptyState hasSearchQuery={hasSearchQuery} />;
  }

  const columns = [
    {
      key: "Team",
      content: "团队",
      tdRender: (group: IWorkspaceGroup) => (
        <div className="group relative">
          <div className="flex w-72 items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-layer-1 text-secondary">
                <UsersRound className="size-3.5" />
              </div>
              <button
                type="button"
                onClick={() => onOpen(group)}
                className="min-w-0 cursor-pointer truncate rounded-sm text-left font-medium text-primary outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
              >
                {group.name}
              </button>
            </div>
            {(canEdit || canDelete) && (
              <div className="shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <GroupActions
                  group={group}
                  canEdit={canEdit}
                  canDelete={canDelete}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "Description",
      content: "描述",
      tdRender: (group: IWorkspaceGroup) => (
        <div className="w-64 truncate text-secondary">{group.description?.trim() || "暂无团队描述"}</div>
      ),
    },
    {
      key: "Members",
      content: "成员",
      tdRender: (group: IWorkspaceGroup) => <div className="w-24 tabular-nums">{group.member_count}</div>,
    },
    {
      key: "Roles",
      content: "角色与权限",
      tdRender: (group: IWorkspaceGroup) => (
        <div className="w-32">{group.role_count > 0 ? `${group.role_count} 个角色` : "未分配角色"}</div>
      ),
    },
    {
      key: "Updated at",
      content: "最近更新",
      tdRender: (group: IWorkspaceGroup) => (
        <div className="w-36 tabular-nums">{renderFormattedPayloadDate(group.updated_at) ?? "—"}</div>
      ),
    },
  ];

  return (
    <div className="grid overflow-scroll border-t border-subtle">
      <Table<IWorkspaceGroup>
        columns={columns}
        data={groups}
        keyExtractor={(group) => group.id}
        tHeadClassName="border-b border-subtle"
        thClassName="text-left font-medium divide-x-0 text-placeholder"
        tBodyClassName="divide-y-0"
        tBodyTrClassName="divide-x-0 p-4 h-10 text-secondary"
        tHeadTrClassName="divide-x-0"
      />
    </div>
  );
}
