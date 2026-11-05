/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Link } from "react-router";
import type { IPermissionGroup, TDataScopeSummary, TPermissionGroupKind } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import {
  DATA_SCOPE_MODE_LABELS,
  PERMISSION_GROUP_KINDS,
  PERMISSION_GROUP_KIND_LABELS,
  PROJECT_KEY_TOTAL,
  WORKSPACE_KEY_TOTAL,
  getPermissionGroupDefaultTab,
  getPermissionGroupDetailPath,
} from "./helpers";
import { MemberAvatarStack, PermissionGroupSearch, PermissionGroupSegmented, formatKeyCount } from "./ui";

type Props = {
  workspaceSlug: string;
  /** 当前分段（存在 URL ?kind= 里，由列表页管） */
  kind: TPermissionGroupKind;
  onKindChange: (kind: TPermissionGroupKind) => void;
  groupsByKind: Record<TPermissionGroupKind, IPermissionGroup[]>;
  /** 工作区项目总数（含已归档），算模板「已移除 N」用；拿不到就不显示已移除 */
  totalProjectCount?: number;
  isLoading: boolean;
  canManage: boolean;
  onDelete: (group: IPermissionGroup) => void;
};

/** 三段各自的列：首列是名称 + 描述，末列是操作；类名要写全，Tailwind 才能扫到 */
const COLUMNS: Record<TPermissionGroupKind, { grid: string; headers: string[] }> = {
  workspace: {
    grid: "grid-cols-[minmax(220px,1fr)_140px_104px_104px_88px]",
    headers: ["权限组", "成员", "项目权限", "工作区权限"],
  },
  project_template: {
    grid: "grid-cols-[minmax(220px,1fr)_104px_200px_88px]",
    headers: ["模板", "项目权限", "引用项目"],
  },
  data: {
    grid: "grid-cols-[minmax(220px,1fr)_140px_150px_150px_88px]",
    headers: ["数据权限", "成员", "项目", "产品"],
  },
};

const ROW = "grid items-center gap-x-4 px-5";
const OP_LINK = "text-14 hover:underline disabled:cursor-not-allowed disabled:text-placeholder disabled:no-underline";

/**
 * 权限组列表：顶部三段「工作区权限组 / 项目权限模板 / 数据权限」各一张表，列按类型不同。
 * 名称点进详情，「编辑」进该类型的默认页签，「删除」常显（灰字，确认弹窗里写清影响）。
 */
export function PermissionGroupsList(props: Props) {
  const { workspaceSlug, kind, onKindChange, groupsByKind, totalProjectCount, isLoading, canManage, onDelete } = props;
  const [query, setQuery] = useState("");

  const label = PERMISSION_GROUP_KIND_LABELS[kind];
  const groups = groupsByKind[kind];
  const keyword = query.trim().toLowerCase();
  const visible = keyword
    ? groups.filter(
        (group) =>
          group.name.toLowerCase().includes(keyword) || (group.description ?? "").toLowerCase().includes(keyword)
      )
    : groups;
  const { grid, headers } = COLUMNS[kind];
  const totalCount = PERMISSION_GROUP_KINDS.reduce((sum, item) => sum + groupsByKind[item].length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PermissionGroupSegmented<TPermissionGroupKind>
          items={PERMISSION_GROUP_KINDS.map((item) => ({
            key: item,
            label: PERMISSION_GROUP_KIND_LABELS[item],
            count: groupsByKind[item].length,
          }))}
          value={kind}
          onChange={onKindChange}
        />
        <PermissionGroupSearch value={query} onChange={setQuery} placeholder={`搜索${label}`} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-subtle bg-surface-1">
        <div className="min-w-[760px]">
          <div className={cn(ROW, grid, "h-11 border-b border-subtle bg-layer-1 text-13 font-medium text-tertiary")}>
            {headers.map((header) => (
              <span key={header}>{header}</span>
            ))}
            <span className="flex justify-end">操作</span>
          </div>

          {isLoading && totalCount === 0 ? (
            <Loader className="flex flex-col gap-2 p-4">
              {[0, 1, 2, 3].map((index) => (
                <Loader.Item key={index} height="44px" />
              ))}
            </Loader>
          ) : visible.length === 0 ? (
            <p className="py-14 text-center text-14 text-placeholder">
              {keyword ? `没有匹配的${label}` : `还没有${label}`}
            </p>
          ) : (
            visible.map((group) => (
              <div
                key={group.id}
                className={cn(ROW, grid, "min-h-[62px] border-b border-subtle text-14 last:border-b-0 hover:bg-layer-1-hover")}
              >
                <div className="flex min-w-0 flex-col gap-0.5 py-2.5">
                  <Link
                    to={getPermissionGroupDetailPath(workspaceSlug, group.id)}
                    className="truncate font-medium text-primary hover:text-accent-primary hover:underline"
                  >
                    {group.name}
                  </Link>
                  {group.description && (
                    <span className="truncate text-13 text-tertiary" title={group.description}>
                      {group.description}
                    </span>
                  )}
                </div>

                {kind === "workspace" && (
                  <>
                    <MemberAvatarStack userIds={group.member_preview_ids} count={group.member_count} />
                    <KeyCount count={group.project_permission_count} total={PROJECT_KEY_TOTAL} />
                    <KeyCount count={group.workspace_permission_count} total={WORKSPACE_KEY_TOTAL} />
                  </>
                )}
                {kind === "project_template" && (
                  <>
                    <KeyCount count={group.project_permission_count} total={PROJECT_KEY_TOTAL} />
                    <ReferencedProjectsCell
                      referenced={group.referenced_project_count ?? 0}
                      totalProjectCount={totalProjectCount}
                    />
                  </>
                )}
                {kind === "data" && (
                  <>
                    <MemberAvatarStack userIds={group.member_preview_ids} count={group.member_count} />
                    <ScopeEntryCell entry={group.data_scope_summary?.projects} />
                    <ScopeEntryCell entry={group.data_scope_summary?.products} />
                  </>
                )}

                <span className="flex items-center justify-end gap-4">
                  {canManage ? (
                    <Link
                      to={getPermissionGroupDetailPath(workspaceSlug, group.id, getPermissionGroupDefaultTab(group.kind))}
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

/** 模板的「引用项目」：「897 个」，有排除时跟灰字「· 已移除 2」（已移除 = 工作区项目总数 − 引用数） */
function ReferencedProjectsCell({ referenced, totalProjectCount }: { referenced: number; totalProjectCount?: number }) {
  const removed = totalProjectCount === undefined ? 0 : Math.max(0, totalProjectCount - referenced);
  return (
    <span className="whitespace-nowrap text-primary tabular-nums">
      {referenced} 个{removed > 0 && <span className="text-tertiary"> · 已移除 {removed}</span>}
    </span>
  );
}

/** 数据权限的「项目」/「产品」一格：「全部 · 899 个」「按条件 · 128 个」「指定 · 37 个」 */
function ScopeEntryCell({ entry }: { entry: TDataScopeSummary["projects"] | undefined }) {
  if (!entry) return <span className="text-placeholder">—</span>;
  return (
    <span className="whitespace-nowrap text-secondary">
      {DATA_SCOPE_MODE_LABELS[entry.mode]}
      {entry.count !== null && (
        <>
          {" · "}
          <span className="font-medium text-primary tabular-nums">{entry.count}</span> 个
        </>
      )}
    </span>
  );
}
