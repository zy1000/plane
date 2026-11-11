/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Link } from "react-router";
import { GripVertical } from "lucide-react";
import type { TJobRole } from "@plane/types";
import { Loader, Sortable } from "@plane/ui";
import { cn, renderFormattedPayloadDate } from "@plane/utils";
import { formatJobRoleCount, getJobRoleDetailPath } from "./helpers";
import { JobRoleTag } from "./job-role-tag";

type Props = {
  workspaceSlug: string;
  roles: TJobRole[];
  isLoading: boolean;
  /** 调整顺序模式：整行可拖、不显示操作 */
  isReordering: boolean;
  canManage: boolean;
  emptyText: string;
  onEdit: (role: TJobRole) => void;
  onDelete: (role: TJobRole) => void;
  onReorder: (ordered: TJobRole[]) => void;
};

const GRID =
  "grid grid-cols-[52px_minmax(180px,1.5fr)_minmax(96px,1fr)_minmax(150px,1.3fr)_minmax(110px,1fr)_120px_104px] items-center gap-x-4 px-5";
const OP_LINK = "text-14 hover:underline disabled:cursor-not-allowed disabled:text-placeholder disabled:no-underline";

// 模块级常量：Sortable 的 effect 依赖它，每次渲染新建会重订阅
const keyExtractor = (role: TJobRole) => role.id;

/** 角色列表表格：序号 / 角色名称 / 工作区成员 / 项目成员 / 工作流引用 / 更新时间 / 操作 */
export function JobRolesTable(props: Props) {
  const { workspaceSlug, roles, isLoading, isReordering, canManage, emptyText, onEdit, onDelete, onReorder } = props;

  const renderRow = (role: TJobRole, index: number) => (
    <div
      key={role.id}
      className={cn(
        GRID,
        "h-[58px] border-b border-subtle bg-surface-1 text-14 last:border-b-0",
        isReordering ? "cursor-grab hover:bg-layer-1-hover active:cursor-grabbing" : "hover:bg-layer-1-hover"
      )}
    >
      {isReordering ? (
        <GripVertical className="size-4 text-placeholder" aria-hidden="true" />
      ) : (
        <span className="text-tertiary tabular-nums">{index + 1}</span>
      )}
      <span className="min-w-0">
        {isReordering ? (
          <JobRoleTag role={role} />
        ) : (
          <Link to={getJobRoleDetailPath(workspaceSlug, role.id)} className="inline-flex max-w-full hover:opacity-80">
            <JobRoleTag role={role} />
          </Link>
        )}
      </span>
      <CountCell value={formatJobRoleCount(role.workspace_member_count, "人")} />
      <CountCell
        value={formatJobRoleCount(role.project_member_count, "人")}
        sub={role.project_member_count > 0 ? `${role.project_count} 个项目` : undefined}
      />
      <CountCell value={formatJobRoleCount(role.transition_count, "个流转")} />
      <span className="whitespace-nowrap text-tertiary tabular-nums">{renderFormattedPayloadDate(role.updated_at)}</span>
      <span className="flex items-center justify-end gap-4">
        {!isReordering && (
          <>
            <button
              type="button"
              className={`${OP_LINK} text-accent-primary`}
              disabled={!canManage}
              onClick={() => onEdit(role)}
            >
              编辑
            </button>
            <button
              type="button"
              className={`${OP_LINK} text-secondary hover:text-danger-primary`}
              disabled={!canManage}
              onClick={() => onDelete(role)}
            >
              删除
            </button>
          </>
        )}
      </span>
    </div>
  );

  return (
    <div className="overflow-x-auto rounded-xl border border-subtle bg-surface-1">
      <div className="min-w-[860px]">
        <div className={cn(GRID, "h-11 border-b border-subtle bg-layer-1 text-13 font-medium text-tertiary")}>
          <span>序号</span>
          <span>角色名称</span>
          <span>工作区成员</span>
          <span>项目成员</span>
          <span>工作流引用</span>
          <span>更新时间</span>
          <span className="flex justify-end">操作</span>
        </div>
        {isLoading && roles.length === 0 ? (
          <Loader className="flex flex-col gap-2 p-4">
            {[0, 1, 2, 3].map((index) => (
              <Loader.Item key={index} height="42px" />
            ))}
          </Loader>
        ) : roles.length === 0 ? (
          <p className="py-14 text-center text-14 text-placeholder">{emptyText}</p>
        ) : isReordering ? (
          <Sortable id="job-roles" data={roles} keyExtractor={keyExtractor} onChange={onReorder} render={renderRow} />
        ) : (
          roles.map(renderRow)
        )}
      </div>
    </div>
  );
}

function CountCell({ value, sub }: { value: string; sub?: string }) {
  return (
    <span className={cn("whitespace-nowrap tabular-nums", value === "—" ? "text-placeholder" : "text-primary")}>
      {value}
      {sub && <span className="ml-1.5 text-13 text-tertiary">{sub}</span>}
    </span>
  );
}
