/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { LucideIcon } from "lucide-react";
import { Archive, CheckCircle2, CircleDot, ClipboardList, Layers3, PlayCircle, XCircle } from "lucide-react";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TWorkItemsFlowSummary, TWorkItemsStatusKey } from "./use-work-items-analysis";

type TStatusStyle = {
  dot: string;
  bar: string;
  text: string;
  icon: LucideIcon;
};

type TMetricItem = {
  key: keyof Pick<
    TWorkItemsFlowSummary,
    "totalWorkItems" | "activeWorkItems" | "backlogRatio" | "completionRate" | "cancelledRate"
  >;
  label: string;
  suffix?: string;
  icon: LucideIcon;
  tone?: string;
};

const STATUS_STYLES: Record<TWorkItemsStatusKey, TStatusStyle> = {
  backlog: {
    dot: "bg-warning-primary",
    bar: "bg-warning-primary",
    text: "text-warning-primary",
    icon: Layers3,
  },
  unstarted: {
    dot: "bg-layer-3",
    bar: "bg-layer-3",
    text: "text-secondary",
    icon: CircleDot,
  },
  started: {
    dot: "bg-accent-primary",
    bar: "bg-accent-primary",
    text: "text-accent-primary",
    icon: PlayCircle,
  },
  completed: {
    dot: "bg-success-primary",
    bar: "bg-success-primary",
    text: "text-success-primary",
    icon: CheckCircle2,
  },
  cancelled: {
    dot: "bg-danger-primary/80",
    bar: "bg-danger-primary/80",
    text: "text-danger-primary",
    icon: XCircle,
  },
};

const METRIC_ITEMS: TMetricItem[] = [
  { key: "totalWorkItems", label: "工作项总数", icon: ClipboardList },
  { key: "activeWorkItems", label: "活跃库存", icon: PlayCircle, tone: "text-accent-primary" },
  { key: "backlogRatio", label: "待办占比", icon: Layers3, suffix: "%", tone: "text-warning-primary" },
  { key: "completionRate", label: "完成率", icon: CheckCircle2, suffix: "%", tone: "text-success-primary" },
  { key: "cancelledRate", label: "取消率", icon: Archive, suffix: "%", tone: "text-danger-primary" },
];

const formatNumber = (value: number) => value.toLocaleString();

const MetricRow = ({
  icon: Icon,
  label,
  suffix,
  tone,
  value,
}: {
  icon: LucideIcon;
  label: string;
  suffix?: string;
  tone?: string;
  value: number;
}) => (
  <div className="flex items-center justify-between gap-4 rounded-md px-2 py-2">
    <div className="flex min-w-0 items-center gap-2 text-13 text-secondary">
      <Icon className={cn("h-4 w-4 flex-shrink-0", tone ?? "text-placeholder")} />
      <span className="truncate">{label}</span>
    </div>
    <div className={cn("text-15 font-semibold text-primary tabular-nums", tone)}>
      {formatNumber(value)}
      {suffix ? <span className="ml-0.5 text-12 font-medium text-placeholder">{suffix}</span> : null}
    </div>
  </div>
);

export const WorkItemsFlowOverview = ({
  isLoading,
  summary,
}: {
  isLoading: boolean;
  summary: TWorkItemsFlowSummary;
}) => (
  <section className="rounded-md border border-subtle bg-surface-1">
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="p-4">
        <div>
          <h2 className="text-15 font-semibold text-primary">工作项状态结构</h2>
          <p className="mt-1 max-w-[72ch] text-12 text-secondary">
            当前筛选范围内，按状态拆解工作项库存，快速判断工作主要堆积在待办、未开始还是进行中。
          </p>
        </div>

        {isLoading ? (
          <Loader className="mt-5 space-y-4">
            <Loader.Item height="14px" width="100%" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {summary.segments.map((segment) => (
                <Loader.Item key={segment.key} height="44px" width="100%" />
              ))}
            </div>
          </Loader>
        ) : (
          <>
            <div
              className="mt-5 flex h-3 overflow-hidden rounded-full bg-layer-2"
              aria-label="工作项状态分布"
              role="img"
            >
              {summary.segments.map((segment) =>
                segment.value > 0 ? (
                  <div
                    key={segment.key}
                    className={STATUS_STYLES[segment.key].bar}
                    style={{ width: `${segment.ratio}%` }}
                    title={`${segment.label}: ${segment.value} (${segment.ratio}%)`}
                  />
                ) : null
              )}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-5">
              {summary.segments.map((segment) => {
                const statusStyle = STATUS_STYLES[segment.key];
                const Icon = statusStyle.icon;

                return (
                  <div key={segment.key} className="min-w-0">
                    <div className="flex items-center gap-2 text-12 text-secondary">
                      <span className={cn("h-2 w-2 flex-shrink-0 rounded-full", statusStyle.dot)} />
                      <Icon className={cn("h-3.5 w-3.5 flex-shrink-0", statusStyle.text)} />
                      <span className="truncate">{segment.label}</span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-15 font-semibold text-primary tabular-nums">
                        {formatNumber(segment.value)}
                      </span>
                      <span className="text-11 text-placeholder tabular-nums">{segment.ratio}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="border-t border-subtle p-4 lg:border-t-0 lg:border-l">
        <div className="mb-2 text-13 font-medium text-primary">执行指标</div>
        {isLoading ? (
          <Loader className="space-y-3">
            {METRIC_ITEMS.map((item) => (
              <Loader.Item key={item.key} height="32px" width="100%" />
            ))}
          </Loader>
        ) : (
          <div className="space-y-1">
            {METRIC_ITEMS.map((item) => (
              <MetricRow
                key={item.key}
                icon={item.icon}
                label={item.label}
                suffix={item.suffix}
                tone={item.tone}
                value={summary[item.key]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  </section>
);
