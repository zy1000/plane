import { useCallback, useEffect, useState } from "react";
import type {
  TRequirement,
  TRequirementBatchSavePayload,
  TRequirementData,
  TRequirementFilter,
  TRequirementsResponse,
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

const EMPTY_PAGE: TRequirementsResponse = {
  results: [],
  total_count: 0,
  total_pages: 0,
  count: 0,
};

/**
 * 单个标准库的条目。
 *
 * 返回形状刻意与 useProductRequirements 保持一致，这样标准库与产品需求能共用
 * 同一个 RequirementGrid，不需要为标准库做任何分支。
 */
export const useLibraryItems = ({
  workspaceSlug,
  libraryId,
}: {
  workspaceSlug: string | undefined;
  libraryId: string | undefined;
}) => {
  const [configuration, setConfiguration] = useState<TRequirementLibraryConfiguration | null>(null);
  const [requirementsPage, setRequirementsPage] = useState<TRequirementsResponse>(EMPTY_PAGE);
  const [isConfigurationLoading, setIsConfigurationLoading] = useState(Boolean(workspaceSlug && libraryId));
  const [isRequirementsLoading, setIsRequirementsLoading] = useState(Boolean(workspaceSlug && libraryId));
  const [isMutating, setIsMutating] = useState(false);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [requirementsError, setRequirementsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<TRequirementFilter[]>([]);
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

  const fetchRequirements = useCallback(async () => {
    if (!workspaceSlug || !libraryId) return EMPTY_PAGE;
    setIsRequirementsLoading(true);
    setRequirementsError(null);
    try {
      const response = await requirementService.listLibraryItems(workspaceSlug, libraryId, {
        cursor,
        perPage,
        search,
        filters,
      });
      setRequirementsPage(response);
      return response;
    } catch (requestError) {
      setRequirementsError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsRequirementsLoading(false);
    }
  }, [cursor, filters, libraryId, perPage, search, workspaceSlug]);

  useEffect(() => {
    setConfiguration(null);
    setRequirementsPage(EMPTY_PAGE);
    setCursor(undefined);
    void fetchConfiguration().catch(() => undefined);
  }, [fetchConfiguration]);

  useEffect(() => {
    void fetchRequirements().catch(() => undefined);
  }, [fetchRequirements]);

  const createRequirement = useCallback(
    async (data: TRequirementData, position: { before_id?: string; after_id?: string } = {}) => {
      if (!workspaceSlug || !libraryId) throw new Error("Library is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.createLibraryItem(workspaceSlug, libraryId, {
          data,
          ...position,
        });
        await fetchRequirements();
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchRequirements, libraryId, workspaceSlug]
  );

  /**
   * 把服务端返回的整行合并回当前页，不重拉列表。
   * 详情抽屉改完走这条，避免骨架屏顶掉表格。
   */
  const syncRequirements = useCallback((rows: TRequirement[]) => {
    if (!rows.length) return;
    const byId = new Map(rows.map((row) => [row.id, row]));
    setRequirementsPage((current) => ({
      ...current,
      results: current.results.map((item) => byId.get(item.id) ?? item),
    }));
  }, []);

  const updateRequirement = useCallback(
    async (itemId: string, data: TRequirementData, version: number) => {
      if (!workspaceSlug || !libraryId) throw new Error("Library is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.updateLibraryItem(workspaceSlug, libraryId, itemId, {
          data,
          version,
        });
        setRequirementsPage((current) => ({
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

  const deleteRequirements = useCallback(
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
        await fetchRequirements();
      } finally {
        setIsMutating(false);
      }
    },
    [fetchRequirements, libraryId, workspaceSlug]
  );

  const saveRequirementBatch = useCallback(
    async (payload: TRequirementBatchSavePayload) => {
      if (!workspaceSlug || !libraryId) throw new Error("Library is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.bulkSaveLibraryItems(workspaceSlug, libraryId, payload);
        /*
         * 与 use-product-requirements 的 saveRequirementBatch 同理：网格是「改一格存一格」，
         * 纯更新只回填这几行，重拉会让骨架屏顶掉表格、横向滚动跳回最左。
         * 只有新增/删除才改变本页构成与 item_count，那时候才重拉并刷新库信息。
         */
        if (payload.creates.length || payload.deletes.length) {
          await fetchRequirements();
          // 条目数变了，库信息里的 item_count 要跟着更新
          await fetchConfiguration().catch(() => undefined);
        } else if (response.updated.length) {
          const updatedById = new Map(response.updated.map((item) => [item.id, item]));
          setRequirementsPage((current) => ({
            ...current,
            results: current.results.map((item) => updatedById.get(item.id) ?? item),
          }));
        }
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchConfiguration, fetchRequirements, libraryId, workspaceSlug]
  );

  const updateSearch = useCallback((value: string) => {
    setCursor(undefined);
    setSearch(value);
  }, []);
  const updateFilters = useCallback((value: TRequirementFilter[]) => {
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
    /** 库固定一个需求类型 —— 网格建行时用它绑定 */
    requirementTypeId: configuration?.library.requirement_type_id ?? null,
    requirementsPage,
    isConfigurationLoading,
    isRequirementsLoading,
    isMutating,
    configurationError,
    requirementsError,
    search,
    filters,
    cursor,
    perPage,
    setSearch: updateSearch,
    setFilters: updateFilters,
    setCursor,
    setPerPage: updatePerPage,
    fetchConfiguration,
    fetchRequirements,
    createRequirement,
    updateRequirement,
    deleteRequirements,
    saveRequirementBatch,
    syncRequirements,
  };
};
