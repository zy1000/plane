import { useCallback, useEffect, useState } from "react";
import type {
  TRequirementApprovalAction,
  TRequirementApprovalInboxResponse,
  TRequirementChangeItemsResponse,
  TRequirementChangeRequest,
  TRequirementChangeRequestDetail,
  TRequirementChangeRequestsResponse,
  TRequirementChangeStatus,
  TRequirementChangeType,
  TRequirementSubmitReviewPayload,
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

/** 变更记录 Tab：变更单列表 + 提交/撤回。一个产品下可以同时有多张待审单 */
export const useRequirementChangeRequests = ({
  workspaceSlug,
  productId,
}: {
  workspaceSlug: string | undefined;
  productId: string | undefined;
}) => {
  const [changeRequestsPage, setChangeRequestsPage] = useState<TRequirementChangeRequestsResponse>(EMPTY_REQUESTS);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && productId));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [perPage, setPerPage] = useState(20);
  const [scope, setScope] = useState<"all" | "mine" | "to_review">("all");
  const [statusFilter, setStatusFilter] = useState<TRequirementChangeStatus | undefined>();

  const fetchChangeRequests = useCallback(async () => {
    if (!workspaceSlug || !productId) return EMPTY_REQUESTS;
    setIsLoading(true);
    setError(null);
    try {
      const response = await requirementService.listChangeRequests(workspaceSlug, productId, {
        cursor,
        perPage,
        scope,
        status: statusFilter,
      });
      setChangeRequestsPage(response);
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to load change requests."));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [cursor, perPage, productId, scope, statusFilter, workspaceSlug]);

  useEffect(() => {
    void fetchChangeRequests().catch(() => undefined);
  }, [fetchChangeRequests]);

  /**
   * 提交 1..N 条需求进入评审。
   *
   * 没有单条的提交入口 —— 单条提交就是 items.length === 1，走同一条路径，单条与批量
   * 不会走偏。
   */
  const submitReview = useCallback(
    async (payload: TRequirementSubmitReviewPayload) => {
      if (!workspaceSlug || !productId) throw new Error("Product is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.submitReview(workspaceSlug, productId, payload);
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
    scope,
    setScope,
    statusFilter,
    setStatusFilter,
    submitReview,
    cancelChangeRequest,
    upsertChangeRequest,
  };
};

const EMPTY_INBOX: TRequirementApprovalInboxResponse = { results: [], pending_count: 0 };

/**
 * 待我审批。
 *
 * 跨产品聚合：审批人面对的是分散在多个产品里的 N 张小单，不聚合就只能挨个产品去翻。
 * `productId` 只是收窄，不是作用域 —— 产品页头部的入口默认收窄到当前产品。
 */
export const useRequirementApprovalInbox = ({
  workspaceSlug,
  productId,
}: {
  workspaceSlug: string | undefined;
  productId?: string;
}) => {
  const [inbox, setInbox] = useState<TRequirementApprovalInboxResponse>(EMPTY_INBOX);
  const [tab, setTab] = useState<"pending" | "processed">("pending");
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInbox = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!workspaceSlug) return EMPTY_INBOX;
      if (!options?.silent) {
        setIsLoading(true);
        setError(null);
      }
      try {
        const response = await requirementService.listMyApprovals(workspaceSlug, { tab, productId });
        setInbox(response);
        return response;
      } catch (requestError) {
        if (!options?.silent) {
          setError(getErrorMessage(requestError, "Unable to load your approvals."));
          throw requestError;
        }
        return EMPTY_INBOX;
      } finally {
        if (!options?.silent) setIsLoading(false);
      }
    },
    [productId, tab, workspaceSlug]
  );

  useEffect(() => {
    void fetchInbox().catch(() => undefined);
  }, [fetchInbox]);

  /** 就地审批：单子上带着自己的 product_id，不必先跳进那个产品 */
  const act = useCallback(
    async (item: { id: string; product_id: string }, action: TRequirementApprovalAction, comment?: string) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        await requirementService.actOnChangeRequest(workspaceSlug, item.product_id, item.id, { action, comment });
        await fetchInbox().catch(() => undefined);
      } finally {
        setIsMutating(false);
      }
    },
    [fetchInbox, workspaceSlug]
  );

  return { inbox, tab, setTab, isLoading, isMutating, error, fetchInbox, act };
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

  /**
   * 条目已经随详情内联下来时不再单独拉一遍。
   *
   * requirement_items 为 null 才说明超过了内联阈值，那时才需要分页端点 —— 这是常见
   * 情况下（一张单一两条需求）省掉的一次整轮请求。
   */
  const needsPagedItems = changeRequest !== null && changeRequest.requirement_items === null;
  useEffect(() => {
    if (!needsPagedItems) return;
    void fetchItems().catch(() => undefined);
  }, [fetchItems, needsPagedItems]);

  useEffect(() => setCursor(undefined), [changeType, requirementTypeId]);

  const actOnChangeRequest = useCallback(
    async (action: TRequirementApprovalAction, comment?: string, revert = false) => {
      if (!workspaceSlug || !productId || !changeRequestId) throw new Error("Change request is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.actOnChangeRequest(workspaceSlug, productId, changeRequestId, {
          action,
          comment,
          revert,
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
