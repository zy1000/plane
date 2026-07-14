import { useCallback, useMemo, useState } from "react";
import {
  RequirementService,
  type TRequirementCloseReason,
  type TRequirementStatus,
  type TRequirementType,
  type TUserRequirementDetail,
  type TUserRequirementListParams,
  type TUserRequirementPayload,
} from "@/services/requirement.service";

const requirementService = new RequirementService();

export const useUserRequirements = (
  workspaceSlug?: string,
  productId?: string,
  requirementType: TRequirementType = "user"
) => {
  const [requirements, setRequirements] = useState<
    Awaited<ReturnType<typeof requirementService.getUserRequirements>>["data"]
  >([]);
  const [totalCount, setTotalCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<TRequirementStatus, number>>({
    draft: 0,
    in_review: 0,
    published: 0,
    rejected: 0,
    closed: 0,
  });
  const [archivedCount, setArchivedCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const fetchRequirements = useCallback(
    async (params: TUserRequirementListParams) => {
      if (!workspaceSlug || !productId) return undefined;
      setIsLoading(true);
      setError(null);
      try {
        const response = await requirementService.getUserRequirements(
          workspaceSlug,
          productId,
          params,
          requirementType
        );
        setRequirements(response.data);
        setTotalCount(response.count);
        setStatusCounts(response.status_counts);
        setArchivedCount(response.archived_count);
        return response;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [productId, requirementType, workspaceSlug]
  );

  const fetchRequirement = useCallback(
    async (requirementId: string) => {
      if (!workspaceSlug || !productId) return undefined;
      setIsDetailLoading(true);
      try {
        return await requirementService.getUserRequirement(workspaceSlug, productId, requirementId, requirementType);
      } finally {
        setIsDetailLoading(false);
      }
    },
    [productId, requirementType, workspaceSlug]
  );

  const fetchParentOptions = useCallback(
    async (search?: string, exclude?: string) => {
      if (!workspaceSlug || !productId) return [];
      return requirementService.getParentOptions(workspaceSlug, productId, search, exclude, requirementType);
    },
    [productId, requirementType, workspaceSlug]
  );

  const createRequirement = useCallback(
    async (data: TUserRequirementPayload, submitForReview = true) => {
      if (!workspaceSlug || !productId) throw new Error("缺少产品参数");
      setIsMutating(true);
      try {
        const response = await requirementService.createUserRequirement(
          workspaceSlug,
          productId,
          data,
          requirementType,
          submitForReview
        );
        setRequirements((current) => [response, ...current.filter((item) => item.id !== response.id)]);
        setTotalCount((count) => count + 1);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [productId, requirementType, workspaceSlug]
  );

  const updateRequirement = useCallback(
    async (requirementId: string, data: Partial<TUserRequirementPayload>, submitForReview = true) => {
      if (!workspaceSlug || !productId) throw new Error("缺少产品参数");
      setIsMutating(true);
      try {
        await requirementService.updateUserRequirement(
          workspaceSlug,
          productId,
          requirementId,
          data,
          requirementType,
          submitForReview
        );
        const response = await requirementService.getUserRequirement(
          workspaceSlug,
          productId,
          requirementId,
          requirementType
        );
        setRequirements((current) => current.map((item) => (item.id === response.id ? response : item)));
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [productId, requirementType, workspaceSlug]
  );

  const saveChangeDraft = useCallback(
    async (requirementId: string, changeId: string, data: Partial<TUserRequirementPayload>) => {
      if (!workspaceSlug || !productId) throw new Error("缺少产品参数");
      setIsMutating(true);
      try {
        await requirementService.saveChangeDraft(
          workspaceSlug,
          productId,
          requirementId,
          changeId,
          data,
          requirementType
        );
        return await fetchRequirement(requirementId);
      } finally {
        setIsMutating(false);
      }
    },
    [fetchRequirement, productId, requirementType, workspaceSlug]
  );

  const submitChange = useCallback(
    async (requirementId: string, changeId: string, data?: Partial<TUserRequirementPayload>) => {
      if (!workspaceSlug || !productId) throw new Error("缺少产品参数");
      setIsMutating(true);
      try {
        await requirementService.submitChange(workspaceSlug, productId, requirementId, changeId, requirementType, data);
        return await fetchRequirement(requirementId);
      } finally {
        setIsMutating(false);
      }
    },
    [fetchRequirement, productId, requirementType, workspaceSlug]
  );

  const withdrawChange = useCallback(
    async (requirementId: string, changeId: string) => {
      if (!workspaceSlug || !productId) throw new Error("缺少产品参数");
      setIsMutating(true);
      try {
        await requirementService.withdrawChange(workspaceSlug, productId, requirementId, changeId, requirementType);
        return await fetchRequirement(requirementId);
      } finally {
        setIsMutating(false);
      }
    },
    [fetchRequirement, productId, requirementType, workspaceSlug]
  );

  const discardChangeDraft = useCallback(
    async (requirementId: string, changeId: string) => {
      if (!workspaceSlug || !productId) throw new Error("缺少产品参数");
      setIsMutating(true);
      try {
        return await requirementService.discardChangeDraft(
          workspaceSlug,
          productId,
          requirementId,
          changeId,
          requirementType
        );
      } finally {
        setIsMutating(false);
      }
    },
    [productId, requirementType, workspaceSlug]
  );

  const transitionLifecycle = useCallback(
    async (
      requirementId: string,
      data:
        | { action: "closed"; reason_code: TRequirementCloseReason; note?: string }
        | { action: "reopened"; note: string }
    ) => {
      if (!workspaceSlug || !productId) throw new Error("缺少产品参数");
      setIsMutating(true);
      try {
        const response = await requirementService.transitionLifecycle(
          workspaceSlug,
          productId,
          requirementId,
          requirementType,
          data
        );
        setRequirements((current) => current.map((item) => (item.id === response.id ? response : item)));
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [productId, requirementType, workspaceSlug]
  );

  const setArchived = useCallback(
    async (requirementId: string, archived: boolean) => {
      if (!workspaceSlug || !productId) throw new Error("缺少产品参数");
      setIsMutating(true);
      try {
        const response = archived
          ? await requirementService.archiveRequirement(workspaceSlug, productId, requirementId, requirementType)
          : await requirementService.restoreRequirement(workspaceSlug, productId, requirementId, requirementType);
        setRequirements((current) => current.filter((item) => item.id !== requirementId));
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [productId, requirementType, workspaceSlug]
  );

  const deleteRequirement = useCallback(
    async (requirementId: string) => {
      if (!workspaceSlug || !productId) throw new Error("缺少产品参数");
      setIsMutating(true);
      try {
        await requirementService.deleteUserRequirement(workspaceSlug, productId, requirementId, requirementType);
        setRequirements((current) => current.filter((item) => item.id !== requirementId));
      } finally {
        setIsMutating(false);
      }
    },
    [productId, requirementType, workspaceSlug]
  );

  return useMemo(
    () => ({
      requirements,
      totalCount,
      statusCounts,
      archivedCount,
      isLoading,
      isDetailLoading,
      isMutating,
      error,
      fetchRequirements,
      fetchRequirement,
      fetchParentOptions,
      createRequirement,
      updateRequirement,
      saveChangeDraft,
      submitChange,
      withdrawChange,
      discardChangeDraft,
      transitionLifecycle,
      setArchived,
      deleteRequirement,
    }),
    [
      createRequirement,
      archivedCount,
      discardChangeDraft,
      deleteRequirement,
      error,
      fetchParentOptions,
      fetchRequirement,
      fetchRequirements,
      isDetailLoading,
      isLoading,
      isMutating,
      requirements,
      saveChangeDraft,
      setArchived,
      statusCounts,
      submitChange,
      totalCount,
      transitionLifecycle,
      updateRequirement,
      withdrawChange,
    ]
  );
};

export type TRequirementSubmit = (data: TUserRequirementPayload) => Promise<TUserRequirementDetail>;
