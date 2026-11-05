/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { Tooltip } from "@plane/propel/tooltip";
import type { TMyAccessVisibleSource } from "@plane/types";
import { cn } from "@plane/utils";
import { VISIBLE_SOURCE_LABELS } from "./helpers";
import type { TGrantTag } from "./helpers";

/** 「我的权限」页共用的小 chip：来源 chip、组名 chip、权限 chip。只在这页用，所以不进 packages/ui */

export type TChipTone = "neutral" | "green" | "orange" | "purple" | "blue";

const TONE_CLASS: Record<TChipTone, string> = {
  neutral: "bg-layer-1 text-secondary",
  green: "bg-success-subtle text-success-primary",
  orange: "bg-warning-subtle text-warning-primary",
  purple: "bg-[var(--label-purple-bg)] text-[var(--label-purple-text)]",
  blue: "bg-accent-subtle text-accent-primary",
};

export function Chip(props: { tone?: TChipTone; children: ReactNode; className?: string; title?: string }) {
  const { tone = "neutral", children, className, title } = props;
  return (
    <span
      className={cn(
        "inline-flex h-[22px] max-w-full items-center truncate rounded-md px-2 text-12 font-medium whitespace-nowrap",
        TONE_CLASS[tone],
        className
      )}
      title={title}
    >
      {children}
    </span>
  );
}

const VISIBLE_SOURCE_TONE: Record<TMyAccessVisibleSource["type"], TChipTone> = {
  passthrough: "neutral",
  member: "green",
  lead: "orange",
  data_scope: "purple",
  owner: "orange",
  reviewer: "blue",
  linked_project: "neutral",
};

/** 可见项目 / 产品的来源：成员（绿）、负责人（橙）、数据权限用组名（紫）、直通（灰） */
export function VisibleSourceChip({ source }: { source: TMyAccessVisibleSource }) {
  const label = source.type === "data_scope" ? (source.group?.name ?? VISIBLE_SOURCE_LABELS.data_scope) : VISIBLE_SOURCE_LABELS[source.type];
  return (
    <Chip tone={VISIBLE_SOURCE_TONE[source.type]} title={label}>
      {label}
    </Chip>
  );
}

/** 只读权限 chip：已授予 = 淡蓝底 + 勾，未授予 = 白底灰字；已授予时悬停出来源 */
export function PermissionChip(props: { label: string; granted: boolean; tooltip?: string; tag?: TGrantTag }) {
  const { label, granted, tooltip, tag } = props;
  const chip = (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-14 whitespace-nowrap",
        granted ? "border-accent-subtle bg-accent-subtle text-primary" : "border-subtle bg-surface-1 text-tertiary"
      )}
    >
      {granted && <Check className="size-3.5 shrink-0 text-accent-primary" strokeWidth={2.5} aria-hidden="true" />}
      {label}
      {granted && tag && (
        <span className="ml-0.5 border-l border-accent-subtle pl-1.5 text-12 text-success-secondary">{tag}</span>
      )}
    </span>
  );
  if (!granted || !tooltip) return chip;
  return (
    <Tooltip tooltipContent={tooltip} position="top">
      {chip}
    </Tooltip>
  );
}
