import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  TActReviewTailoringPayload,
  TReviewTailoringCellPayload,
  TReviewTailoringDetail,
  TReviewTailoringItem,
  TSubmitReviewTailoringPayload,
  TUpdateReviewTailoringHeaderPayload,
} from "@plane/types";
import { EReviewTailoringStatus, REVIEW_TAILORING_EDITABLE_STATUSES } from "@plane/types";
import { ReviewTailoringService } from "@/services/review-tailoring.service";
import { getTailoringError } from "./use-review-tailorings";

const service = new ReviewTailoringService();

/**
 * 父子联动：勾评审活动 → 自动勾它所属的评审；取消评审 → 它下面的活动全部取消。
 *
 * 与后端 `utils/review_tailoring.py::_cascade_selection` 同一套规则。两边都做是因为
 * 前端这份只是交互糖（勾完当场看到父被点亮），服务端那份才是规则本身。
 *
 * 两遍的顺序不能反：先把子拉起父，再让被取消的父带走子，否则刚被子点亮的父会被清掉。
 */
const cascadeSelection = (items: TReviewTailoringItem[]): TReviewTailoringItem[] => {
  const next = items.map((item) => ({ ...item }));
  const byKey = new Map(next.map((item) => [`${item.product_id}:${item.template_id}`, item]));

  for (const item of next) {
    if (!item.parent_template_id || !item.selected) continue;
    const parent = byKey.get(`${item.product_id}:${item.parent_template_id}`);
    if (parent && !parent.selected) {
      parent.selected = true;
      parent.reason = "";
    }
  }
  for (const item of next) {
    if (!item.parent_template_id || !item.selected) continue;
    const parent = byKey.get(`${item.product_id}:${item.parent_template_id}`);
    if (parent && !parent.selected) item.selected = false;
  }
  // 勾上的格子不留裁剪原因，否则明细表会显示成「要做，但原因是…」
  for (const item of next) {
    if (item.selected && item.reason) item.reason = "";
  }
  return next;
};

/**
 * 裁剪表详情 + 矩阵的本地编辑。
 *
 * 勾选不是逐格自动保存 —— 矩阵一次要点几十下，每下发一个请求既慢又会让「父子联动」
 * 在网络往返里闪。改动先攒在本地（`isDirty`），由用户点保存或提交签批时一次发出。
 *
 * 所有动作的响应都是完整详情，直接整块替换本地状态，不再补一次拉取。
 */
