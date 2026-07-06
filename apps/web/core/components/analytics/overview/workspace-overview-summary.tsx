/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { LucideIcon } from "lucide-react";
import { AlertTriangle, CheckCircle2, FolderKanban, ListChecks, Target } from "lucide-react";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TWorkspaceOverviewSummary } from "./use-workspace-overview";

type TSummaryTone = "neutral" | "success" | "warning" | "danger";

type TSummaryItem = {
  key: keyof TWorkspaceOverviewSummary;
  label: string;
  icon: LucideIcon;
  suffix?: string;
  tone: TSummaryTone;
};

const TONE_CLASSES: Record<TSummaryTone, { icon: string; value: string }> = {
  neutral: { icon: "text-accent-primary", value: "text-primary" },
  success: { icon: "text-success-primary", value: "text-primary" },
  warning: { icon: "text-warning-primary", value: "text-warning-primary" },
  danger: { icon: "text-danger-primary", value: "text-danger-primary" },
};

const SUMMARY_ITEMS: TSummaryItem[] = [
  { key: "projectCount", label: "全部项目", icon: FolderKanban, tone: "neutral" },
  { key: "totalWorkItems", label: "工作项总数", icon: ListChecks, tone: "neutral" },
  { key: "completionRate", label: "整体完成率", icon: CheckCircle2, suffix: "%", tone: "success" },
  { key: "activeOverdueCount", label: "正在延期", icon: AlertTriangle, tone: "danger" },
  { key: "attentionProjectCount", label: "需关注项目", icon: Target, tone: "warning" },
];

const formatNumber = (value: number) => value.toLocaleString();

export const WorkspaceOverviewSummary = ({
  summary,
  isLoading,
}: {
  summary: TWorkspaceOverviewSummary;
  isLoading: boolean;
}) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
    {SUMMARY_ITEMS.map((item) => {
      const Icon = item.icon;
      const tone = TONE_CLASSES[item.tone];
      const value = summary[item.key];

      return (
        <div key={item.key} className="rounded-md border border-subtle bg-surface-1 p-4">
          <div className="flex items-center gap-2 text-13 text-secondary">
            <Icon className={cn("h-4 w-4", tone.icon)} />
            <span>{item.label}</span>
          </div>
          {isLoading ? (
            <Loader className="mt-3">
              <Loader.Item height="28px" width="64px" />
            </Loader>
          ) : (
            <div className={cn("mt-2 text-2xl font-semibold tabular-nums", tone.value)}>
              {formatNumber(value)}
              {item.suffix ? <span className="ml-0.5 text-base text-placeholder">{item.suffix}</span> : null}
            </div>
          )}
        </div>
      );
    })}
  </div>
);
