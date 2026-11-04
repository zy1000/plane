/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Avatar, AvatarGroup } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";

/**
 * 权限组页面（工作区设置、项目设置两级）共用的小件：搜索框、分段切换、详情头部、数字卡片页签、成员头像叠放。
 * 只在权限组页面里用，所以放在这里而不是 packages/ui。
 */

/** 成员来自几个部门（数字卡片的小字）；成员详情还没到时按 0 算 */
export const countDepartments = (userIds: string[], getUserDetails: (userId: string) => unknown) =>
  new Set(
    userIds
      .map((userId) => (getUserDetails(userId) as { department?: string | null } | undefined)?.department)
      .filter(Boolean)
  ).size;

/** 列表里的权限数：一项没勾「—」、勾满「全部」、其余「N 项」 */
export const formatKeyCount = (count: number, total: number) =>
  count <= 0 ? "—" : count >= total ? "全部" : `${count} 项`;

export function PermissionGroupSearch(props: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  const { value, onChange, placeholder, className } = props;
  return (
    <label
      className={cn(
        "flex h-9 w-64 items-center gap-2 rounded-lg border border-subtle bg-surface-1 px-3 focus-within:border-accent-strong",
        className
      )}
    >
      <Search className="size-4 shrink-0 text-placeholder" />
      <input
        className="min-w-0 flex-1 bg-transparent text-14 text-primary outline-none placeholder:text-placeholder"
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button type="button" aria-label="清除搜索" onClick={() => onChange("")}>
          <X className="size-3.5 text-placeholder hover:text-primary" />
        </button>
      )}
    </label>
  );
}

export type TSegmentItem<K extends string> = { key: K; label: string; count?: number };

