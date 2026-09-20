/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";
import type { TPlanListRow, TPlanPassRate } from "@/services/qa/plan.service";

/** 展示顺序即「离通过还有多远」，与后端 PlanCase.Result 一致 */
const RESULT_KEYS: Array<keyof TPlanPassRate> = ["成功", "失败", "阻塞", "未执行", "无效"];

const DOT_CLASS: Record<keyof TPlanPassRate, string> = {
  成功: "bg-success-primary",
  失败: "bg-danger-primary",
  阻塞: "bg-warning-primary",
  未执行: "bg-layer-3",
  无效: "border border-strong",
};

/** 成功用例占比（向下取整）；没有用例时返回 null */
export const getPlanPassPercent = (passRate?: Partial<TPlanPassRate> | null): number | null => {
  const total = RESULT_KEYS.reduce((sum, key) => sum + Number(passRate?.[key] || 0), 0);
  if (!total) return null;
  return Math.floor((Number(passRate?.["成功"] || 0) / total) * 100);
};

/**
 * 列表里的通过率：只留百分比，按计划阈值着色；悬停给出五种执行结果的计数。
 * 不画进度条——那条五色条在 50px 的行里读不出信息，只剩噪音。
 */
export const PlanPassRate = ({ plan }: { plan: Pick<TPlanListRow, "pass_rate" | "threshold"> }) => {
  const percent = getPlanPassPercent(plan.pass_rate);
  if (percent === null) return null;
  const threshold = Number(plan.threshold ?? 100);
  const reached = percent >= threshold;
  return (
    <Tooltip
      position="top"
      className="px-3 py-2"
      tooltipContent={
        <div className="flex flex-col gap-1 text-12 text-primary">
          {RESULT_KEYS.map((key) => (
            <span key={key} className="flex items-center gap-2 tabular-nums">
              <span className={cn("size-2 shrink-0 rounded-full", DOT_CLASS[key])} />
              <span className="w-10">{key}</span>
              <span>{Number(plan.pass_rate?.[key] || 0)}</span>
            </span>
          ))}
        </div>
      }
    >
      <span
        className={cn(
          "cursor-default text-14 font-semibold tabular-nums",
          reached ? "text-success-primary" : "text-danger-primary"
        )}
      >
        {percent}%
      </span>
    </Tooltip>
  );
};