export const useReviewTailoringDetail = (
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  tailoringId: string | undefined
) => {
  const [detail, setDetail] = useState<TReviewTailoringDetail | null>(null);
  const [items, setItems] = useState<TReviewTailoringItem[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && projectId && tailoringId));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const apply = useCallback((next: TReviewTailoringDetail) => {
    setDetail(next);
    setItems(next.items);
    setIsDirty(false);
  }, []);

  const fetchDetail = useCallback(async () => {
    if (!workspaceSlug || !projectId || !tailoringId) return undefined;
    setIsLoading(true);
    setError(null);
    try {
      const response = await service.retrieve(workspaceSlug, projectId, tailoringId);
      apply(response);
      return response;
    } catch (requestError) {
      setError(getTailoringError(requestError).message);
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, projectId, tailoringId, apply]);

  useEffect(() => {
    void fetchDetail().catch(() => undefined);
  }, [fetchDetail]);

  const isEditable = useMemo(
    () => Boolean(detail && REVIEW_TAILORING_EDITABLE_STATUSES.includes(detail.status)),
    [detail]
  );

  /** 改一个格子。联动在本地立刻算好，不等服务端 */
  const setCell = useCallback(
    (itemId: string, patch: { selected?: boolean; reason?: string }) => {
      setItems((current) =>
        cascadeSelection(
          current.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
        )
      );
      setIsDirty(true);
    },
    []
  );

  /** 给一批格子统一填裁剪原因（明细表的「批量填写原因」） */
  const setReasonForMany = useCallback((itemIds: string[], reason: string) => {
    const targets = new Set(itemIds);
    setItems((current) => current.map((item) => (targets.has(item.id) ? { ...item, reason } : item)));
    setIsDirty(true);
  }, []);

  const run = useCallback(
    async (action: () => Promise<TReviewTailoringDetail>) => {
      setIsMutating(true);
      try {
        const next = await action();
        apply(next);
        return next;
      } finally {
        setIsMutating(false);
      }
    },
    [apply]
  );

  /** 只发真正变过的格子，别把几百个没动过的一起推上去 */
  const buildDirtyCells = useCallback((): TReviewTailoringCellPayload[] => {
    const original = new Map((detail?.items ?? []).map((item) => [item.id, item]));
    return items
      .filter((item) => {
        const before = original.get(item.id);
        return !before || before.selected !== item.selected || before.reason !== item.reason;
      })
      .map((item) => ({ id: item.id, selected: item.selected, reason: item.reason }));
  }, [detail, items]);

  const saveCells = useCallback(async () => {
    if (!workspaceSlug || !projectId || !tailoringId) return undefined;
    const cells = buildDirtyCells();
    if (cells.length === 0) {
      setIsDirty(false);
      return detail ?? undefined;
    }
    return run(() => service.saveCells(workspaceSlug, projectId, tailoringId, cells));
  }, [workspaceSlug, projectId, tailoringId, buildDirtyCells, detail, run]);

  const updateHeader = useCallback(
    async (payload: TUpdateReviewTailoringHeaderPayload) => {
      if (!workspaceSlug || !projectId || !tailoringId) return undefined;
      return run(() => service.updateHeader(workspaceSlug, projectId, tailoringId, payload));
    },
    [workspaceSlug, projectId, tailoringId, run]
  );

  const addProducts = useCallback(
    async (productIds: string[]) => {
      if (!workspaceSlug || !projectId || !tailoringId) return undefined;
      return run(() => service.addProducts(workspaceSlug, projectId, tailoringId, productIds));
    },
    [workspaceSlug, projectId, tailoringId, run]
  );

  const removeProduct = useCallback(
    async (productId: string) => {
      if (!workspaceSlug || !projectId || !tailoringId) return undefined;
      return run(() => service.removeProduct(workspaceSlug, projectId, tailoringId, productId));
    },
    [workspaceSlug, projectId, tailoringId, run]
  );

  const addReviews = useCallback(
    async (templateIds: string[]) => {
      if (!workspaceSlug || !projectId || !tailoringId) return undefined;
      return run(() => service.addReviews(workspaceSlug, projectId, tailoringId, templateIds));
    },
    [workspaceSlug, projectId, tailoringId, run]
  );

  const removeReview = useCallback(
    async (templateId: string) => {
      if (!workspaceSlug || !projectId || !tailoringId) return undefined;
      return run(() => service.removeReview(workspaceSlug, projectId, tailoringId, templateId));
    },
    [workspaceSlug, projectId, tailoringId, run]
  );

  /** 提交签批前先把未保存的勾选落库，否则服务端校验的是旧矩阵 */
  const submit = useCallback(
    async (payload: TSubmitReviewTailoringPayload) => {
      if (!workspaceSlug || !projectId || !tailoringId) return undefined;
      const cells = buildDirtyCells();
      return run(async () => {
        if (cells.length > 0) await service.saveCells(workspaceSlug, projectId, tailoringId, cells);
        return service.submit(workspaceSlug, projectId, tailoringId, payload);
      });
    },
    [workspaceSlug, projectId, tailoringId, buildDirtyCells, run]
  );

  const withdraw = useCallback(async () => {
    if (!workspaceSlug || !projectId || !tailoringId) return undefined;
    return run(() => service.withdraw(workspaceSlug, projectId, tailoringId));
  }, [workspaceSlug, projectId, tailoringId, run]);

  const act = useCallback(
    async (payload: TActReviewTailoringPayload) => {
      if (!workspaceSlug || !projectId || !tailoringId) return undefined;
      return run(() => service.act(workspaceSlug, projectId, tailoringId, payload));
    },
    [workspaceSlug, projectId, tailoringId, run]
  );

  const revise = useCallback(async () => {
    if (!workspaceSlug || !projectId || !tailoringId) return undefined;
    return run(() => service.revise(workspaceSlug, projectId, tailoringId));
  }, [workspaceSlug, projectId, tailoringId, run]);

  const cancelRevision = useCallback(async () => {
    if (!workspaceSlug || !projectId || !tailoringId) return undefined;
    return run(() => service.cancelRevision(workspaceSlug, projectId, tailoringId));
  }, [workspaceSlug, projectId, tailoringId, run]);

  /** 丢弃未保存的改动，回到服务端那份 */
  const resetCells = useCallback(() => {
    setItems(detail?.items ?? []);
    setIsDirty(false);
  }, [detail]);

  return {
    detail,
    items,
    isLoading,
    isMutating,
    isDirty,
    isEditable,
    isPending: detail?.status === EReviewTailoringStatus.PENDING,
    error,
    fetchDetail,
    setCell,
    setReasonForMany,
    resetCells,
    saveCells,
    updateHeader,
    addProducts,
    removeProduct,
    addReviews,
    removeReview,
    submit,
    withdraw,
    act,
    revise,
    cancelRevision,
  };
};

export type TReviewTailoringDetailStore = ReturnType<typeof useReviewTailoringDetail>;
