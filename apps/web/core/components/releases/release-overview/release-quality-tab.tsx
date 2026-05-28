/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React, { useMemo } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Layers, ShieldCheck } from "lucide-react";
import { OverdueByAssigneeCard, type TOverdueByAssigneeRow } from "@/components/common/overdue-by-assignee-card";

type Plan = {
  id?: string;
  name?: string | null;
  pass_rate?: Record<string, number> | null;
};

type Props = {
  totalIssues: number;
  backlogIssues: number;
  inProgressIssues: number;
  completedIssues: number;
  cancelledIssues: number;
  progress: number;
  plans: Plan[];
  overdueData: { total: number; data: TOverdueByAssigneeRow[] } | null | undefined;
};

const SECTION_CARD = "rounded-xl border border-subtle bg-surface-1";

const STATE_ITEMS = [
  { key: "completed", label: "已完成", color: "#16a34a" },
  { key: "inProgress", label: "进行中", color: "#f59e0b" },
  { key: "backlog", label: "未开始", color: "#64748b" },
  { key: "cancelled", label: "已取消", color: "#ef4444" },
] as const;

const PASS_RATE_KEYS = ["成功", "失败", "阻塞", "无效", "未执行"] as const;
const PASS_RATE_COLORS: Record<string, string> = {
  成功: "#16a34a",
  失败: "#ef4444",
  阻塞: "#f59e0b",
  无效: "#3b5999",
  未执行: "#bfbfbf",
};

export const ReleaseQualityTab: React.FC<Props> = ({
  totalIssues,
  backlogIssues,
  inProgressIssues,
  completedIssues,
  cancelledIssues,
  progress,
  plans,
  overdueData,
}) => {
  const counts: Record<(typeof STATE_ITEMS)[number]["key"], number> = {
    completed: completedIssues,
    inProgress: inProgressIssues,
    backlog: backlogIssues,
    cancelled: cancelledIssues,
  };
  const denom = totalIssues > 0 ? totalIssues : 1;

  const passRateAggregate = useMemo(() => {
    const acc: Record<string, number> = { 成功: 0, 失败: 0, 阻塞: 0, 无效: 0, 未执行: 0 };
    let plansWithRate = 0;
    for (const p of plans) {
      if (!p?.pass_rate) continue;
      plansWithRate += 1;
      for (const k of PASS_RATE_KEYS) {
        acc[k] += Number((p.pass_rate as Record<string, number>)[k] || 0);
      }
    }
    const total = Object.values(acc).reduce((s, n) => s + n, 0);
    const passed = acc["成功"];
    const passPct = total > 0 ? Math.floor((passed / total) * 100) : 0;
    const blocked = acc["阻塞"] + acc["失败"];
    return { acc, total, passed, passPct, blocked, plansWithRate };
  }, [plans]);

  return (
    <div className="flex min-h-[calc(100vh-9rem)] flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* 工作项状态分布 */}
        <section className={`${SECTION_CARD} p-5`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-accent-primary" aria-hidden />
              <h2 className="text-sm font-semibold text-primary">工作项状态分布</h2>
            </div>
            <span className="text-xs text-placeholder">
              共 <span className="font-semibold text-secondary tabular-nums">{totalIssues}</span> 个 · 完成度{" "}
              <span className="font-semibold text-secondary tabular-nums">{progress}%</span>
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {STATE_ITEMS.map((item) => {
              const value = counts[item.key];
              const pct = (value / denom) * 100;
              return (
                <div key={item.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1.5 text-secondary">
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      {item.label}
                    </span>
                    <span className="tabular-nums text-placeholder">
                      {value} · {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-layer-2">
                    <div
                      className="h-full"
                      style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: item.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 测试通过率 */}
        <section className={`${SECTION_CARD} p-5`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-success-primary" aria-hidden />
              <h2 className="text-sm font-semibold text-primary">测试质量</h2>
            </div>
            <span className="text-xs text-placeholder">
              {passRateAggregate.plansWithRate} 个计划 · {passRateAggregate.total} 个用例
            </span>
          </div>

          {passRateAggregate.total === 0 ? (
            <div className="mt-6 grid h-28 place-items-center text-sm text-placeholder">
              暂无测试执行数据
            </div>
          ) : (
            <>
              <div className="mt-4 flex items-end gap-3">
                <div className="text-4xl font-semibold leading-none tabular-nums text-primary">
                  {passRateAggregate.passPct}
                  <span className="ml-0.5 text-base font-medium text-placeholder">%</span>
                </div>
                <div className="flex flex-col text-xs text-placeholder">
                  <span>通过率</span>
                  <span className="text-secondary">
                    成功 {passRateAggregate.passed} / {passRateAggregate.total}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-layer-2">
                {PASS_RATE_KEYS.map((k) => {
                  const v = passRateAggregate.acc[k];
                  if (!v) return null;
                  const widthPct = (v / passRateAggregate.total) * 100;
                  return (
                    <div
                      key={k}
                      className="h-full"
                      style={{ width: `${widthPct}%`, backgroundColor: PASS_RATE_COLORS[k] }}
                    />
                  );
                })}
              </div>

              <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-secondary">
                {PASS_RATE_KEYS.map((k) => (
                  <li key={k} className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: PASS_RATE_COLORS[k] }}
                      />
                      {k}
                    </span>
                    <span className="tabular-nums text-placeholder">{passRateAggregate.acc[k]}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>

      {/* 风险提示 + 延期负责人 */}
      <div className="grid flex-1 grid-cols-1 gap-4 xl:grid-cols-12">
        <section className={`${SECTION_CARD} h-full xl:col-span-4 p-5`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[#f59e0b]" aria-hidden />
            <h2 className="text-sm font-semibold text-primary">风险提示</h2>
          </div>
          <div className="mt-3 space-y-3">
            <RiskRow
              icon={<AlertTriangle className="h-3.5 w-3.5 text-danger-primary" aria-hidden />}
              label="延期负责人"
              value={overdueData?.total ?? 0}
              suffix="位"
              tone="danger"
            />
            <RiskRow
              icon={<ClipboardList className="h-3.5 w-3.5 text-[#f59e0b]" aria-hidden />}
              label="阻塞/失败用例"
              value={passRateAggregate.blocked}
              suffix="条"
              tone="warning"
            />
            <RiskRow
              icon={<CheckCircle2 className="h-3.5 w-3.5 text-success-primary" aria-hidden />}
              label="未关闭工作项"
              value={backlogIssues + inProgressIssues}
              suffix="个"
              tone="default"
            />
          </div>
        </section>

        <div className="h-full xl:col-span-8">
          <OverdueByAssigneeCard
            data={overdueData}
            title="延期工作项负责人"
            className="h-full"
          />
        </div>
      </div>
    </div>
  );
};

const RiskRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix: string;
  tone: "danger" | "warning" | "default";
}> = ({ icon, label, value, suffix, tone }) => {
  const toneClass =
    tone === "danger"
      ? "text-danger-primary"
      : tone === "warning"
        ? "text-[#f59e0b]"
        : "text-primary";
  return (
    <div className="flex items-center justify-between rounded-md bg-layer-1 px-3 py-2.5">
      <span className="inline-flex items-center gap-2 text-sm text-secondary">
        {icon}
        {label}
      </span>
      <span className="inline-flex items-baseline gap-1">
        <span className={`text-lg font-semibold leading-none tabular-nums ${toneClass}`}>{value}</span>
        <span className="text-xs text-placeholder">{suffix}</span>
      </span>
    </div>
  );
};
