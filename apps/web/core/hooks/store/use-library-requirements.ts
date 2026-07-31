import { useCallback, useEffect, useState } from "react";
import type { TCreateStandardRequirementPayload, TRequirement, TRequirementLibrary } from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load standard requirements.";
  }
  return "Unable to load standard requirements.";
};

/**
 * 单个标准库内的标准需求。
 *
 * 库本身也在这里取：详情页可能被直接打开（刷新 / 分享链接），此时列表 store 里
 * 还没有这条库记录，不能只依赖上层缓存。
 */
export const useLibraryRequirements = (workspaceSlug: string | undefined, libraryId: string | undefined) => {
  const [library, setLibrary] = useState<TRequirementLibrary | null>(null);
  const [requirements, setRequirements] = useState<TRequirement[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && libraryId));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLibraryRequirements = useCallback(async () => {
    if (!workspaceSlug || !libraryId) return [];
    setIsLoading(true);
    setError(null);
    try {
      const [libraryResponse, requirementsResponse] = await Promise.all([
        requirementService.getLibrary(workspaceSlug, libraryId),
        requirementService.listLibraryRequirements(workspaceSlug, libraryId),
      ]);
      setLibrary(libraryResponse);
      setRequirements(requirementsResponse);
      return requirementsResponse;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [libraryId, workspaceSlug]);

  useEffect(() => {
    void fetchLibraryRequirements().catch(() => undefined);
  }, [fetchLibraryRequirements]);

  const createRequirement = useCallback(
    async (payload: Omit<TCreateStandardRequirementPayload, "library_id">) => {
      if (!workspaceSlug || !libraryId) throw new Error("Library is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.createStandardRequirement(workspaceSlug, {
          ...payload,
          library_id: libraryId,
        });
        setRequirements((current) => [response, ...current]);
        setLibrary((current) =>
          current ? { ...current, requirement_count: current.requirement_count + 1 } : current
        );
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [libraryId, workspaceSlug]
  );

  const deleteRequirement = useCallback(
    async (requirementId: string) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        await requirementService.deleteProductRequirement(workspaceSlug, requirementId);
        setRequirements((current) => current.filter((item) => item.id !== requirementId));
        setLibrary((current) =>
          current ? { ...current, requirement_count: Math.max(0, current.requirement_count - 1) } : current
        );
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  /**
   * 批量删除。后端没有批量接口，这里并发调单个删除。
   * 用 allSettled 而不是 all：部分失败时已成功的那些也要从本地列表里摘掉，
   * requirement_count 也只按实际成功数扣减，再把第一个失败抛出去。
   */
  const deleteRequirements = useCallback(
    async (requirementIds: string[]) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      if (requirementIds.length === 0) return;
      setIsMutating(true);
      try {
        const results = await Promise.allSettled(
          requirementIds.map((requirementId) =>
            requirementService.deleteProductRequirement(workspaceSlug, requirementId)
          )
        );
        const deletedRequirementIds = new Set(
          results.flatMap((result, index) => (result.status === "fulfilled" ? [requirementIds[index]] : []))
        );
        setRequirements((current) => current.filter((item) => !deletedRequirementIds.has(item.id)));
        setLibrary((current) =>
          current
            ? { ...current, requirement_count: Math.max(0, current.requirement_count - deletedRequirementIds.size) }
            : current
        );
        const failedResult = results.find((result) => result.status === "rejected");
        if (failedResult?.status === "rejected") throw failedResult.reason;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  return {
    library,
    requirements,
    isLoading,
    isMutating,
    error,
    fetchLibraryRequirements,
    createRequirement,
    deleteRequirement,
    deleteRequirements,
  };
};
