import { useCallback, useEffect, useState } from "react";
import type {
  TCreateReviewTailoringPayload,
  TReviewTailoring,
  TReviewTailoringDetail,
  TUpdateReviewTailoringHeaderPayload,
} from "@plane/types";
import { ReviewTailoringService } from "@/services/review-tailoring.service";

const service = new ReviewTailoringService();

/**
 * 后端抛的是 `error?.response?.data`，断网时是 undefined。所有消费方都靠这个函数
 * 把它归一成一句话，顺带把领域错误码取出来给调用方翻译文案。
 */
export const getTailoringError = (error: unknown): { message: string; code?: string } => {
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

/** 裁剪表列表。局部 state，不进 MobX root store —— 口径同评审模板库 */
export const useReviewTailorings = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const [tailorings, setTailorings] = useState<TReviewTailoring[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && projectId));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTailorings = useCallback(async () => {
    if (!workspaceSlug || !projectId) return [];
    setIsLoading(true);
    setError(null);
    try {
      const response = await service.list(workspaceSlug, projectId);
      setTailorings(response);
      return response;
    } catch (requestError) {
      setError(getTailoringError(requestError).message);
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, projectId]);

  useEffect(() => {
    void fetchTailorings().catch(() => undefined);
  }, [fetchTailorings]);

  const createTailoring = useCallback(
    async (payload: TCreateReviewTailoringPayload): Promise<TReviewTailoringDetail | undefined> => {
      if (!workspaceSlug || !projectId) return undefined;
      setIsMutating(true);
      try {
        const created = await service.create(workspaceSlug, projectId, payload);
        // 详情比列表行多带 items/products/approvals，多出来的字段列表用不到也不碍事
        setTailorings((current) => [created, ...current]);
        return created;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, projectId]
  );

  /** 列表行不带描述，编辑弹窗打开时单独取一次详情 */
  const retrieveTailoring = useCallback(
    async (tailoringId: string): Promise<TReviewTailoringDetail | undefined> => {
      if (!workspaceSlug || !projectId) return undefined;
      return service.retrieve(workspaceSlug, projectId, tailoringId);
    },
    [workspaceSlug, projectId]
  );

  /** 改标题 / 描述。响应是详情，列表只同步它看得见的两项，按请求人算的字段不动 */
  const updateTailoring = useCallback(
    async (tailoringId: string, payload: TUpdateReviewTailoringHeaderPayload) => {
      if (!workspaceSlug || !projectId) return undefined;
      setIsMutating(true);
      try {
        const updated = await service.updateHeader(workspaceSlug, projectId, tailoringId, payload);
        setTailorings((current) =>
          current.map((item) =>
            item.id === tailoringId ? { ...item, title: updated.title, updated_at: updated.updated_at } : item
          )
        );
        return updated;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, projectId]
  );

  const deleteTailoring = useCallback(
    async (tailoringId: string) => {
      if (!workspaceSlug || !projectId) return;
      setIsMutating(true);
      try {
        await service.destroy(workspaceSlug, projectId, tailoringId);
        setTailorings((current) => current.filter((item) => item.id !== tailoringId));
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, projectId]
  );

  return {
    tailorings,
    isLoading,
    isMutating,
    error,
    fetchTailorings,
    createTailoring,
    retrieveTailoring,
    updateTailoring,
    deleteTailoring,
  };
};

export type TReviewTailoringsStore = ReturnType<typeof useReviewTailorings>;
