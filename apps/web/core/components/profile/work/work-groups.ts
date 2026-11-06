/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TUserWorkPendingOrderBy, TUserWorkRow, TUserWorkType } from "@/types/user-work";
import { WORK_TYPE_ORDER, workTypeLabel } from "./work-types";

type TTranslate = (key: string, params?: Record<string, string | number>) => string;

export type TWorkGroupBy = "type" | "owner" | "due_date" | "date" | "none";

export type TWorkGroup = {
  key: string;
  label: string;
  sublabel?: string;
  count: number;
  rows: TUserWorkRow[];
  tone?: "danger" | "warning";
};

const DUE_BUCKET_ORDER = ["overdue", "today", "week", "later", "no_due"] as const;
const DATE_BUCKET_ORDER = ["today", "yesterday", "this_week", "earlier"] as const;

const dueBucket = (row: TUserWorkRow) => row.due_bucket ?? "no_due";

const startOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};

/** 已处理按处理日期分桶：今天 / 昨天 / 本周（周一起）/ 更早 */
const actedBucket = (row: TUserWorkRow): (typeof DATE_BUCKET_ORDER)[number] => {
  if (!row.acted_at) return "earlier";
  const acted = startOfDay(new Date(row.acted_at));
  const today = startOfDay(new Date());
  const diffDays = Math.round((today.getTime() - acted.getTime()) / 86400000);
  if (diffDays <= 0) return "today";
  if (diffDays === 1) return "yesterday";
  const weekday = (today.getDay() + 6) % 7; // 周一 = 0
  if (diffDays <= weekday) return "this_week";
  return "earlier";
};

const compareNullableDate = (a: string | null | undefined, b: string | null | undefined, desc = false) => {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const result = a.localeCompare(b);
  return desc ? -result : result;
};

export function sortRows(rows: TUserWorkRow[], orderBy: TUserWorkPendingOrderBy | "acted_at", overdueFirst: boolean) {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    if (overdueFirst) {
      const aLate = a.due_bucket === "overdue" ? 0 : 1;
      const bLate = b.due_bucket === "overdue" ? 0 : 1;
      if (aLate !== bLate) return aLate - bLate;
    }
    if (orderBy === "acted_at") return compareNullableDate(a.acted_at, b.acted_at, true);
    if (orderBy === "created_at") return compareNullableDate(a.created_at, b.created_at, true);
    const byDue = compareNullableDate(a.due_date, b.due_date);
    if (byDue !== 0) return byDue;
    return compareNullableDate(a.created_at, b.created_at, true);
  });
  return sorted;
}

export function groupRows(t: TTranslate, rows: TUserWorkRow[], groupBy: TWorkGroupBy): TWorkGroup[] {
  if (groupBy === "none") return [{ key: "all", label: "", count: rows.length, rows }];

  const buckets = new Map<string, TUserWorkRow[]>();
  const push = (key: string, row: TUserWorkRow) => {
    const list = buckets.get(key);
    if (list) list.push(row);
    else buckets.set(key, [row]);
  };

  if (groupBy === "type") {
    rows.forEach((row) => push(row.type, row));
    return WORK_TYPE_ORDER.filter((type) => buckets.has(type)).map((type) => ({
      key: type,
      label: workTypeLabel(t, type as TUserWorkType),
      count: buckets.get(type)!.length,
      rows: buckets.get(type)!,
    }));
  }

  if (groupBy === "owner") {
    rows.forEach((row) => push(row.owner?.id ?? "none", row));
    return [...buckets.entries()]
      .map(([key, list]) => ({
        key,
        label: list[0].owner?.name ?? "—",
        count: list.length,
        rows: list,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
  }

  if (groupBy === "due_date") {
    rows.forEach((row) => push(dueBucket(row), row));
    return DUE_BUCKET_ORDER.filter((bucket) => buckets.has(bucket)).map((bucket) => ({
      key: bucket,
      label:
        bucket === "overdue"
          ? t("profile.work.quick.overdue")
          : bucket === "today"
            ? t("profile.work.quick.today")
            : bucket === "week"
              ? t("profile.work.quick.week")
              : bucket === "later"
                ? t("profile.work.groups.later")
                : t("profile.work.groups.no_due"),
      count: buckets.get(bucket)!.length,
      rows: buckets.get(bucket)!,
      tone: bucket === "overdue" ? "danger" : bucket === "today" ? "warning" : undefined,
    }));
  }

  rows.forEach((row) => push(actedBucket(row), row));
  return DATE_BUCKET_ORDER.filter((bucket) => buckets.has(bucket)).map((bucket) => ({
    key: bucket,
    label: t(`profile.work.groups.${bucket}`),
    count: buckets.get(bucket)!.length,
    rows: buckets.get(bucket)!,
  }));
}
