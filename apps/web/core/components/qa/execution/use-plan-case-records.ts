import * as React from "react";
import { PlanService as PlanApiService } from "@/services/qa/plan.service";
import type { ExecRecord } from "./execution-records";

/**
 * 当前计划用例的执行记录（按时间倒序，带每次执行的附件）。
 * 执行页签、附件页签和页签计数共用这一份；切换用例或调 reload 时重拉。
 */
export function usePlanCaseRecords(
  workspaceSlug: string | undefined,
  planId: string | undefined,
  caseId: string | undefined
) {
  const planService = React.useMemo(() => new PlanApiService(), []);
  const [records, setRecords] = React.useState<ExecRecord[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadTick, setReloadTick] = React.useState(0);
  const lastCaseKeyRef = React.useRef<string>("");

  React.useEffect(() => {
    if (!workspaceSlug || !planId || !caseId) {
      setRecords([]);
      setError(null);
      return;
    }
    // 换了用例先清空，避免页签计数短暂显示上一条用例的数据；同一用例 reload 时保留旧数据
    const caseKey = `${planId}:${caseId}`;
    if (lastCaseKeyRef.current !== caseKey) {
      lastCaseKeyRef.current = caseKey;
      setRecords([]);
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    planService
      .getPlanCaseRecord(String(workspaceSlug), { plan_id: String(planId), case_id: String(caseId) })
      .then((data) => {
        if (!cancelled) setRecords(Array.isArray(data) ? (data as ExecRecord[]) : []);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setRecords([]);
        setError(e?.message || e?.detail || e?.error || "获取执行记录失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, planId, caseId, reloadTick, planService]);

  const reload = React.useCallback(() => setReloadTick((t) => t + 1), []);

  return { records, loading, error, reload };
}
