/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TProjectPermissionGroup } from "@plane/types";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
import { PermissionGroupSourceBadge, deleteActionLabel, isGroupEditable } from "./shared";

type Props = {
  groups: TProjectPermissionGroup[];
  totalKeyCount: number;
  canManage: boolean;
  isLoading: boolean;
  onOpen: (group: TProjectPermissionGroup) => void;
  onEdit: (group: TProjectPermissionGroup) => void;
  onDelete: (group: TProjectPermissionGroup) => void;
};

const ACTION = "text-13 text-secondary transition-colors hover:text-primary disabled:cursor-not-allowed disabled:text-placeholder";

/** 项目权限组列表（常显操作列：本项目组可编辑 / 删除；引用来的模板组只能「删除引用」） */
export function ProjectPermissionGroupsTable(props: Props) {
  const { groups, totalKeyCount, canManage, isLoading, onOpen, onEdit, onDelete } = props;

  return (
    <div className="overflow-hidden rounded-lg border border-subtle">
      <table className="w-full table-fixed text-13">
        <thead className="bg-layer-1 text-left text-tertiary">
          <tr>
            <th className="w-[30%] px-4 py-2.5 font-medium">名称</th>
            <th className="w-[13%] px-4 py-2.5 font-medium">来源</th>
            <th className="w-[13%] px-4 py-2.5 font-medium">项目权限</th>
            <th className="w-[10%] px-4 py-2.5 font-medium">成员</th>
            <th className="w-[14%] px-4 py-2.5 font-medium">更新时间</th>
            <th className="px-4 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-subtle">
          {isLoading && groups.length === 0
            ? [1, 2, 3, 4].map((index) => (
                <tr key={index}>
                  <td colSpan={6} className="px-4 py-3">
                    <div className="h-5 animate-pulse rounded bg-layer-1" />
                  </td>
                </tr>
              ))
            : groups.map((group) => {
                const editable = canManage && isGroupEditable(group);
                // 本项目组是真删；模板组是「删除引用」（本项目不再引用它），都只要管理权限
                const deletable = canManage;
                return (
                  <tr key={group.id} className="hover:bg-layer-1-hover/40">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => onOpen(group)}
                        className="max-w-full truncate text-left font-medium text-accent-primary hover:underline"
                        title={group.description || group.name}
                      >
                        {group.name}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <PermissionGroupSourceBadge source={group.source} />
                    </td>
                    <td className="px-4 py-3 text-secondary tabular-nums">
                      {group.permission_count}/{totalKeyCount}
                    </td>
                    <td className="px-4 py-3 text-secondary tabular-nums">{group.member_count}</td>
                    <td className="px-4 py-3 text-secondary tabular-nums">
                      {renderFormattedPayloadDate(group.updated_at) ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        {group.source === "project" && (
                          <button type="button" className={ACTION} disabled={!editable} onClick={() => onEdit(group)}>
                            编辑
                          </button>
                        )}
                        <button
                          type="button"
                          className={cn(ACTION, deletable && "hover:text-danger-primary")}
                          disabled={!deletable}
                          onClick={() => onDelete(group)}
                        >
                          {deleteActionLabel(group)}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          {!isLoading && groups.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-tertiary">
                没有匹配的权限组
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
