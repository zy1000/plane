/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import type { ICycleOverdueRecord } from "@plane/types";
import { renderFormattedDate } from "@plane/utils";
import { getCycleOverduePhaseLabel } from "@/components/cycles/cycle-status-config";

type Props = {
  record: ICycleOverdueRecord;
};

export function CycleOverdueRecordRow({ record }: Props) {
  const phaseLabel = getCycleOverduePhaseLabel(record.phase) ?? record.phase;
  return (
    <div className="flex items-center justify-between rounded-sm border border-subtle px-2 py-1.5">
      <div className="flex items-center gap-2">
        <span
          className={
            record.phase === "dev"
              ? "rounded bg-danger-subtle px-1.5 py-0.5 text-11 font-medium text-danger-primary"
              : "rounded bg-warning-subtle px-1.5 py-0.5 text-11 font-medium text-[#F59E0B]"
          }
        >
          {phaseLabel}
        </span>
        <span className="text-12 text-secondary">{renderFormattedDate(record.started_at)}</span>
      </div>
      <div className="text-11 text-tertiary">
        {record.ended_at ? `已于 ${renderFormattedDate(record.ended_at)} 结束` : "进行中"}
      </div>
    </div>
  );
}
