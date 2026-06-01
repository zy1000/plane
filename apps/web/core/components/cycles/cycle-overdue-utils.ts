/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ICycle } from "@plane/types";

export type TCycleOverdueTone = "danger" | "default";

type TCycleOverdueInput = Pick<ICycle, "has_active_overdue" | "has_overdue_history">;

export function getCycleRowTone(cycle?: TCycleOverdueInput | null): TCycleOverdueTone {
  if (!cycle) return "default";
  if (cycle.has_active_overdue || cycle.has_overdue_history) return "danger";
  return "default";
}

const CYCLE_OVERDUE_TONE_TEXT_CLASS: Record<TCycleOverdueTone, string> = {
  danger: "text-danger-primary",
  default: "",
};

export function getCycleOverdueToneTextClass(tone: TCycleOverdueTone): string {
  return CYCLE_OVERDUE_TONE_TEXT_CLASS[tone];
}