/** 灰底分段切换（全部 / 模板、引用中 / 已移除、全部 / 指定 / 按条件） */
export function PermissionGroupSegmented<K extends string>(props: {
  items: TSegmentItem<K>[];
  value: K;
  onChange: (key: K) => void;
  disabled?: boolean;
  size?: "md" | "lg";
}) {
  const { items, value, onChange, disabled = false, size = "md" } = props;
  return (
    <div className="inline-flex shrink-0 gap-0.5 rounded-[9px] bg-layer-1 p-[3px]" role="tablist">
      {items.map((item) => {
        const isActive = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={disabled && !isActive}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[7px] text-14 whitespace-nowrap transition-colors disabled:cursor-not-allowed",
              size === "lg" ? "h-8 px-[18px]" : "h-[30px] px-3.5",
              isActive
                ? "bg-surface-1 font-medium text-primary shadow-raised-100"
                : "text-secondary enabled:hover:text-primary"
            )}
            onClick={() => onChange(item.key)}
          >
            {item.label}
            {item.count !== undefined && <span className="text-12 text-tertiary tabular-nums">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** 详情页头部：组名 + 标签、描述、更新信息，右侧操作按钮 */
export function PermissionGroupIdentity(props: {
  name: string;
  badge?: ReactNode;
  description?: string | null;
  meta?: string | null;
  actions?: ReactNode;
}) {
  const { name, badge, description, meta, actions } = props;
  return (
    <div className="flex flex-wrap items-start justify-between gap-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="truncate text-24 leading-tight font-semibold text-primary">{name}</h1>
          {badge}
        </div>
        {description && <p className="mt-1.5 max-w-3xl text-14 text-secondary">{description}</p>}
        {meta && <p className="mt-0.5 text-13 text-tertiary">{meta}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export type TDetailTile<K extends string> = {
  key: K;
  label: string;
  value: ReactNode;
  unit?: string;
  sub?: ReactNode;
};

/** 详情页的数字卡片，兼做页签：点哪张看哪部分 */
export function PermissionGroupTiles<K extends string>(props: {
  tiles: TDetailTile<K>[];
  active: K;
  onSelect: (key: K) => void;
}) {
  const { tiles, active, onSelect } = props;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="tablist">
      {tiles.map((tile) => {
        const isActive = tile.key === active;
        return (
          <button
            key={tile.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={cn(
              "flex min-h-24 flex-col items-start gap-0.5 rounded-xl border px-[18px] py-3.5 text-left transition-colors",
              isActive
                ? "border-accent-strong bg-accent-subtle shadow-[inset_0_0_0_1px_var(--border-color-accent-strong)]"
                : "border-subtle bg-surface-1 hover:border-strong"
            )}
            onClick={() => onSelect(tile.key)}
          >
            <span className={cn("text-13", isActive ? "font-medium text-accent-primary" : "text-tertiary")}>
              {tile.label}
            </span>
            <span className="text-24 leading-snug font-semibold text-primary tabular-nums">
              {tile.value}
              {tile.unit && <span className="ml-1 text-14 font-medium text-secondary">{tile.unit}</span>}
            </span>
            {tile.sub && <span className="text-12 text-tertiary">{tile.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** 列表「成员」列：前几个头像叠放 + 人数；没人时「—」 */
export const MemberAvatarStack = observer(function MemberAvatarStack(props: {
  userIds: string[] | undefined;
  count: number;
}) {
  const { userIds = [], count } = props;
  const { getUserDetails } = useMember();
  if (count <= 0) return <span className="text-placeholder">—</span>;
  return (
    <span className="flex items-center gap-2 whitespace-nowrap">
      {userIds.length > 0 && (
        <AvatarGroup max={3} size="md" showTooltip={false}>
          {userIds.map((userId) => {
            const user = getUserDetails(userId);
            return (
              <Avatar
                key={userId}
                name={user?.display_name ?? user?.first_name}
                src={getFileURL(user?.avatar_url ?? "")}
              />
            );
          })}
        </AvatarGroup>
      )}
      <span className="text-primary tabular-nums">{count} 人</span>
    </span>
  );
});

const ELLIPSIS = "…";

/** 首尾各一页 + 当前页前后各一页，中间省略；页数不多时全部列出 */
const buildPages = (page: number, pageCount: number): (number | typeof ELLIPSIS)[] => {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const ordered = [...new Set([1, pageCount, page - 1, page, page + 1])]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b);
  const result: (number | typeof ELLIPSIS)[] = [];
  ordered.forEach((value, index) => {
    if (index > 0 && value - (ordered[index - 1] as number) > 1) result.push(ELLIPSIS);
    result.push(value);
  });
  return result;
};

const PAGE_BUTTON =
  "grid h-8 min-w-8 place-items-center rounded-md px-1.5 text-14 tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40";

/** 表格下方的分页：左边总数，右边页码 */
export function PermissionGroupPager(props: {
  total: number;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  unit?: string;
}) {
  const { total, page, pageCount, onPageChange, unit = "个" } = props;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-13 text-tertiary">
      <span className="tabular-nums">
        共 {total} {unit}
      </span>
      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={cn(PAGE_BUTTON, "text-secondary hover:bg-layer-1-hover")}
            disabled={page <= 1}
            aria-label="上一页"
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft className="size-4" />
          </button>
          {buildPages(page, pageCount).map((value, index) =>
            value === ELLIPSIS ? (
              <span key={`gap-${index}`} className="px-1 text-placeholder">
                {ELLIPSIS}
              </span>
            ) : (
              <button
                key={value}
                type="button"
                className={cn(
                  PAGE_BUTTON,
                  value === page ? "bg-accent-subtle font-semibold text-accent-primary" : "text-secondary hover:bg-layer-1-hover"
                )}
                onClick={() => onPageChange(value)}
              >
                {value}
              </button>
            )
          )}
          <button
            type="button"
            className={cn(PAGE_BUTTON, "text-secondary hover:bg-layer-1-hover")}
            disabled={page >= pageCount}
            aria-label="下一页"
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
