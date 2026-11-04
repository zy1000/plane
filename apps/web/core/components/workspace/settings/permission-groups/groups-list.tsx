/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Link } from "react-router";
import type { IPermissionGroup, TDataScopeSummary } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import { DATA_SCOPE_MODE_LABELS, PROJECT_KEY_TOTAL, WORKSPACE_KEY_TOTAL, getPermissionGroupDetailPath } from "./helpers";
import { MemberAvatarStack, PermissionGroupSearch, PermissionGroupSegmented, formatKeyCount } from "./ui";

type Props = {
  workspaceSlug: string;
  groups: IPermissionGroup[];
  isLoading: boolean;
  canManage: boolean;
  onDelete: (group: IPermissionGroup) => void;
};

type TFilter = "all" | "template";

const GRID =
  "grid grid-cols-[minmax(200px,1fr)_128px_80px_84px_160px_76px_80px] items-center gap-x-4 px-5";
const OP_LINK = "text-14 hover:underline disabled:cursor-not-allowed disabled:text-placeholder disabled:no-underline";

/** 数据权限一格一行：都是「全部」写「全部」，否则只写受限的那段，如「按条件 · 37 个项目」 */
function DataScopeCell({ summary }: { summary: TDataScopeSummary | undefined }) {
  const parts = (["projects", "products"] as const)
    .map((kind) => {
      const entry = summary?.[kind];
      if (!entry || entry.mode === "all") return null;
      return { kind, mode: DATA_SCOPE_MODE_LABELS[entry.mode], count: entry.count ?? 0 };
    })
    .filter((part): part is NonNullable<typeof part> => part !== null);
  if (parts.length === 0) return <span className="text-secondary">全部</span>;
  return (
    <span className="flex flex-col gap-0.5 text-secondary">
      {parts.map((part) => (
        <span key={part.kind} className="whitespace-nowrap">
          {part.mode} · <span className="font-medium text-primary tabular-nums">{part.count}</span>{" "}
          {part.kind === "projects" ? "个项目" : "个产品"}
        </span>
      ))}
    </span>
  );
}

/**
 * 权限组列表：一张表。名称点进详情，「编辑」进权限页签，「删除」常显（灰字，确认弹窗里写清影响）。
 * 模板组名称后挂「模板」标签，「引用项目」列给引用数。
 */
export function PermissionGroupsList(props: Props) {
  const { workspaceSlug, groups, isLoading, canManage, onDelete } = props;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TFilter>("all");

  const keyword = query.trim().toLowerCase();
  const templateCount = groups.filter((group) => group.is_template).length;
  const visible = groups.filter((group) => {
    if (filter === "template" && !group.is_template) return false;
    if (!keyword) return true;
    return group.name.toLowerCase().includes(keyword) || (group.description ?? "").toLowerCase().includes(keyword);
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PermissionGroupSegmented<TFilter>
          items={[
            { key: "all", label: "全部", count: groups.length },
            { key: "template", label: "模板", count: templateCount },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <PermissionGroupSearch value={query} onChange={setQuery} placeholder="搜索权限组" />
      </div>

      <div className="overflow-x-auto rounded-xl border border-subtle bg-surface-1">
        <div className="min-w-[900px]">
          <div className={cn(GRID, "h-11 border-b border-subtle bg-layer-1 text-13 font-medium text-tertiary")}>
            <span>权限组</span>
            <span>成员</span>
            <span>项目权限</span>
            <span>工作区权限</span>
            <span>数据权限</span>
            <span>引用项目</span>
            <span className="flex justify-end">操作</span>
          </div>

          {isLoading && groups.length === 0 ? (
            <Loader className="flex flex-col gap-2 p-4">
              {[0, 1, 2, 3].map((index) => (
                <Loader.Item key={index} height="44px" />
              ))}
            </Loader>
          ) : visible.length === 0 ? (
            <p className="py-14 text-center text-14 text-placeholder">
              {keyword || filter !== "all" ? "没有匹配的权限组" : "还没有权限组"}
            </p>
          ) : (
            visible.map((group) => (
              <div
                key={group.id}
                className={cn(GRID, "min-h-[62px] border-b border-subtle text-14 last:border-b-0 hover:bg-layer-1-hover")}
              >
                <div className="flex min-w-0 flex-col gap-0.5 py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <Link
                      to={getPermissionGroupDetailPath(workspaceSlug, group.id)}
                      className="truncate font-medium text-primary hover:text-accent-primary hover:underline"
                    >
                      {group.name}
                    </Link>
                    {group.is_template && <TemplateTag />}
                  </div>
                  {group.description && (
                    <span className="truncate text-13 text-tertiary" title={group.description}>
                      {group.description}
                    </span>
                  )}
                </div>
                <MemberAvatarStack userIds={group.member_preview_ids} count={group.member_count} />
                <KeyCount count={group.project_permission_count} total={PROJECT_KEY_TOTAL} />
                <KeyCount count={group.workspace_permission_count} total={WORKSPACE_KEY_TOTAL} />
                <DataScopeCell summary={group.data_scope_summary} />
                {group.is_template ? (
                  <span className="text-primary tabular-nums">{group.referenced_project_count ?? 0} 个</span>
                ) : (
                  <span className="text-placeholder">—</span>
                )}
                <span className="flex items-center justify-end gap-4">
                  {canManage ? (
                    <Link
                      to={getPermissionGroupDetailPath(workspaceSlug, group.id, "permissions")}
                      className={`${OP_LINK} text-accent-primary`}
                    >
                      编辑
                    </Link>
                  ) : (
                    <button type="button" className={`${OP_LINK} text-accent-primary`} disabled>
                      编辑
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${OP_LINK} text-secondary hover:text-danger-primary`}
                    disabled={!canManage}
                    onClick={() => onDelete(group)}
                  >
                    删除
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function KeyCount({ count, total }: { count: number; total: number }) {
  const text = formatKeyCount(count, total);
  return <span className={cn("tabular-nums", text === "—" ? "text-placeholder" : "text-primary")}>{text}</span>;
}

/** 模板组名称后的小标签 */
export function TemplateTag() {
  return (
    <span className="inline-flex h-[22px] shrink-0 items-center rounded-md bg-accent-subtle px-2 text-12 font-medium text-accent-primary">
      模板
    </span>
  );
}
