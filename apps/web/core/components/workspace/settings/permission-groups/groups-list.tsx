/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Search, X } from "lucide-react";
import { Link } from "react-router";
import type { IPermissionGroup } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import { PROJECT_KEY_TOTAL, WORKSPACE_KEY_TOTAL, formatScopeSummary, getPermissionGroupDetailPath } from "./helpers";

type Props = {
  workspaceSlug: string;
  groups: IPermissionGroup[];
  isLoading: boolean;
  canManage: boolean;
  onDelete: (group: IPermissionGroup) => void;
};

const GRID =
  "grid grid-cols-[minmax(200px,1.6fr)_104px_104px_72px_minmax(120px,1fr)_minmax(110px,0.9fr)_110px_100px] items-center gap-x-4 px-4";
const OP_BUTTON =
  "text-13 text-accent-primary hover:underline disabled:cursor-not-allowed disabled:text-placeholder disabled:no-underline";

/**
 * 权限组列表：一张表。名称点进详情，「编辑」进权限页签，「删除」常显。
 * 「模板」列：勾了模板开关的组会被白名单里的项目自动引用；「数据权限」列：项目 / 产品白名单摘要。
 */
export function PermissionGroupsList(props: Props) {
  const { workspaceSlug, groups, isLoading, canManage, onDelete } = props;
  const [query, setQuery] = useState("");

  const keyword = query.trim().toLowerCase();
  const visible = keyword
    ? groups.filter(
        (group) =>
          group.name.toLowerCase().includes(keyword) || (group.description ?? "").toLowerCase().includes(keyword)
      )
    : groups;

  return (
    <div className="flex flex-col">
      <p className="text-13 text-tertiary">
        权限组绑给成员或团队；里面勾的项目权限只在「数据权限」白名单里的项目生效。勾了「模板」的组，白名单里的项目会自动引用它，项目经理可以把项目成员绑到它上面。
      </p>

      <div className="mt-4 flex items-center gap-3">
        <div className="flex h-8 w-64 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5 focus-within:border-accent-strong">
          <Search className="size-3.5 shrink-0 text-placeholder" />
          <input
            className="min-w-0 flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
            placeholder="搜索权限组"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button type="button" aria-label="清除搜索" onClick={() => setQuery("")}>
              <X className="size-3 text-placeholder hover:text-primary" />
            </button>
          )}
        </div>
        <span className="ml-auto text-13 text-tertiary tabular-nums">{visible.length} 个权限组</span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-lg border border-subtle bg-surface-1">
        <div className={cn(GRID, "h-10 border-b border-subtle bg-layer-1 text-12 font-medium text-tertiary")}>
          <span>名称</span>
          <span>工作区权限</span>
          <span>项目权限</span>
          <span>成员</span>
          <span>数据权限</span>
          <span>模板</span>
          <span>更新时间</span>
          <span className="text-right">操作</span>
        </div>

        {isLoading && groups.length === 0 ? (
          <Loader className="flex flex-col gap-2 p-4">
            {[0, 1, 2, 3].map((index) => (
              <Loader.Item key={index} height="32px" />
            ))}
          </Loader>
        ) : visible.length === 0 ? (
          <p className="py-12 text-center text-13 text-placeholder">
            {keyword ? "没有匹配的权限组" : "还没有权限组"}
          </p>
        ) : (
          visible.map((group) => {
            const detailPath = getPermissionGroupDetailPath(workspaceSlug, group.id);
            return (
              <div
                key={group.id}
                className={cn(GRID, "min-h-12 border-b border-subtle py-1.5 text-13 last:border-b-0 hover:bg-layer-1-hover")}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Link
                    to={detailPath}
                    className="truncate font-medium text-accent-primary hover:underline"
                    title={group.description || group.name}
                  >
                    {group.name}
                  </Link>
                </span>
                <span className="text-secondary tabular-nums">
                  {group.workspace_permission_count}/{WORKSPACE_KEY_TOTAL}
                </span>
                <span className="text-secondary tabular-nums">
                  {group.project_permission_count}/{PROJECT_KEY_TOTAL}
                </span>
                <span className="text-secondary tabular-nums">{group.member_count}</span>
                <span className="flex flex-col gap-0.5 text-12 leading-4 text-secondary">
                  <span>项目：{formatScopeSummary(group.data_scope_summary?.projects)}</span>
                  <span>产品：{formatScopeSummary(group.data_scope_summary?.products)}</span>
                </span>
                <span className="text-12 leading-4 text-secondary">
                  {group.is_template ? (
                    <>
                      <span className="rounded bg-accent-subtle px-1.5 py-0.5 text-11 font-medium text-accent-primary">
                        模板
                      </span>
                      <span className="ml-1.5 tabular-nums">引用 {group.referenced_project_count ?? 0} 个项目</span>
                    </>
                  ) : (
                    <span className="text-placeholder">—</span>
                  )}
                </span>
                <span className="text-secondary tabular-nums">{renderFormattedDate(group.updated_at) || "—"}</span>
                <span className="flex items-center justify-end gap-3">
                  {!canManage ? (
                    <button type="button" className={OP_BUTTON} disabled>
                      编辑
                    </button>
                  ) : (
                    <Link to={getPermissionGroupDetailPath(workspaceSlug, group.id, "permissions")} className={OP_BUTTON}>
                      编辑
                    </Link>
                  )}
                  <button
                    type="button"
                    className={cn(OP_BUTTON, "text-danger-primary")}
                    disabled={!canManage}
                    onClick={() => onDelete(group)}
                  >
                    删除
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
