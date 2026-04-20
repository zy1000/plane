/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
// plane imports
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";

export type TOverdueByAssigneeRow = {
  assignee_id: string | null;
  display_name: string;
  avatar_url: string;
  count: number;
};

type Props = {
  /** 显示的行数据；未传入 data 或 data 为 null 代表加载中 */
  data?: { total: number; data: TOverdueByAssigneeRow[] } | null;
  /** 卡片标题，默认：延期工作项负责人 */
  title?: string;
  /** 右上角副标题（可选） */
  subtitle?: string;
  /** 外层类名（用于控制卡片尺寸） */
  className?: string;
  /** 仅渲染列表区域（用于全屏弹窗等场景） */
  hideHeader?: boolean;
  /** 标题行右侧额外内容（如图标按钮） */
  headerExtra?: ReactNode;
};

/**
 * 通用的“延期工作项负责人”展示卡片。
 *
 * 仅负责渲染与滚动，数据由上层传入，方便在项目统计、迭代概览等多个场景复用。
 */
export function OverdueByAssigneeCard({
  data,
  title = "延期工作项负责人",
  subtitle = "",
  className,
  hideHeader = false,
  headerExtra,
}: Props) {
  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const loaded = !!data;
  const sortedRows = useMemo(() => [...rows].sort((a, b) => b.count - a.count), [rows]);

  return (
    <div
      className={cn(
        hideHeader
          ? "flex min-h-0 flex-1 flex-col overflow-hidden"
          : "rounded-lg border border-subtle bg-surface-1 flex h-[420px] min-h-0 flex-col overflow-hidden p-4",
        className
      )}
    >
      {!hideHeader ? (
        <div className="mb-3 flex flex-shrink-0 items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-danger-primary" />
            <span className="text-sm font-medium text-primary">{title}</span>
            <span className="shrink-0 text-xs text-placeholder">共 {total} 条</span>
          </div>
          <div className="flex min-w-0 shrink-0 items-center gap-1">
            {subtitle ? <span className="truncate text-xs text-placeholder">{subtitle}</span> : null}
            {headerExtra}
          </div>
        </div>
      ) : null}
      {!loaded ? (
        <div className="grid min-h-0 flex-1 place-items-center text-sm text-placeholder">
          加载中...
        </div>
      ) : rows.length === 0 ? (
        <div className="grid min-h-0 flex-1 place-items-center text-sm text-placeholder">
          暂无延期工作项
        </div>
      ) : (
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0 overflow-y-auto pr-1 vertical-scrollbar scrollbar-sm">
            <div className="flex flex-col gap-y-1">
              {sortedRows.map((row) => (
                <div
                  key={row.assignee_id ?? "unassigned"}
                  className="flex flex-shrink-0 items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-layer-1"
                >
                  <Avatar
                    size="sm"
                    name={row.display_name}
                    src={row.avatar_url ? getFileURL(row.avatar_url) : ""}
                  />
                  <span
                    className="min-w-0 flex-1 truncate text-sm text-primary"
                    title={row.display_name}
                  >
                    {row.display_name}
                  </span>
                  <div className="flex shrink-0 items-baseline gap-1 tabular-nums">
                    <span className="text-sm font-medium text-danger-primary">{row.count}</span>
                    <span className="text-xs text-placeholder">项</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
