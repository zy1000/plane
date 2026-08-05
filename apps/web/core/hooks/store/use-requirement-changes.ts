import { useCallback, useEffect, useState } from "react";
import type {
  TRequirementApprovalAction,
  TRequirementBaseline,
  TRequirementChangeItemsResponse,
  TRequirementChangeRequest,
  TRequirementChangeRequestDetail,
  TRequirementChangeRequestsResponse,
  TRequirementChangeType,
} from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? fallback;
  }
  return fallback;
};

const EMPTY_REQUESTS: TRequirementChangeRequestsResponse = {
  results: [],
  total_count: 0,
  total_pages: 0,
  count: 0,
};

const EMPTY_ITEMS: TRequirementChangeItemsResponse = {
  results: [],
  total_count: 0,
  total_pages: 0,
  count: 0,
};

/** 变更记录 Tab：变更单列表 + 工作副本与审批动作 */
export const useRequirementChangeRequests = ({
  workspaceSlug,
  productId,
  onBaselineUpdate,
}: {
  workspaceSlug: string | undefined;
  productId: string | undefined;
  onBaselineUpdate?: (baseline: TRequirementBaseline) => void;
}) => {
  const [changeRequestsPage, setChangeRequestsPage] = useState<TRequirementChangeRequestsResponse>(EMPTY_REQUESTS);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && productId));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [perPage, setPerPage] = useState(20);

  const fetchChangeRequests = useCallback(async () => {
    if (!workspaceSlug || !productId) return EMPTY_REQUESTS;
    setIsLoading(true);
    setError(null);
    try {
      const response = await requirementService.listChangeRequests(workspaceSlug, productId, { cursor, perPage });
      setChangeRequestsPage(response);
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to load change requests."));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [cursor, perPage, productId, workspaceSlug]);

  useEffect(() => {
    void fetchChangeRequests().catch(() => undefined);
  }, [fetchChangeRequests]);

  const startEditing = useCallback(async () => {
    if (!workspaceSlug || !productId) throw new Error("Product is required.");
    setIsMutating(true);
    try {
      const response = await requirementService.startEditing(workspaceSlug, productId);
      onBaselineUpdate?.(response.baseline);
      return response.baseline;
    } finally {
      setIsMutating(false);
    }
  }, [onBaselineUpdate, productId, workspaceSlug]);

  /** 返回 outcome：cleared = 从未发布过、条目已清空；reverted = 回到上一个已发布版本 */
  const discardDraft = useCallback(async () => {
    if (!workspaceSlug || !productId) throw new Error("Product is required.");
    setIsMutating(true);
    try {
      const response = await requirementService.discardDraft(workspaceSlug, productId);
      onBaselineUpdate?.(response.baseline);
      return response;
    } finally {
      setIsMutating(false);
    }
  }, [onBaselineUpdate, productId, workspaceSlug]);

  const submitChangeRequest = useCallback(
    async (reason: string) => {
      if (!workspaceSlug || !productId) throw new Error("Product is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.submitChangeRequest(workspaceSlug, productId, { reason });
        await fetchChangeRequests().catch(() => undefined);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchChangeRequests, productId, workspaceSlug]
  );

  /** 页面头部的「撤回审批」直接作用在待审变更单上，不必先进对比页 */
  const cancelChangeRequest = useCallback(
    async (changeRequestId: string) => {
      if (!workspaceSlug || !productId) throw new Error("Product is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.cancelChangeRequest(workspaceSlug, productId, changeRequestId);
        await fetchChangeRequests().catch(() => undefined);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchChangeRequests, productId, workspaceSlug]
  );

  const upsertChangeRequest = useCallback((changeRequest: TRequirementChangeRequest) => {
    setChangeRequestsPage((current) => ({
      ...current,
      results: current.results.map((item) => (item.id === changeRequest.id ? changeRequest : item)),
    }));
  }, []);

  const updatePerPage = useCallback((value: number) => {
    setCursor(undefined);
    setPerPage(value);
  }, []);

  return {
    changeRequestsPage,
    isLoading,
    isMutating,
    error,
    cursor,
    perPage,
    setCursor,
    setPerPage: updatePerPage,
    fetchChangeRequests,
    startEditing,
    discardDraft,
    submitChangeRequest,
    cancelChangeRequest,
    upsertChangeRequest,
  };
};

/**
 * 变更对比页：变更单详情 + 需求条目组分页 + 审批动作。
 *
 * `changeType` 与 `requirementTypeId` 由调用方（URL query）持有，作为服务端筛选参数传入 ——
 * 千行需求下分段筛选和按类型分视图都必须落到查询里，不能在前端过滤当前页。
 */
export const useRequirementChangeRequestDetail = ({
  workspaceSlug,
  productId,
  changeRequestId,
  changeType,
  requirementTypeId,
}: {
  workspaceSlug: string | undefined;
  productId: string | undefined;
  changeRequestId: string | undefined;
  changeType?: TRequirementChangeType;
  requirementTypeId?: string;
}) => {
  const isScoped = Boolean(workspaceSlug && productId && changeRequestId);
  const [changeRequest, setChangeRequest] = useState<TRequirementChangeRequestDetail | null>(null);
  const [itemsPage, setItemsPage] = useState<TRequirementChangeItemsResponse>(EMPTY_ITEMS);
  const [isLoading, setIsLoading] = useState(isScoped);
  const [isItemsLoading, setIsItemsLoading] = useState(isScoped);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [perPage, setPerPage] = useState(20);

  const fetchChangeRequest = useCallback(async () => {
    if (!workspaceSlug || !productId || !changeRequestId) return null;
    setIsLoading(true);
    setError(null);
    try {
      const response = await requirementService.getChangeRequest(workspaceSlug, productId, changeRequestId);
      setChangeRequest(response);
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to load the change request."));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [changeRequestId, productId, workspaceSlug]);

  const fetchItems = useCallback(async () => {
    if (!workspaceSlug || !productId || !changeRequestId) return EMPTY_ITEMS;
    setIsItemsLoading(true);
    setItemsError(null);
    try {
      const response = await requirementService.listChangeItems(workspaceSlug, productId, changeRequestId, {
        cursor,
        perPage,
        changeType,
        requirementTypeId,
      });
      setItemsPage(response);
      return response;
    } catch (requestError) {
      setItemsError(getErrorMessage(requestError, "Unable to load change items."));
      throw requestError;
    } finally {
      setIsItemsLoading(false);
    }
  }, [changeRequestId, changeType, cursor, perPage, productId, requirementTypeId, workspaceSlug]);

  useEffect(() => {
    setChangeRequest(null);
    void fetchChangeRequest().catch(() => undefined);
  }, [fetchChangeRequest]);

  useEffect(() => {
    void fetchItems().catch(() => undefined);
  }, [fetchItems]);

  useEffect(() => setCursor(undefined), [changeType, requirementTypeId]);

  const actOnChangeRequest = useCallback(
    async (action: TRequirementApprovalAction, comment?: string) => {
      if (!workspaceSlug || !productId || !changeRequestId) throw new Error("Change request is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.actOnChangeRequest(workspaceSlug, productId, changeRequestId, {
          action,
          comment,
        });
        await fetchChangeRequest().catch(() => undefined);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [changeRequestId, fetchChangeRequest, productId, workspaceSlug]
  );

  const cancelChangeRequest = useCallback(async () => {
    if (!workspaceSlug || !productId || !changeRequestId) throw new Error("Change request is required.");
    setIsMutating(true);
    try {
      const response = await requirementService.cancelChangeRequest(workspaceSlug, productId, changeRequestId);
      await fetchChangeRequest().catch(() => undefined);
      return response;
    } finally {
      setIsMutating(false);
    }
  }, [changeRequestId, fetchChangeRequest, productId, workspaceSlug]);

  const updatePerPage = useCallback((value: number) => {
    setCursor(undefined);
    setPerPage(value);
  }, []);

  return {
    changeRequest,
    itemsPage,
    isLoading,
    isItemsLoading,
    isMutating,
    error,
    itemsError,
    cursor,
    perPage,
    setCursor,
    setPerPage: updatePerPage,
    fetchChangeRequest,
    fetchItems,
    actOnChangeRequest,
    cancelChangeRequest,
  };
};
