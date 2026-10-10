import { ChevronRight } from "lucide-react";
import { cn } from "@plane/utils";
import type { TReportPlanStat } from "@/services/qa/report.service";
import { EXECUTION_RESULT_META } from "./execution-result";
import { ReportCard, ReportCardHeader } from "./report-card";

type Props = {
  plans: TReportPlanStat[];
  loading?: boolean;
  /** 「查看全部」去的测试计划列表页 */
  plansHref?: string;
  onOpenPlan?: (plan: TReportPlanStat) => void;
};

const PLAN_STATE_CLASS: Record<string, string> = {
  未开始: "text-tertiary",
  进行中: "text-accent-primary",
  已完成: "text-success-primary",
};

/** 关联测试计划：每个计划一行，右侧是它自己的通过率和五态小条 */
export const ReportPlansCard = ({ plans, loading = false, plansHref, onOpenPlan }: Props) => (
  <ReportCard className="flex flex-col">
    <ReportCardHeader
      title="关联测试计划"
      count={plans.length}
      right={
        plansHref ? (
          <a href={plansHref} className="inline-flex items-center gap-0.5 text-12 text-tertiary hover:text-primary">
            查看全部 <ChevronRight className="size-3" />
          </a>
        ) : undefined
      }
    />
    <div className="flex flex-1 flex-col px-2 pb-2.5 pt-2">
      {loading && plans.length === 0 ? (
        <div className="grid flex-1 place-items-center py-10 text-13 text-tertiary">加载中...</div>
      ) : plans.length === 0 ? (
        <div className="grid flex-1 place-items-center py-10 text-13 text-tertiary">没有关联的测试计划</div>
      ) : (
        plans.map((plan) => {
          const belowThreshold =
            plan.threshold !== null && plan.threshold !== undefined && plan.case_count > 0
              ? plan.overall_pass_rate < plan.threshold
              : false;
          const total = EXECUTION_RESULT_META.reduce((sum, m) => sum + Number(plan.pass_rate?.[m.key] || 0), 0);
          return (
            <button
              key={plan.id}
              type="button"
              disabled={!onOpenPlan}
              onClick={() => onOpenPlan?.(plan)}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_112px] items-center gap-x-3.5 gap-y-1 rounded-[7px] px-3 py-2.5 text-left transition-colors",
                onOpenPlan ? "hover:bg-layer-1" : "cursor-default"
              )}
            >
              <span className="truncate text-13 font-medium text-primary" title={plan.name}>
                {plan.name}
              </span>
              <span className="row-span-2 flex flex-col items-end gap-1.5">
                <b
                  className={`text-sm font-semibold tabular-nums ${belowThreshold ? "text-warning-primary" : "text-primary"}`}
                  title={
                    plan.threshold !== null && plan.threshold !== undefined ? `计划阈值 ${plan.threshold}%` : undefined
                  }
                >
                  {Number(plan.overall_pass_rate ?? 0).toFixed(1)}%
                </b>
                <span className="flex h-[5px] w-28 gap-px overflow-hidden rounded-full bg-layer-3">
                  {total > 0 &&
                    EXECUTION_RESULT_META.filter((m) => m.key !== "未执行" && Number(plan.pass_rate?.[m.key] || 0) > 0).map(
                      (m) => (
                        <span
                          key={m.key}
                          className="h-full"
                          style={{ width: `${(Number(plan.pass_rate?.[m.key] || 0) / total) * 100}%`, background: m.color }}
                        />
                      )
                    )}
                </span>
              </span>
              <span className="flex gap-2.5 whitespace-nowrap text-12 text-tertiary tabular-nums">
                <span>{plan.case_count} 条用例</span>
                <span>{plan.assignee_count} 位执行人</span>
                {plan.state && <span className={PLAN_STATE_CLASS[plan.state] ?? "text-tertiary"}>{plan.state}</span>}
              </span>
            </button>
          );
        })
      )}
    </div>
  </ReportCard>
);
