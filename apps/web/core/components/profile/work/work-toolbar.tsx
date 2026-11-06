/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { ChevronDownIcon, CloseIcon, SearchIcon } from "@plane/propel/icons";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TUserWorkProcessedDays, TUserWorkQuickBucket } from "@/types/user-work";
import type { TWorkGroupBy } from "./work-groups";

/** 常驻展开的标题 / 编号搜索框，输入停 300ms 再生效 */
export function WorkSearch({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  const [input, setInput] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setInput(value);
  }, [value]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const schedule = (next: string) => {
    setInput(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next.trim()), 300);
  };

  return (
    <label className="flex h-9 w-full items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 text-placeholder md:w-72">
      <SearchIcon className="size-3.5 shrink-0" />
      <input
        ref={inputRef}
        type="search"
        className="w-full border-none bg-transparent text-13 text-primary placeholder:text-placeholder focus:outline-none"
        placeholder={placeholder}
        value={input}
        onChange={(event) => schedule(event.target.value)}
      />
      {input && (
        <button type="button" aria-label="清空搜索" className="grid place-items-center" onClick={() => schedule("")}>
          <CloseIcon className="size-3" />
        </button>
      )}
    </label>
  );
}

const menuButtonClass =
  "flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-3 text-13 font-medium whitespace-nowrap text-primary hover:bg-layer-transparent-hover";
const menuWrapperClass = "shrink-0";

type TOption<K extends string> = { key: K; label: string; count?: number };

/** 单选下拉（分组方式 / 排序方式 / 时间范围），按钮上显示当前值 */
export function WorkSelectMenu<K extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: K;
  options: TOption<K>[];
  onChange: (key: K) => void;
}) {
  const current = options.find((option) => option.key === value);
  return (
    <CustomMenu
      placement="bottom-end"
      closeOnSelect
      customButtonClassName={menuWrapperClass}
      customButton={
        <span className={menuButtonClass}>
          <span className="font-normal text-tertiary">{label}</span>
          <span>{current?.label ?? value}</span>
          <ChevronDownIcon className="size-3.5 text-tertiary" />
        </span>
      }
    >
      {options.map((option) => (
        <CustomMenu.MenuItem key={option.key} onClick={() => onChange(option.key)}>
          <span className="flex w-full items-center gap-2">
            <span className="flex-1">{option.label}</span>
            {option.key === value && <Check className="size-3.5 text-accent-primary" />}
          </span>
        </CustomMenu.MenuItem>
      ))}
    </CustomMenu>
  );
}

/** 多选下拉（所属项目 / 产品），选中几项就在按钮上显示几 */
export function WorkMultiSelectMenu({
  label,
  options,
  selected,
  onChange,
  allLabel,
}: {
  label: string;
  options: TOption<string>[];
  selected: string[];
  onChange: (ids: string[]) => void;
  allLabel: string;
}) {
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
  return (
    <CustomMenu
      placement="bottom-end"
      maxHeight="lg"
      customButtonClassName={menuWrapperClass}
      customButton={
        <span className={cn(menuButtonClass, selected.length > 0 && "border-accent-strong text-accent-primary")}>
          <span>{label}</span>
          {selected.length > 0 && <span className="tabular-nums">{selected.length}</span>}
          <ChevronDownIcon className="size-3.5 text-tertiary" />
        </span>
      }
    >
      <CustomMenu.MenuItem onClick={() => onChange([])}>
        <span className="flex w-full items-center gap-2">
          <span className="flex-1">{allLabel}</span>
          {selected.length === 0 && <Check className="size-3.5 text-accent-primary" />}
        </span>
      </CustomMenu.MenuItem>
      {options.map((option) => (
        <CustomMenu.MenuItem key={option.key} onClick={() => toggle(option.key)}>
          <span className="flex w-full items-center gap-2">
            <span className="flex-1 truncate">{option.label}</span>
            {option.count !== undefined && <span className="text-12 text-tertiary tabular-nums">{option.count}</span>}
            {selected.includes(option.key) && <Check className="size-3.5 shrink-0 text-accent-primary" />}
          </span>
        </CustomMenu.MenuItem>
      ))}
    </CustomMenu>
  );
}

const QUICK_BUCKETS: TUserWorkQuickBucket[] = ["overdue", "today", "week"];

/** 待处理工具栏上的三个快捷筛选：已逾期 / 今天到期 / 本周到期，互斥、可取消 */
export function WorkQuickChips({
  active,
  counts,
  onChange,
}: {
  active: TUserWorkQuickBucket | null;
  counts: Partial<Record<TUserWorkQuickBucket, number>>;
  onChange: (bucket: TUserWorkQuickBucket | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-1.5">
      {QUICK_BUCKETS.map((bucket) => {
        const count = counts[bucket] ?? 0;
        const isActive = active === bucket;
        const isOverdue = bucket === "overdue" && count > 0;
        return (
          <button
            key={bucket}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(isActive ? null : bucket)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-12 transition-colors",
              isActive
                ? "border-accent-strong bg-accent-subtle text-accent-primary"
                : isOverdue
                  ? "border-danger-subtle bg-danger-subtle/40 text-danger-primary hover:bg-danger-subtle"
                  : "border-subtle text-secondary hover:bg-layer-transparent-hover"
            )}
          >
            <span>{t(`profile.work.quick.${bucket}`)}</span>
            <span className="font-medium tabular-nums">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

export function WorkTimeRangeMenu({
  days,
  onChange,
}: {
  days: TUserWorkProcessedDays;
  onChange: (days: TUserWorkProcessedDays) => void;
}) {
  const { t } = useTranslation();
  return (
    <WorkSelectMenu<`${TUserWorkProcessedDays}`>
      label={t("profile.work.time_range.label")}
      value={`${days}`}
      options={[
        { key: "7", label: t("profile.work.time_range.days_7") },
        { key: "30", label: t("profile.work.time_range.days_30") },
        { key: "90", label: t("profile.work.time_range.days_90") },
      ]}
      onChange={(key) => onChange(Number(key) as TUserWorkProcessedDays)}
    />
  );
}

export function WorkGroupByMenu({
  value,
  options,
  onChange,
}: {
  value: TWorkGroupBy;
  options: TWorkGroupBy[];
  onChange: (value: TWorkGroupBy) => void;
}) {
  const { t } = useTranslation();
  const labels: Record<TWorkGroupBy, string> = {
    type: t("profile.work.groups.by_type"),
    owner: t("profile.work.groups.by_owner"),
    due_date: t("profile.work.groups.by_due"),
    date: t("profile.work.groups.by_date"),
    none: t("profile.work.groups.none"),
  };
  return (
    <WorkSelectMenu
      label={t("profile.work.display.group_by")}
      value={value}
      options={options.map((key) => ({ key, label: labels[key] }))}
      onChange={onChange}
    />
  );
}

/** 工具栏外壳：左边搜索 + 快捷项，右边下拉与「视图设置」 */
export function WorkToolbar({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="flex h-14 shrink-0 flex-wrap items-center gap-2 border-b border-subtle px-4">
      <div className="flex min-w-0 flex-1 items-center gap-3">{left}</div>
      <div className="flex items-center gap-2">{right}</div>
    </div>
  );
}
