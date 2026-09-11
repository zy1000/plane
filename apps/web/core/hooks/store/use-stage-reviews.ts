import { useCallback, useEffect, useMemo, useState } from "react";
import type { TCreateStageReviewPayload, TStageReview, TStageReviewStageSummary } from "@plane/types";
import { StageReviewService } from "@/services/stage-review.service";

const service = new StageReviewService();

/**
 * 后端抛的是 `error?.response?.data`，断网时是 undefined。所有消费方都靠这个函数
 * 把它归一成一句话，顺带把领域错误码取出来给调用方翻译文案。
 */
export const getStageReviewError = (error: unknown): { message: string; code?: string } => {
  if (error && typeof error === "object") {
    const payload = error as Record<string, unknown>;
    const message = payload.error ?? payload.detail;
    if (typeof message === "string") {
      return { message, code: typeof payload.code === "string" ? payload.code : undefined };
    }
  }
  if (error instanceof Error) return { message: error.message };
  if (typeof error === "string") return { message: error };
  return { message: "Something went wrong." };
};

/**
 * 阶段列表（左栏）+ 当前阶段的评审（主区）。局部 state，不进 MobX root store ——
 * 口径同评审裁剪与模板库。
 *
 * 阶段只在进页时拉一次：它是「有没有评审」这个事实的汇总，推进状态会改完成数，所以
 * 每次拿到新的评审详情后由调用方调 `refresh()`，而不是每次切阶段都重拉一遍。
 */
export const useStageReviews = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const [stages, setStages] = useState<TStageReviewStageSummary[]>([]);
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<TStageReview[]>([]);
  const [isStagesLoading, setIsStagesLoading] = useState(Boolean(workspaceSlug && projectId));
  const [isReviewsLoading, setIsReviewsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStages = useCallback(async () => {
    if (!workspaceSlug || !projectId) return [];
    setIsStagesLoading(true);
    setError(null);
    try {
      const response = await service.listStages(workspaceSlug, projectId);
      setStages(response);
      // 首次进页默认选第一个阶段；已选的阶段还在就保持不动，别把用户拽回第一个
      setActiveStageId((current) =>
        current && response.some((stage) => stage.stage_id === current) ? current : (response[0]?.stage_id ?? null)
      );
      return response;
    } catch (requestError) {
      setError(getStageReviewError(requestError).message);
      throw requestError;
    } finally {
      setIsStagesLoading(false);
    }
  }, [workspaceSlug, projectId]);

  const fetchReviews = useCallback(async () => {
    if (!workspaceSlug || !projectId || !activeStageId) {
      setReviews([]);
      return [];
    }
    setIsReviewsLoading(true);
    try {
      const response = await service.list(workspaceSlug, projectId, activeStageId);
      setReviews(response);
      return response;
    } catch (requestError) {
      setError(getStageReviewError(requestError).message);
      throw requestError;
    } finally {
      setIsReviewsLoading(false);
    }
  }, [workspaceSlug, projectId, activeStageId]);

  useEffect(() => {
    void fetchStages().catch(() => undefined);
  }, [fetchStages]);

  useEffect(() => {
    void fetchReviews().catch(() => undefined);
  }, [fetchReviews]);

  /**
   * 详情里改了什么就把列表里那一行换掉。
   *
   * 状态变了会影响左栏进度与四个状态计数，所以顺带刷一次阶段汇总 —— 那个接口只有
   * 一条 group by 查询，比整列表重拉便宜得多。
   */
  const applyReview = useCallback(
    (next: TStageReview) => {
      setReviews((current) => current.map((item) => (item.id === next.id ? { ...item, ...next } : item)));
      void service
        .listStages(workspaceSlug ?? "", projectId ?? "")
        .then(setStages)
        .catch(() => undefined);
    },
    [workspaceSlug, projectId]
  );

  const createReview = useCallback(
    async (payload: TCreateStageReviewPayload) => {
      if (!workspaceSlug || !projectId) return undefined;
      const created = await service.create(workspaceSlug, projectId, payload);
      // 手工新建的评审一定落在当前阶段，直接插进列表，不整页重拉
      setReviews((current) => [...current, created]);
      void service.listStages(workspaceSlug, projectId).then(setStages).catch(() => undefined);
      return created;
    },
    [workspaceSlug, projectId]
  );

  const deleteReview = useCallback(
    async (reviewId: string) => {
      if (!workspaceSlug || !projectId) return;
      await service.destroy(workspaceSlug, projectId, reviewId);
      // 子活动跟着父评审一起删，本地也要一并摘掉
      setReviews((current) => current.filter((item) => item.id !== reviewId && item.parent_id !== reviewId));
      void service.listStages(workspaceSlug, projectId).then(setStages).catch(() => undefined);
    },
    [workspaceSlug, projectId]
  );

  const activeStage = useMemo(
    () => stages.find((stage) => stage.stage_id === activeStageId) ?? null,
    [stages, activeStageId]
  );

  return {
    stages,
    activeStage,
    activeStageId,
    setActiveStageId,
    reviews,
    isStagesLoading,
    isReviewsLoading,
    error,
    applyReview,
    createReview,
    deleteReview,
    refreshReviews: fetchReviews,
  };
};
