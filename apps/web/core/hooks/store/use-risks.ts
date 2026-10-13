import { useCallback, useEffect, useRef, useState } from "react";
import type { TCreateRiskPayload, TRisk, TRiskDetail, TUpdateRiskPayload } from "@plane/types";
import { RiskService } from "@/services/risk.service";

const service = new RiskService();

/**
 * 后端抛的是 `error?.response?.data`：领域错误是 `{error, code}`，序列化器错误是 `{字段: ["码"]}`。
 * 归一成一句话并把错误码取出来给调用方翻文案（`risk.errors.<code>`）。
 */
export const getRiskError = (error: unknown): { message: string; code?: string; field?: string } => {
  if (error && typeof error === "object") {
    const payload = error as Record<string, unknown>;
    const message = payload.error ?? payload.detail;
    if (typeof message === "string") {
      return { message, code: typeof payload.code === "string" ? payload.code : undefined };
    }
    const entry = Object.entries(payload).find(([, value]) => Array.isArray(value)) as
      | [string, unknown[]]
      | undefined;
    if (entry && typeof entry[1][0] === "string") {
      const text = entry[1][0];
      return { message: text, code: text.startsWith("RISK_") ? text : undefined, field: entry[0] };
    }
  }
  if (error instanceof Error) return { message: error.message };
  if (typeof error === "string") return { message: error };
  return { message: "Something went wrong." };
};

/**
 * 项目的全部风险。局部 state，不进 MobX root store —— 口径同项目阶段 / 阶段评审。
 *
 * 列表一次全量拉，筛选 / 排序在前端做。新建、删除后重拉；抽屉里改了字段用 `applyRisk`
 * 就地替换那一行，不用整表重拉。
 */
export const useRisks = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const [risks, setRisks] = useState<TRisk[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && projectId));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** 请求代际号：从 A 项目切到 B 时 A 的列表还在飞，晚到的不能把 B 的列表盖掉 */
  const requestIdRef = useRef(0);

  const fetchAll = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;
    const requestId = ++requestIdRef.current;
    setError(null);
    try {
      const next = await service.list(workspaceSlug, projectId);
      if (requestId !== requestIdRef.current) return;
      setRisks(next);
    } catch (requestError) {
      if (requestId !== requestIdRef.current) return;
      setError(getRiskError(requestError).message);
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [workspaceSlug, projectId]);

  useEffect(() => {
    setIsLoading(Boolean(workspaceSlug && projectId));
    void fetchAll();
  }, [fetchAll, workspaceSlug, projectId]);

  const mutate = useCallback(
    async <T,>(run: () => Promise<T>) => {
      if (!workspaceSlug || !projectId) return undefined;
      setIsMutating(true);
      try {
        const result = await run();
        await fetchAll();
        return result;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, projectId, fetchAll]
  );

  const createRisk = useCallback(
    (payload: TCreateRiskPayload) => mutate(() => service.create(workspaceSlug!, projectId!, payload)),
    [mutate, workspaceSlug, projectId]
  );

  const updateRisk = useCallback(
    (riskId: string, payload: TUpdateRiskPayload) =>
      mutate(() => service.update(workspaceSlug!, projectId!, riskId, payload)),
    [mutate, workspaceSlug, projectId]
  );

  const deleteRisk = useCallback(
    (riskId: string) => mutate(() => service.remove(workspaceSlug!, projectId!, riskId)),
    [mutate, workspaceSlug, projectId]
  );

  /** 抽屉里保存成功后回灌一行：详情是列表行的超集，直接覆盖 */
  const applyRisk = useCallback((next: TRiskDetail | TRisk) => {
    setRisks((current) => {
      const index = current.findIndex((risk) => risk.id === next.id);
      if (index === -1) return [next, ...current];
      const copy = current.slice();
      copy[index] = { ...current[index], ...next };
      return copy;
    });
  }, []);

  return { risks, isLoading, isMutating, error, refresh: fetchAll, createRisk, updateRisk, deleteRisk, applyRisk };
};
