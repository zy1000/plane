import { useCallback, useEffect, useState } from "react";
import type {
  TRequirementDetailBatchSavePayload,
  TRequirementDetailData,
  TRequirementDetailFilter,
  TRequirementDetailsResponse,
  TRequirementLibraryConfiguration,
} from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load the requirement library.";
  }
  return "Unable to load the requirement library.";
};

const EMPTY_PAGE: TRequirementDetailsResponse = {
  results: [],
  total_count: 0,
  total_pages: 0,
  count: 0,
};

/**
 * 单个标准库的条目。
 *
 * 返回形状刻意与 useRequirementDetails 保持一致，这样条目网格与需求明细网格能共用
 * 同一个 RequirementDetailGrid，不需要为标准库做任何分支。
 */
export const useLibraryItems = ({
  workspaceSlug,
  libraryId,
}: {
  workspaceSlug: string | undefined;
  libraryId: string | undefined;
}) => {
  const [configuration, setConfiguration] = useState<TRequirementLibraryConfiguration | null>(null);
  const [detailsPage, setDetailsPage] = useState<TRequirementDetailsResponse>(EMPTY_PAGE);
  const [isConfigurationLoading, setIsConfigurationLoading] = useState(Boolean(workspaceSlug && libraryId));
  const [isDetailsLoading, setIsDetailsLoading] = useState(Boolean(workspaceSlug && libraryId));
  const [isMutating, setIsMutating] = useState(false);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<TRequirementDetailFilter[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [perPage, setPerPage] = useState(20);

  const fetchConfiguration = useCallback(async () => {
    if (!workspaceSlug || !libraryId) return null;
    setIsConfigurationLoading(true);
    setConfigurationError(null);
    try {
      const response = await requirementService.getLibraryConfiguration(workspaceSlug, libraryId);
      setConfiguration(response);
      return response;
    } catch (requestError) {
      setConfigurationError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsConfigurationLoading(false);
    }
  }, [libraryId, workspaceSlug]);

  const fetchDetails = useCallback(async () => {
    if (!workspaceSlug || !libraryId) return EMPTY_PAGE;
    setIsDetailsLoading(true);
    setDetailsError(null);
    try {
      const response = await requirementService.listLibraryItems(workspaceSlug, libraryId, {
        cursor,
        perPage,
        search,
        filters,
      });
      setDetailsPage(response);
      return response;
    } catch (requestError) {
      setDetailsError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsDetailsLoading(false);
    }
  }, [cursor, filters, libraryId, perPage, search, workspaceSlug]);

  useEffect(() => {
    setConfiguration(null);
    setDetailsPage(EMPTY_PAGE);
    setCursor(undefined);
    void fetchConfiguration().catch(() => undefined);
  }, [fetchConfiguration]);

  useEffect(() => {
    void fetchDetails().catch(() => undefined);
  }, [fetchDetails]);

  const createDetail = useCallback(
    async (data: TRequirementDetailData, position: { before_id?: string; after_id?: string } = {}) => {
      if (!workspaceSlug || !libraryId) throw new Error("Library is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.createLibraryItem(workspaceSlug, libraryId, {
          data,
          ...position,
        });
        await fetchDetails();
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchDetails, libraryId, workspaceSlug]
  );

  const updateDetail = useCallback(
    async (itemId: string, data: TRequirementDetailData, version: number) => {
      if (!workspaceSlug || !libraryId) throw new Error("Library is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.updateLibraryItem(workspaceSlug, libraryId, itemId, {
          data,
          version,
        });
        setDetailsPage((current) => ({
          ...current,
          results: current.results.map((item) => (item.id === response.id ? response : item)),
        }));
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [libraryId, workspaceSlug]
  );

  const deleteDetails = useCallback(
    async (itemIds: string[]) => {
      if (!workspaceSlug || !libraryId) throw new Error("Library is required.");
      if (!itemIds.length) return;
      setIsMutating(true);
      try {
        if (itemIds.length === 1) {
          await requirementService.deleteLibraryItem(workspaceSlug, libraryId, itemIds[0]);
        } else {
          await requirementService.bulkDeleteLibraryItems(workspaceSlug, libraryId, itemIds);
        }
        await fetchDetails();
      } finally {
        setIsMutating(false);
      }
    },
    [fetchDetails, libraryId, workspaceSlug]
  );

  const saveDetailBatch = useCallback(
    async (payload: TRequirementDetailBatchSavePayload) => {
      if (!workspaceSlug || !libraryId) throw new Error("Library is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.bulkSaveLibraryItems(workspaceSlug, libraryId, payload);
        await fetchDetails();
        // 条目数变了，库信息里的 item_count 要跟着更新
        await fetchConfiguration().catch(() => undefined);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchConfiguration, fetchDetails, libraryId, workspaceSlug]
  );

  const updateSearch = useCallback((value: string) => {
    setCursor(undefined);
    setSearch(value);
  }, []);
  const updateFilters = useCallback((value: TRequirementDetailFilter[]) => {
    setCursor(undefined);
    setFilters(value);
  }, []);
  const updatePerPage = useCallback((value: number) => {
    setCursor(undefined);
    setPerPage(value);
  }, []);

  return {
    configuration,
    library: configuration?.library ?? null,
    /** 库固定一个模板 —— 网格建行时用它绑定 */
    requirementTypeId: configuration?.library.requirement_type_id ?? null,
    detailsPage,
    isConfigurationLoading,
    isDetailsLoading,
    isMutating,
    configurationError,
    detailsError,
    search,
    filters,
    cursor,
    perPage,
    setSearch: updateSearch,
    setFilters: updateFilters,
    setCursor,
    setPerPage: updatePerPage,
    fetchConfiguration,
    fetchDetails,
    createDetail,
    updateDetail,
    deleteDetails,
    saveDetailBatch,
  };
};
