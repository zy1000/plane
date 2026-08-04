import { useCallback, useEffect, useState } from "react";
import type {
  TRequirement,
  TRequirementApprovalAction,
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
  requirementId,
  onRequirementUpdate,
  onRequirementDelete,
}: {
  workspaceSlug: string | undefined;
  requirementId: string | undefined;
  onRequirementUpdate?: (requirement: TRequirement) => void;
  onRequirementDelete?: (requirementId: string) => void;
}) => {
  const [changeRequestsPage, setChangeRequestsPage] = useState<TRequirementChangeRequestsResponse>(EMPTY_REQUESTS);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && requirementId));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | undefined>();
  const [perPage, setPerPage] = useState(20);

  const fetchChangeRequests = useCallback(async () => {
    if (!workspaceSlug || !requirementId) return EMPTY_REQUESTS;
    setIsLoading(true);
    setError(null);
    try {
      const response = await requirementService.listChangeRequests(workspaceSlug, requirementId, { cursor, perPage });
      setChangeRequestsPage(response);
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to load change requests."));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [cursor, perPage, requirementId, workspaceSlug]);

  useEffect(() => {
    void fetchChangeRequests().catch(() => undefined);
  }, [fetchChangeRequests]);

  const startEditing = useCallback(async () => {
    if (!workspaceSlug || !requirementId) throw new Error("Requirement is required.");
    setIsMutating(true);
    try {
      const response = await requirementService.startEditing(workspaceSlug, requirementId);
      onRequirementUpdate?.(response.requirement);
      return response.requirement;
    } finally {
      setIsMutating(false);
    }
  }, [onRequirementUpdate, requirementId, workspaceSlug]);

  /** 返回 outcome，调用方靠它决定留在详情页还是跳回列表 */
  const discardDraft = useCallback(async () => {
    if (!workspaceSlug || !requirementId) throw new Error("Requirement is required.");
    setIsMutating(true);
    try {
      const response = await requirementService.discardDraft(workspaceSlug, requirementId);
      if (response.outcome === "deleted") onRequirementDelete?.(requirementId);
      else if (response.requirement) onRequirementUpdate?.(response.requirement);
      return response;
    } finally {
      setIsMutating(false);
    }
  }, [onRequirementDelete, onRequirementUpdate, requirementId, workspaceSlug]);

  const submitChangeRequest = useCallback(
    async (reason: string) => {
      if (!workspaceSlug || !requirementId) throw new Error("Requirement is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.submitChangeRequest(workspaceSlug, requirementId, { reason });
        await fetchChangeRequests().catch(() => undefined);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchChangeRequests, requirementId, workspaceSlug]
  );

  /** 详情页头部的「撤回审批」直接作用在待审变更单上，不必先进对比页 */
  const cancelChangeRequest = useCallback(
    async (changeRequestId: string) => {
      if (!workspaceSlug || !requirementId) throw new Error("Requirement is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.cancelChangeRequest(workspaceSlug, requirementId, changeRequestId);
        await fetchChangeRequests().catch(() => undefined);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchChangeRequests, requirementId, workspaceSlug]
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
 * 变更对比页：变更单详情 + 明细数据组分页 + 审批动作。
 *
 * `changeType` 与 `requirementTypeId` 由调用方（URL query）持有，作为服务端筛选参数传入 ——
 * 千行明细下分段筛选和模板分视图都必须落到查询里，不能在前端过滤当前页。
 */
export const useRequirementChangeRequestDetail = ({
  workspaceSlug,
  requirementId,
  changeRequestId,
  changeType,
  requirementTypeId,
}: {
  workspaceSlug: string | undefined;
  requirementId: string | undefined;
  changeRequestId: string | undefined;
  changeType?: TRequirementChangeType;
  requirementTypeId?: string;
}) => {
  const isScoped = Boolean(workspaceSlug && requirementId && changeRequestId);
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
    if (!workspaceSlug || !requirementId || !changeRequestId) return null;
    setIsLoading(true);
    setError(null);
    try {
      const response = await requirementService.getChangeRequest(workspaceSlug, requirementId, changeRequestId);
      setChangeRequest(response);
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Unable to load the change request."));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [changeRequestId, requirementId, workspaceSlug]);

  const fetchItems = useCallback(async () => {
    if (!workspaceSlug || !requirementId || !changeRequestId) return EMPTY_ITEMS;
    setIsItemsLoading(true);
    setItemsError(null);
    try {
      const response = await requirementService.listChangeItems(workspaceSlug, requirementId, changeRequestId, {
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
  }, [changeRequestId, changeType, cursor, perPage, requirementId, requirementTypeId, workspaceSlug]);

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
      if (!workspaceSlug || !requirementId || !changeRequestId) throw new Error("Change request is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.actOnChangeRequest(workspaceSlug, requirementId, changeRequestId, {
          action,
          comment,
        });
        await fetchChangeRequest().catch(() => undefined);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [changeRequestId, fetchChangeRequest, requirementId, workspaceSlug]
  );

  const cancelChangeRequest = useCallback(async () => {
    if (!workspaceSlug || !requirementId || !changeRequestId) throw new Error("Change request is required.");
    setIsMutating(true);
    try {
      const response = await requirementService.cancelChangeRequest(workspaceSlug, requirementId, changeRequestId);
      await fetchChangeRequest().catch(() => undefined);
      return response;
    } finally {
      setIsMutating(false);
    }
  }, [changeRequestId, fetchChangeRequest, requirementId, workspaceSlug]);

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
