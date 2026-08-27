import { useCallback, useEffect, useState } from "react";
import type { TCreateRequirementTypePayload, TRequirementType, TUpdateRequirementTypePayload } from "@plane/types";
import { RequirementTypeService } from "@/services/requirement-type.service";

const requirementTypeService = new RequirementTypeService();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load requirement types.";
  }
  return "Unable to load requirement types.";
};

export const useRequirementTypes = (workspaceSlug: string | undefined) => {
  const [requirementTypes, setRequirementTypes] = useState<TRequirementType[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upsertRequirementType = useCallback((requirementType: TRequirementType) => {
    setRequirementTypes((current) => {
      const index = current.findIndex((item) => item.id === requirementType.id);
      if (index === -1) return [requirementType, ...current];
      return current.map((item) => (item.id === requirementType.id ? requirementType : item));
    });
  }, []);

  const fetchRequirementTypes = useCallback(async () => {
    if (!workspaceSlug) return [];
    setIsLoading(true);
    setError(null);
    try {
      const response = await requirementTypeService.listRequirementTypes(workspaceSlug);
      setRequirementTypes(response);
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void fetchRequirementTypes().catch(() => undefined);
  }, [fetchRequirementTypes]);

  const createRequirementType = useCallback(
    async (payload: TCreateRequirementTypePayload) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        const response = await requirementTypeService.createRequirementType(workspaceSlug, payload);
        upsertRequirementType(response);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [upsertRequirementType, workspaceSlug]
  );

  const updateRequirementType = useCallback(
    async (requirementTypeId: string, payload: TUpdateRequirementTypePayload) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        const response = await requirementTypeService.updateRequirementType(workspaceSlug, requirementTypeId, payload);
        upsertRequirementType(response);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [upsertRequirementType, workspaceSlug]
  );

  const deleteRequirementType = useCallback(
    async (requirementTypeId: string) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        await requirementTypeService.deleteRequirementType(workspaceSlug, requirementTypeId);
        setRequirementTypes((current) => current.filter((item) => item.id !== requirementTypeId));
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  const deleteRequirementTypes = useCallback(
    async (requirementTypeIds: string[]) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      if (requirementTypeIds.length === 0) return;
      setIsMutating(true);
      try {
        const results = await Promise.allSettled(
          requirementTypeIds.map((requirementTypeId) =>
            requirementTypeService.deleteRequirementType(workspaceSlug, requirementTypeId)
          )
        );
        const deletedIds = new Set(
          results.flatMap((result, index) => (result.status === "fulfilled" ? [requirementTypeIds[index]] : []))
        );
        setRequirementTypes((current) => current.filter((item) => !deletedIds.has(item.id)));
        const failedResult = results.find((result) => result.status === "rejected");
        if (failedResult?.status === "rejected") throw failedResult.reason;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  return {
    requirementTypes,
    isLoading,
    isMutating,
    error,
    fetchRequirementTypes,
    createRequirementType,
    updateRequirementType,
    deleteRequirementType,
    deleteRequirementTypes,
    upsertRequirementType,
  };
};
