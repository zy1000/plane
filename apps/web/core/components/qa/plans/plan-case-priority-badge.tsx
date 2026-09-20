/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { cn } from "@plane/utils";
import { globalEnums } from "@/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/testhub/util";

/** 优先级色块：L 蓝 / M 黄 / H 红，白字，按枚举数值取色 */
const PRIORITY_BADGE_CLASS: Record<number, string> = {
  0: "bg-[#5b8def]",
  1: "bg-[#f0a62b]",
  2: "bg-[#e0484c]",
};

type TPlanCasePriorityBadgeProps = {
  value?: number | string | null;
  /** 不传则按 case_priority 枚举取 L / M / H */
  label?: string;
  className?: string;
};

export const PlanCasePriorityBadge = ({ value, label, className }: TPlanCasePriorityBadgeProps) => {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  const enums = (globalEnums.Enums as any)?.case_priority || {};
  const text = label ?? enums[numeric] ?? enums[String(value)] ?? "";
  if (!text) return null;

  return (
    <span
      className={cn(
        "inline-flex size-[18px] shrink-0 items-center justify-center rounded text-11 font-semibold text-white",
        PRIORITY_BADGE_CLASS[numeric] ?? "bg-layer-3 text-secondary",
        className
      )}
      title={String(text)}
    >
      {text}
    </span>
  );
};
