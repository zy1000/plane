import { useCallback, useEffect, useState } from "react";
import type {
  TCreateRequirementLibraryPayload,
  TRequirementLibrary,
  TUpdateRequirementLibraryPayload,
} from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load requirement libraries.";
  }
  return "Unable to load requirement libraries.";
};

export const useRequirementLibraries = (workspaceSlug: string | undefined) => {
  const [libraries, setLibraries] = useState<TRequirementLibrary[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upsertLibrary = useCallback((library: TRequirementLibrary) => {
    setLibraries((current) => {
      const index = current.findIndex((item) => item.id === library.id);
      if (index === -1) return [library, ...current];
      return current.map((item) => (item.id === library.id ? library : item));
    });
  }, []);

  const fetchLibraries = useCallback(async () => {
    if (!workspaceSlug) return [];
    setIsLoading(true);
    setError(null);
    try {
      const response = await requirementService.listLibraries(workspaceSlug);
      setLibraries(response);
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void fetchLibraries().catch(() => undefined);
  }, [fetchLibraries]);

  const createLibrary = useCallback(
    async (payload: TCreateRequirementLibraryPayload) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.createLibrary(workspaceSlug, payload);
        upsertLibrary(response);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [upsertLibrary, workspaceSlug]
  );

  const updateLibrary = useCallback(
    async (libraryId: string, payload: TUpdateRequirementLibraryPayload) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.updateLibrary(workspaceSlug, libraryId, payload);
        upsertLibrary(response);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [upsertLibrary, workspaceSlug]
  );

  const deleteLibrary = useCallback(
    async (libraryId: string) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        await requirementService.deleteLibrary(workspaceSlug, libraryId);
        setLibraries((current) => current.filter((item) => item.id !== libraryId));
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  /**
   * 批量删除。后端没有批量接口，这里并发调单个删除。
   * 用 allSettled 而不是 all：部分失败时已成功的那些也要从本地列表里摘掉，
   * 再把第一个失败抛出去让调用方提示。
   */
  const deleteLibraries = useCallback(
    async (libraryIds: string[]) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      if (libraryIds.length === 0) return;
      setIsMutating(true);
      try {
        const results = await Promise.allSettled(
          libraryIds.map((libraryId) => requirementService.deleteLibrary(workspaceSlug, libraryId))
        );
        const deletedLibraryIds = new Set(
          results.flatMap((result, index) => (result.status === "fulfilled" ? [libraryIds[index]] : []))
        );
        setLibraries((current) => current.filter((item) => !deletedLibraryIds.has(item.id)));
        const failedResult = results.find((result) => result.status === "rejected");
        if (failedResult?.status === "rejected") throw failedResult.reason;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  return {
    libraries,
    isLoading,
    isMutating,
    error,
    fetchLibraries,
    createLibrary,
    updateLibrary,
    deleteLibrary,
    deleteLibraries,
    upsertLibrary,
  };
};
