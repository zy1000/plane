import { useCallback, useMemo, useState } from "react";
import {
  RequirementService,
  type TUserRequirementDetail,
  type TUserRequirementListParams,
  type TUserRequirementPayload,
} from "@/services/requirement.service";

const requirementService = new RequirementService();

export const useUserRequirements = (workspaceSlug?: string, productId?: string) => {
  const [requirements, setRequirements] = useState<
    Awaited<ReturnType<typeof requirementService.getUserRequirements>>["data"]
  >([]);
  const [totalCount, setTotalCount] = useState(0);
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
        const response = await requirementService.getUserRequirements(workspaceSlug, productId, params);
        setRequirements(response.data);
        setTotalCount(response.count);
        return response;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [productId, workspaceSlug]
  );

  const fetchRequirement = useCallback(
    async (requirementId: string) => {
      if (!workspaceSlug || !productId) return undefined;
      setIsDetailLoading(true);
      try {
        return await requirementService.getUserRequirement(workspaceSlug, productId, requirementId);
      } finally {
        setIsDetailLoading(false);
      }
    },
    [productId, workspaceSlug]
  );

  const fetchParentOptions = useCallback(
    async (search?: string, exclude?: string) => {
      if (!workspaceSlug || !productId) return [];
      return requirementService.getParentOptions(workspaceSlug, productId, search, exclude);
    },
    [productId, workspaceSlug]
  );

  const createRequirement = useCallback(
    async (data: TUserRequirementPayload) => {
      if (!workspaceSlug || !productId) throw new Error("缺少产品参数");
      setIsMutating(true);
      try {
        const response = await requirementService.createUserRequirement(workspaceSlug, productId, data);
        setRequirements((current) => [response, ...current.filter((item) => item.id !== response.id)]);
        setTotalCount((count) => count + 1);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [productId, workspaceSlug]
  );

  const updateRequirement = useCallback(
    async (requirementId: string, data: Partial<TUserRequirementPayload>) => {
      if (!workspaceSlug || !productId) throw new Error("缺少产品参数");
      setIsMutating(true);
      try {
        const response = await requirementService.updateUserRequirement(workspaceSlug, productId, requirementId, data);
        setRequirements((current) => current.map((item) => (item.id === response.id ? response : item)));
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [productId, workspaceSlug]
  );

  const deleteRequirement = useCallback(
    async (requirementId: string) => {
      if (!workspaceSlug || !productId) throw new Error("缺少产品参数");
      setIsMutating(true);
      try {
        await requirementService.deleteUserRequirement(workspaceSlug, productId, requirementId);
        setRequirements((current) => current.filter((item) => item.id !== requirementId));
      } finally {
        setIsMutating(false);
      }
    },
    [productId, workspaceSlug]
  );

  return useMemo(
    () => ({
      requirements,
      totalCount,
      isLoading,
      isDetailLoading,
      isMutating,
      error,
      fetchRequirements,
      fetchRequirement,
      fetchParentOptions,
      createRequirement,
      updateRequirement,
      deleteRequirement,
    }),
    [
      createRequirement,
      deleteRequirement,
      error,
      fetchParentOptions,
      fetchRequirement,
      fetchRequirements,
      isDetailLoading,
      isLoading,
      isMutating,
      requirements,
      totalCount,
      updateRequirement,
    ]
  );
};

export type TRequirementSubmit = (data: TUserRequirementPayload) => Promise<TUserRequirementDetail>;
