/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React from "react";
import * as LucideIcons from "lucide-react";
import { Layers, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Avatar } from "@plane/ui";
import type { TFlowchartPrincipal, TFlowchartState, TFlowchartTransition } from "@/services/project/project-workflow.service";

type TLucideIcon = React.FC<{ className?: string; strokeWidth?: number }>;

type TIssueTypeLogo = {
  icon?: { name?: string; color?: string };
};

// 审批规则徽章按规则类型着色，便于在流程图里快速分辨
export const APPROVAL_RULE_COLORS: Record<string, string> = {
  none: "#64748b", // 无需审批 - slate
  any: "#0ea5e9", // 任一通过 - sky
  all: "#f59e0b", // 全部通过 - amber
  n_of_m: "#8b5cf6", // N 人通过 - violet
};

/** 审批规则对应的主题色（连线小圆点 / 徽章着色用） */
export function approvalRuleColor(transition: TFlowchartTransition): string {
  const ruleKey = transition.approvers.length === 0 ? "none" : transition.approval_type;
  return APPROVAL_RULE_COLORS[ruleKey] ?? APPROVAL_RULE_COLORS.none;
}

/** 审批规则在连线徽章上的极简短标签 */
export function approvalRuleShortLabel(transition: TFlowchartTransition): string {
  if (transition.approvers.length === 0) return "无需";
  switch (transition.approval_type) {
    case "any":
      return "任一";
    case "all":
      return "全部";
    case "n_of_m":
      return `${transition.required_count ?? 0} 人`;
    default:
      return "审批";
  }
}

export function IssueTypeGlyph({ logoProps, className }: { logoProps: Record<string, unknown> | null; className?: string }) {
  const icon = (logoProps as TIssueTypeLogo | null)?.icon;
  const iconName = icon?.name;
  const color = icon?.color;
  const Comp = iconName ? (LucideIcons as unknown as Record<string, TLucideIcon | undefined>)[iconName] : undefined;
  return (
    <span className="inline-flex flex-shrink-0 items-center justify-center" style={{ color: color || "currentColor" }}>
      {Comp ? <Comp className={className} strokeWidth={2} /> : <Layers className={className} />}
    </span>
  );
}

export function StateNode({ state }: { state: TFlowchartState | null | undefined }) {
  if (!state) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-subtle px-2.5 py-1 text-sm text-tertiary">
        状态已删除
      </span>
    );
  }
  const color = state.color || "#94a3b8";
  return (
    <span
      className="inline-flex max-w-[180px] items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium text-primary"
      style={{ backgroundColor: `${color}14`, borderColor: `${color}40` }}
      title={state.name}
    >
      <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{state.name}</span>
    </span>
  );
}

export function ApprovalRuleBadge({ transition, compact = false }: { transition: TFlowchartTransition; compact?: boolean }) {
  const ruleKey = transition.approvers.length === 0 ? "none" : transition.approval_type;
  const color = APPROVAL_RULE_COLORS[ruleKey] ?? APPROVAL_RULE_COLORS.none;
  const label = compact ? approvalRuleShortLabel(transition) : transition.approval_rule_label;
  return (
    <span
      className={
        compact
          ? "inline-flex flex-shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none shadow-sm"
          : "inline-flex flex-shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      }
      style={
        compact
          ? { color, backgroundColor: "var(--background-color-surface-1)", border: `1px solid ${color}66` }
          : { color, backgroundColor: `${color}1f`, border: `1px solid ${color}40` }
      }
    >
      <ShieldCheck className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {label}
    </span>
  );
}

export function PrincipalChip({ item }: { item: TFlowchartPrincipal }) {
  if (item.kind === "member") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-subtle bg-layer-2 py-0.5 pl-0.5 pr-2 text-xs text-primary">
        <Avatar name={item.label} src={item.avatar_url ?? undefined} size="sm" className="flex-shrink-0" />
        <span className="max-w-[120px] truncate">{item.label}</span>
      </span>
    );
  }
  const Icon = item.kind === "role" ? Users : Sparkles;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-subtle bg-layer-2 px-2 py-1 text-xs text-secondary">
      <Icon className="h-3 w-3 flex-shrink-0 text-tertiary" />
      <span className="max-w-[120px] truncate">{item.label}</span>
    </span>
  );
}

export function PrincipalGroup({
  icon,
  label,
  items,
  emptyLabel,
}: {
  icon: React.ReactNode;
  label: string;
  items: TFlowchartPrincipal[];
  emptyLabel: string;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-tertiary">
        {icon}
        {label}
      </div>
      {items.length === 0 ? (
        <span className="text-xs text-tertiary">{emptyLabel}</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <PrincipalChip key={`${item.kind}-${item.id}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
