/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TCycleOverduePhase } from "@plane/types";

const CYCLE_OVERDUE_PHASE_LABEL: Record<TCycleOverduePhase, string> = {
  dev: "研发延期",
  test: "测试延期",
};

export function getCycleOverduePhaseLabel(phase?: TCycleOverduePhase | null): string | null {
  if (!phase) return null;
  return CYCLE_OVERDUE_PHASE_LABEL[phase] ?? null;
}
