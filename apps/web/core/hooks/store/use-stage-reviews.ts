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
 * 全部评审 + 阶段汇总。局部 state，不进 MobX root store —— 口径同评审裁剪与模板库。
 *
 * - `project`：项目里的全部评审（一个项目是一两百条量级）。
 * - `product`：关联项目里这个产品的全部评审，只含当前用户能看阶段评审的项目；
 *   `linkedProjectIds` 是这些项目，空态靠它区分「没关联项目」与「关联了但还没评审」。
 *
 * 评审一次取全：左侧分组栏可以按研发阶段、产品 / 项目、状态、负责人……任意分，分组与筛选都在
 * 前端做。阶段汇总单独取，给「研发阶段」分组提供阶段名、顺序与完成度。
 *
 * 评审只由裁剪表生成，这里没有新建 / 删除。作用域用两个原始值传入而不是对象，免得调用方每次
 * 渲染新建对象触发重拉。
 */
export const useStageReviews = (
  workspaceSlug: string | undefined,
  scopeKind: "project" | "product",
  scopeId: string | undefined
) => {
  const [stages, setStages] = useState<TStageReviewStageSummary[]>([]);
  const [reviews, setReviews] = useState<TStageReview[]>([]);
  const [linkedProjectIds, setLinkedProjectIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && scopeId));
  const [error, setError] = useState<string | null>(null);

  const loadStages = useCallback(
    (slug: string, id: string) =>
      scopeKind === "product" ? service.listProductStages(slug, id) : service.listStages(slug, id),
    [scopeKind]
  );

  const fetchAll = useCallback(async () => {
    if (!workspaceSlug || !scopeId) return;
    setIsLoading(true);
    setError(null);
    try {
      if (scopeKind === "product") {
        const [nextStages, response] = await Promise.all([
          service.listProductStages(workspaceSlug, scopeId),
          service.listByProduct(workspaceSlug, scopeId),
        ]);
        setStages(nextStages);
        setReviews(response.reviews);
        setLinkedProjectIds(response.linked_project_ids ?? []);
      } else {
        const [nextStages, nextReviews] = await Promise.all([
          service.listStages(workspaceSlug, scopeId),
          service.list(workspaceSlug, scopeId),
        ]);
        setStages(nextStages);
        setReviews(nextReviews);
      }
    } catch (requestError) {
      setError(getStageReviewError(requestError).message);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, scopeKind, scopeId]);

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
      void loadStages(workspaceSlug ?? "", scopeId ?? "")
        .then(setStages)
        .catch(() => undefined);
    },
    [workspaceSlug, scopeId, loadStages]
  );

  /** 批量改属性后把改到的那几行换掉。批量只改人与日期，状态不变，不用刷阶段汇总 */
  const applyReviews = useCallback((next: TStageReview[]) => {
    if (next.length === 0) return;
    const byId = new Map(next.map((item) => [item.id, item]));
    setReviews((current) => current.map((item) => (byId.has(item.id) ? { ...item, ...byId.get(item.id) } : item)));
  }, []);

  return { stages, reviews, linkedProjectIds, isLoading, error, applyReview, applyReviews, refresh: fetchAll };
};
