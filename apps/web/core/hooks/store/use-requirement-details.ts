import { useCallback, useEffect, useState } from "react";
import type {
  TRequirement,
  TRequirementConfiguration,
  TRequirementConfigurationPayload,
  TRequirementDetailBatchSavePayload,
  TRequirementDetailData,
  TRequirementDetailFilter,
  TRequirementDetailImportPayload,
  TRequirementDetailsResponse,
  TRequirementTypeSchema,
} from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load the requirement.";
  }
  return "Unable to load the requirement.";
};

const EMPTY_PAGE: TRequirementDetailsResponse = {
  results: [],
  total_count: 0,
  total_pages: 0,
  count: 0,
};

/** 稳定引用，避免每次渲染都产生新数组把下游 memo 打穿 */
const EMPTY_REQUIREMENT_TYPES: TRequirementTypeSchema[] = [];

export const useRequirementDetails = ({
  workspaceSlug,
  requirementId,
  onRequirementUpdate,
}: {
  workspaceSlug: string | undefined;
  requirementId: string | undefined;
  onRequirementUpdate?: (requirement: TRequirement) => void;
}) => {
  const [configuration, setConfiguration] = useState<TRequirementConfiguration | null>(null);
  const [detailsPage, setDetailsPage] = useState<TRequirementDetailsResponse>(EMPTY_PAGE);
  const [isConfigurationLoading, setIsConfigurationLoading] = useState(Boolean(workspaceSlug && requirementId));
  const [isDetailsLoading, setIsDetailsLoading] = useState(Boolean(workspaceSlug && requirementId));
  const [isMutating, setIsMutating] = useState(false);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<TRequirementDetailFilter[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [perPage, setPerPage] = useState(20);
  /** 当前需求类型视图；undefined = 不按类型过滤（默认视图 / 单类型） */
  const [requirementTypeFilter, setRequirementTypeFilter] = useState<string | undefined>();

  const fetchConfiguration = useCallback(async () => {
    if (!workspaceSlug || !requirementId) return null;
    setIsConfigurationLoading(true);
    setConfigurationError(null);
    try {
      const response = await requirementService.getConfiguration(workspaceSlug, requirementId);
      setConfiguration(response);
      onRequirementUpdate?.(response.requirement);
      return response;
    } catch (requestError) {
      setConfigurationError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsConfigurationLoading(false);
    }
  }, [onRequirementUpdate, requirementId, workspaceSlug]);

  const fetchDetails = useCallback(async () => {
    if (!workspaceSlug || !requirementId) return EMPTY_PAGE;
    setIsDetailsLoading(true);
    setDetailsError(null);
    try {
      const response = await requirementService.listDetails(workspaceSlug, requirementId, {
        cursor,
        perPage,
        search,
        filters,
        requirementTypeId: requirementTypeFilter,
      });
      setDetailsPage(response);
      return response;
    } catch (requestError) {
      setDetailsError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsDetailsLoading(false);
    }
  }, [cursor, filters, perPage, search, requirementTypeFilter, requirementId, workspaceSlug]);

  useEffect(() => {
    setConfiguration(null);
    setDetailsPage(EMPTY_PAGE);
    setCursor(undefined);
    void fetchConfiguration().catch(() => undefined);
  }, [fetchConfiguration]);

  useEffect(() => {
    void fetchDetails().catch(() => undefined);
  }, [fetchDetails]);

  const updateConfiguration = useCallback(
    async (payload: TRequirementConfigurationPayload) => {
      if (!workspaceSlug || !requirementId) throw new Error("Requirement is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.updateConfiguration(workspaceSlug, requirementId, payload);
        setConfiguration(response);
        onRequirementUpdate?.(response.requirement);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [onRequirementUpdate, requirementId, workspaceSlug]
  );

  const createDetail = useCallback(
    async (
      data: TRequirementDetailData,
      requirementTypeId: string,
      position: { before_id?: string; after_id?: string } = {}
    ) => {
      if (!workspaceSlug || !requirementId) throw new Error("Requirement is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.createDetail(workspaceSlug, requirementId, {
          data,
          requirement_type_id: requirementTypeId,
          ...position,
        });
        await fetchDetails();
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchDetails, requirementId, workspaceSlug]
  );

  /**
   * 从一个或多个标准库导入。
   *
   * 导入弹窗允许跨库勾选，而接口一次只收一个 library_id，所以这里按库分组顺序调用，
   * 最后只刷新一次。返回各批次的响应，调用方用第一批的类型 ID 决定切到哪个视图。
   */
  const importFromLibraries = useCallback(
    async (payloads: TRequirementDetailImportPayload[]) => {
      if (!workspaceSlug || !requirementId) throw new Error("Requirement is required.");
      if (!payloads.length) return [];
      setIsMutating(true);
      try {
        const responses = [];
        for (const payload of payloads) {
          responses.push(await requirementService.importLibraryItems(workspaceSlug, requirementId, payload));
        }
        // 先刷配置：引用的需求类型集合可能变大了，页面要据此更新视图列表并切过去
        await fetchConfiguration();
        await fetchDetails();
        return responses;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchConfiguration, fetchDetails, requirementId, workspaceSlug]
  );

  const updateDetail = useCallback(
    async (detailId: string, data: TRequirementDetailData, version: number) => {
      if (!workspaceSlug || !requirementId) throw new Error("Requirement is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.updateDetail(workspaceSlug, requirementId, detailId, {
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
    [requirementId, workspaceSlug]
  );

  const deleteDetails = useCallback(
    async (detailIds: string[]) => {
      if (!workspaceSlug || !requirementId) throw new Error("Requirement is required.");
      if (!detailIds.length) return;
      setIsMutating(true);
      try {
        if (detailIds.length === 1) {
          await requirementService.deleteDetail(workspaceSlug, requirementId, detailIds[0]);
        } else {
          await requirementService.bulkDeleteDetails(workspaceSlug, requirementId, detailIds);
        }
        await fetchDetails();
      } finally {
        setIsMutating(false);
      }
    },
    [fetchDetails, requirementId, workspaceSlug]
  );

  const saveDetailBatch = useCallback(
    async (payload: TRequirementDetailBatchSavePayload) => {
      if (!workspaceSlug || !requirementId) throw new Error("Requirement is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.bulkSaveDetails(workspaceSlug, requirementId, payload);
        await fetchDetails();
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchDetails, requirementId, workspaceSlug]
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
  /** 切类型视图。搜索与筛选一并清空 —— 筛选条件是按字段 ID 定的，换个类型就没有意义了 */
  const updateRequirementTypeFilter = useCallback((value: string | undefined) => {
    setCursor(undefined);
    setSearch("");
    setFilters([]);
    setRequirementTypeFilter(value);
  }, []);

  return {
    configuration,
    requirementTypes: configuration?.requirement_types ?? EMPTY_REQUIREMENT_TYPES,
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
    requirementTypeFilter,
    setSearch: updateSearch,
    setFilters: updateFilters,
    setCursor,
    setPerPage: updatePerPage,
    setRequirementTypeFilter: updateRequirementTypeFilter,
    fetchConfiguration,
    fetchDetails,
    updateConfiguration,
    createDetail,
    updateDetail,
    deleteDetails,
    saveDetailBatch,
    importFromLibraries,
  };
};

