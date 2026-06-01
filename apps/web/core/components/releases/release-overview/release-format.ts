/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { getDate, renderFormattedDate } from "@plane/utils";

export const formatDateLabel = (d: Date | null | undefined): string => {
  if (!d) return "-";
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric", year: "numeric" });
};

/** 与项目统计页迭代表格一致：yyyy/MM/dd ~ yyyy/MM/dd */
export const formatReleaseOverviewDateRange = (
  startDate: string | null | undefined,
  endDate: string | null | undefined
): string => {
  const start = startDate ? getDate(startDate) : null;
  const end = endDate ? getDate(endDate) : null;
  const fullStart = start ? renderFormattedDate(start, "yyyy/MM/dd") : "-";
  const fullEnd = end ? renderFormattedDate(end, "yyyy/MM/dd") : "-";
  return `${fullStart} ~ ${fullEnd}`;
};

export const formatFileSize = (size = 0): string => {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
};

/** 把后端返回的多语言/多形态的迭代状态统一映射到 CYCLE_STATUS 的 value。 */
export const normalizeCycleStatus = (
  status: string | null | undefined,
  startDate: string | null | undefined,
  endDate: string | null | undefined
): string => {
  const statusMap: Record<string, string> = {
    未开始: "not_started",
    进行中: "in_progress",
    测试中: "testing",
    已延期: "delayed",
    已完成: "completed",
    已取消: "cancelled",
    not_started: "not_started",
    in_progress: "in_progress",
    testing: "testing",
    delayed: "delayed",
    completed: "completed",
    cancelled: "cancelled",
    canceled: "cancelled",
    NOT_STARTED: "not_started",
    IN_PROGRESS: "in_progress",
    TESTING: "testing",
    DELAYED: "delayed",
    COMPLETED: "completed",
    CANCELLED: "cancelled",
    CURRENT: "in_progress",
    UPCOMING: "not_started",
    DRAFT: "not_started",
  };

  let normalized: string | undefined = status ? statusMap[String(status)] : undefined;
  if (normalized) return normalized;

  const now = Date.now();
  const start = startDate ? new Date(startDate).getTime() : NaN;
  const end = endDate ? new Date(endDate).getTime() : NaN;
  if (!Number.isNaN(start) && start > now) normalized = "not_started";
  else if (!Number.isNaN(end) && end < now) normalized = "completed";
  else if (!Number.isNaN(start) && !Number.isNaN(end)) normalized = "in_progress";
  else normalized = "not_started";
  return normalized;
};
