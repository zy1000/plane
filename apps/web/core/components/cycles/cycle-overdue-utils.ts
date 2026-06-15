/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ICycle } from "@plane/types";

export type TCycleOverdueTone = "danger" | "warning" | "default";

type TCycleOverdueInput = Pick<ICycle, "has_active_overdue" | "has_overdue_history">;

/**
 * 根据延期记录返回展示色调：
 * - 存在未结束的延期记录：红色（danger）
 * - 仅存在已结束记录：黄色（warning）
 * - 从未产生过：默认色
 */
export function getCycleRowTone(cycle?: TCycleOverdueInput | null): TCycleOverdueTone {
  if (!cycle) return "default";
  if (cycle.has_active_overdue) return "danger";
  if (cycle.has_overdue_history) return "warning";
  return "default";
}

const CYCLE_OVERDUE_TONE_TEXT_CLASS: Record<TCycleOverdueTone, string> = {
  danger: "text-danger-primary",
  warning: "text-[#F59E0B]",
  default: "",
};

export function getCycleOverdueToneTextClass(tone: TCycleOverdueTone): string {
  return CYCLE_OVERDUE_TONE_TEXT_CLASS[tone];
}
