/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TProjectPermissionGroup } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { MemberAvatarStack, formatKeyCount } from "@/components/workspace/settings/permission-groups";
import { PermissionGroupSourceBadge, deleteActionLabel, isGroupEditable } from "./shared";

type Props = {
  groups: TProjectPermissionGroup[];
  totalKeyCount: number;
  canManage: boolean;
  isLoading: boolean;
  /** 搜索 / 筛选后没有结果时的说法 */
  emptyText: string;
  onOpen: (group: TProjectPermissionGroup) => void;
  onEdit: (group: TProjectPermissionGroup) => void;
  onDelete: (group: TProjectPermissionGroup) => void;
};

const GRID = "grid grid-cols-[minmax(220px,1fr)_160px_110px_140px] items-center gap-x-4 px-5";
const OP_BUTTON = "text-14 hover:underline disabled:cursor-not-allowed disabled:text-placeholder disabled:no-underline";

/** 项目设置 › 权限组列表（与工作区设置的权限组列表同一套样式）：名称后挂来源标签，操作列常显 */
export function ProjectPermissionGroupsTable(props: Props) {
  const { groups, totalKeyCount, canManage, isLoading, emptyText, onOpen, onEdit, onDelete } = props;

  return (
    <div className="overflow-x-auto rounded-xl border border-subtle bg-surface-1">
      <div className="min-w-[680px]">
        <div className={cn(GRID, "h-11 border-b border-subtle bg-layer-1 text-13 font-medium text-tertiary")}>
          <span>权限组</span>
          <span>成员</span>
          <span>项目权限</span>
          <span className="flex justify-end">操作</span>
        </div>

        {isLoading && groups.length === 0 ? (
          <Loader className="flex flex-col gap-2 p-4">
            {[0, 1, 2, 3].map((index) => (
              <Loader.Item key={index} height="44px" />
            ))}
          </Loader>
        ) : groups.length === 0 ? (
          <p className="py-14 text-center text-14 text-placeholder">{emptyText}</p>
        ) : (
          groups.map((group) => {
            // 本项目组是真删；模板组是「删除引用」（本项目不再引用它），都只要管理权限
            const countText = formatKeyCount(group.permission_count, totalKeyCount);
            return (
              <div
                key={group.id}
                className={cn(GRID, "min-h-[62px] border-b border-subtle text-14 last:border-b-0 hover:bg-layer-1-hover")}
              >
                <div className="flex min-w-0 flex-col gap-0.5 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpen(group)}
                      className="truncate text-left font-medium text-primary hover:text-accent-primary hover:underline"
                    >
                      {group.name}
                    </button>
                    <PermissionGroupSourceBadge source={group.source} />
                  </div>
                  {group.description && (
                    <span className="truncate text-13 text-tertiary" title={group.description}>
                      {group.description}
                    </span>
                  )}
                </div>
                <MemberAvatarStack userIds={group.member_preview_ids} count={group.member_count} />
                <span className={cn("tabular-nums", countText === "—" ? "text-placeholder" : "text-primary")}>
                  {countText}
                </span>
                <span className="flex items-center justify-end gap-4">
                  {group.source === "project" && (
                    <button
                      type="button"
                      className={`${OP_BUTTON} text-accent-primary`}
                      disabled={!(canManage && isGroupEditable(group))}
                      onClick={() => onEdit(group)}
                    >
                      编辑
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${OP_BUTTON} text-secondary hover:text-danger-primary`}
                    disabled={!canManage}
                    onClick={() => onDelete(group)}
                  >
                    {deleteActionLabel(group)}
                  </button>
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
