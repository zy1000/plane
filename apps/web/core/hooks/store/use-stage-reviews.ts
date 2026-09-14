import { useCallback, useEffect, useState } from "react";
import type { TStageReview, TStageReviewStageSummary } from "@plane/types";
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
 * 项目里的全部评审 + 阶段汇总。局部 state，不进 MobX root store —— 口径同评审裁剪与模板库。
 *
 * 评审一次取全（一个项目是一两百条量级）：左侧分组栏可以按研发阶段、产品、状态、负责人……
 * 任意分，分组与筛选都在前端做。阶段汇总单独取，给「研发阶段」分组提供阶段名、顺序与完成度。
 *
 * 评审只由裁剪表生成，这里没有新建 / 删除。
 */
export const useStageReviews = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const [stages, setStages] = useState<TStageReviewStageSummary[]>([]);
  const [reviews, setReviews] = useState<TStageReview[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && projectId));
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [nextStages, nextReviews] = await Promise.all([
        service.listStages(workspaceSlug, projectId),
        service.list(workspaceSlug, projectId),
      ]);
      setStages(nextStages);
      setReviews(nextReviews);
    } catch (requestError) {
      setError(getStageReviewError(requestError).message);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, projectId]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  /**
   * 详情里改了什么就把列表里那一行换掉。
   *
   * 状态变了会影响阶段完成度，所以顺带刷一次阶段汇总 —— 那个接口只有一条 group by 查询，
   * 比整列表重拉便宜得多。
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

  return { stages, reviews, isLoading, error, applyReview, refresh: fetchAll };
};
