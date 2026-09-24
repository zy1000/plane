import { useCallback, useEffect, useMemo, useState } from "react";
import type { TCreateProjectStagePayload, TProjectStage, TUpdateProjectStagePayload } from "@plane/types";
import { PROJECT_STAGE_MAX_WORKLOAD_RATIO } from "@plane/types";
import { ProjectStageService } from "@/services/project-stage.service";

const service = new ProjectStageService();

/**
 * 后端抛的是 `error?.response?.data`：领域错误是 `{error, code}`，序列化器错误是 `{字段: ["码"]}`。
 * 归一成一句话并把错误码取出来给调用方翻文案。
 */
export const getProjectStageError = (error: unknown): { message: string; code?: string } => {
  if (error && typeof error === "object") {
    const payload = error as Record<string, unknown>;
    const message = payload.error ?? payload.detail;
    if (typeof message === "string") {
      return { message, code: typeof payload.code === "string" ? payload.code : undefined };
    }
    const first = Object.values(payload).find(Array.isArray) as unknown[] | undefined;
    if (first && typeof first[0] === "string") {
      const text = first[0];
      return { message: text, code: text.startsWith("PROJECT_STAGE_") ? text : undefined };
    }
  }
  if (error instanceof Error) return { message: error.message };
  if (typeof error === "string") return { message: error };
  return { message: "Something went wrong." };
};

/**
 * 项目的全部阶段。局部 state，不进 MobX root store —— 口径同阶段评审与研发模式。
 *
 * 增删改都会**重拉整棵树**而不是就地替换：父占比是子之和、父第一次挂子时占比会下移、
 * 删叶子会改父的汇总值，就地替换要把这些规则在前端再算一遍，不值。列表一次十几到几十条，重拉很便宜。
 */
export const useProjectStages = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const [stages, setStages] = useState<TProjectStage[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && projectId));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;
    setError(null);
    try {
      setStages(await service.list(workspaceSlug, projectId));
    } catch (requestError) {
      setError(getProjectStageError(requestError).message);
    } finally {
      setIsLoading(false);
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

  const createStage = useCallback(
    (payload: TCreateProjectStagePayload) => mutate(() => service.create(workspaceSlug!, projectId!, payload)),
    [mutate, workspaceSlug, projectId]
  );

  const updateStage = useCallback(
    (stageId: string, payload: TUpdateProjectStagePayload) =>
      mutate(() => service.update(workspaceSlug!, projectId!, stageId, payload)),
    [mutate, workspaceSlug, projectId]
  );

  const deleteStage = useCallback(
    (stageId: string) => mutate(() => service.remove(workspaceSlug!, projectId!, stageId)),
    [mutate, workspaceSlug, projectId]
  );

  const syncFromDevMode = useCallback(
    (stageIds?: string[]) => mutate(() => service.syncFromDevMode(workspaceSlug!, projectId!, stageIds)),
    [mutate, workspaceSlug, projectId]
  );

  /** 批量改完后后端回的是改到的行，就地替换即可（占比 / 层级没变） */
  const applyStages = useCallback((next: TProjectStage[]) => {
    if (next.length === 0) return;
    const byId = new Map(next.map((stage) => [stage.id, stage]));
    setStages((current) => current.map((stage) => byId.get(stage.id) ?? stage));
  }, []);

  /**
   * 叶子占比合计与剩余。按「分」累加再除回来，避免 0.1 + 0.2 的浮点尾巴让合法输入被判超限。
   */
  const workloadTotal = useMemo(() => {
    const cents = stages.reduce(
      (sum, stage) => sum + (stage.children_count > 0 ? 0 : Math.round(Number(stage.workload_ratio ?? 0) * 100)),
      0
    );
    return cents / 100;
  }, [stages]);
  const workloadRemaining = Math.round((PROJECT_STAGE_MAX_WORKLOAD_RATIO - workloadTotal) * 100) / 100;

  return {
    stages,
    isLoading,
    isMutating,
    error,
    refresh: fetchAll,
    createStage,
    updateStage,
    deleteStage,
    syncFromDevMode,
    applyStages,
    workloadTotal,
    workloadRemaining,
  };
};
