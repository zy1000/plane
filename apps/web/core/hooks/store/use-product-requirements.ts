import { useCallback, useEffect, useState } from "react";
import type {
  TRequirementBaseline,
  TRequirementBaselineConfiguration,
  TRequirementBaselineConfigurationPayload,
  TRequirementBatchSavePayload,
  TRequirementData,
  TRequirementFilter,
  TRequirementImportPayload,
  TRequirementsResponse,
  TRequirementTypeSchema,
} from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load product requirements.";
  }
  return "Unable to load product requirements.";
};

const EMPTY_PAGE: TRequirementsResponse = {
  results: [],
  total_count: 0,
  total_pages: 0,
  count: 0,
};

/** 稳定引用，避免每次渲染都产生新数组把下游 memo 打穿 */
const EMPTY_REQUIREMENT_TYPES: TRequirementTypeSchema[] = [];

/**
 * 一个产品的需求：基线（审批配置 / 状态 / 版本）+ 游标分页的需求条目。
 *
 * 基线由后端惰性创建，所以这里没有「创建基线」这一步 —— 打开页面就一定拿得到一份。
 */
export const useProductRequirements = ({
  workspaceSlug,
  productId,
  onBaselineUpdate,
}: {
  workspaceSlug: string | undefined;
  productId: string | undefined;
  onBaselineUpdate?: (baseline: TRequirementBaseline) => void;
}) => {
  const [configuration, setConfiguration] = useState<TRequirementBaselineConfiguration | null>(null);
  const [requirementsPage, setRequirementsPage] = useState<TRequirementsResponse>(EMPTY_PAGE);
  const [isConfigurationLoading, setIsConfigurationLoading] = useState(Boolean(workspaceSlug && productId));
  const [isRequirementsLoading, setIsRequirementsLoading] = useState(Boolean(workspaceSlug && productId));
  const [isMutating, setIsMutating] = useState(false);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [requirementsError, setRequirementsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<TRequirementFilter[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [perPage, setPerPage] = useState(20);
  /** 当前需求类型视图；undefined = 不按类型过滤（默认视图 / 单类型） */
  const [requirementTypeFilter, setRequirementTypeFilter] = useState<string | undefined>();

  const fetchConfiguration = useCallback(async () => {
    if (!workspaceSlug || !productId) return null;
    setIsConfigurationLoading(true);
    setConfigurationError(null);
    try {
      const response = await requirementService.getBaseline(workspaceSlug, productId);
      setConfiguration(response);
      onBaselineUpdate?.(response.baseline);
      return response;
    } catch (requestError) {
      setConfigurationError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsConfigurationLoading(false);
    }
  }, [onBaselineUpdate, productId, workspaceSlug]);

  const fetchRequirements = useCallback(async () => {
    if (!workspaceSlug || !productId) return EMPTY_PAGE;
    setIsRequirementsLoading(true);
    setRequirementsError(null);
    try {
      const response = await requirementService.listRequirements(workspaceSlug, productId, {
        cursor,
        perPage,
        search,
        filters,
        requirementTypeId: requirementTypeFilter,
      });
      setRequirementsPage(response);
      return response;
    } catch (requestError) {
      setRequirementsError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsRequirementsLoading(false);
    }
  }, [cursor, filters, perPage, search, requirementTypeFilter, productId, workspaceSlug]);

  useEffect(() => {
    setConfiguration(null);
    setRequirementsPage(EMPTY_PAGE);
    setCursor(undefined);
    void fetchConfiguration().catch(() => undefined);
  }, [fetchConfiguration]);

  useEffect(() => {
    void fetchRequirements().catch(() => undefined);
  }, [fetchRequirements]);

  const updateConfiguration = useCallback(
    async (payload: TRequirementBaselineConfigurationPayload) => {
      if (!workspaceSlug || !productId) throw new Error("Product is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.updateBaseline(workspaceSlug, productId, payload);
        setConfiguration(response);
        onBaselineUpdate?.(response.baseline);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [onBaselineUpdate, productId, workspaceSlug]
  );

  const createRequirement = useCallback(
    async (
      data: TRequirementData,
      requirementTypeId: string,
      position: { before_id?: string; after_id?: string } = {}
    ) => {
      if (!workspaceSlug || !productId) throw new Error("Product is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.createRequirement(workspaceSlug, productId, {
          data,
          requirement_type_id: requirementTypeId,
          ...position,
        });
        await fetchRequirements();
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchRequirements, productId, workspaceSlug]
  );

  /**
   * 从一个或多个标准库导入。
   *
   * 导入弹窗允许跨库勾选，而接口一次只收一个 library_id，所以这里按库分组顺序调用，
   * 最后只刷新一次。返回各批次的响应，调用方用第一批的类型 ID 决定切到哪个视图。
   */
  const importFromLibraries = useCallback(
    async (payloads: TRequirementImportPayload[]) => {
      if (!workspaceSlug || !productId) throw new Error("Product is required.");
      if (!payloads.length) return [];
      setIsMutating(true);
      try {
        const responses = [];
        for (const payload of payloads) {
          responses.push(await requirementService.importLibraryItems(workspaceSlug, productId, payload));
        }
        // 先刷配置：引用的需求类型集合可能变大了，页面要据此更新视图列表并切过去
        await fetchConfiguration();
        await fetchRequirements();
        return responses;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchConfiguration, fetchRequirements, productId, workspaceSlug]
  );

  const updateRequirement = useCallback(
    async (requirementId: string, data: TRequirementData, version: number) => {
      if (!workspaceSlug || !productId) throw new Error("Product is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.updateRequirement(workspaceSlug, productId, requirementId, {
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
    [productId, workspaceSlug]
  );

  const deleteRequirements = useCallback(
    async (requirementIds: string[]) => {
      if (!workspaceSlug || !productId) throw new Error("Product is required.");
      if (!requirementIds.length) return;
      setIsMutating(true);
      try {
        if (requirementIds.length === 1) {
          await requirementService.deleteRequirement(workspaceSlug, productId, requirementIds[0]);
        } else {
          await requirementService.bulkDeleteRequirements(workspaceSlug, productId, requirementIds);
        }
        await fetchRequirements();
      } finally {
        setIsMutating(false);
      }
    },
    [fetchRequirements, productId, workspaceSlug]
  );

  const saveRequirementBatch = useCallback(
    async (payload: TRequirementBatchSavePayload) => {
      if (!workspaceSlug || !productId) throw new Error("Product is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.bulkSaveRequirements(workspaceSlug, productId, payload);
        await fetchRequirements();
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchRequirements, productId, workspaceSlug]
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
  /** 切类型视图。搜索与筛选一并清空 —— 筛选条件是按字段 ID 定的，换个类型就没有意义了 */
  const updateRequirementTypeFilter = useCallback((value: string | undefined) => {
    setCursor(undefined);
    setSearch("");
    setFilters([]);
    setRequirementTypeFilter(value);
  }, []);

  return {
    configuration,
    baseline: configuration?.baseline ?? null,
    requirementTypes: configuration?.requirement_types ?? EMPTY_REQUIREMENT_TYPES,
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
    requirementTypeFilter,
    setSearch: updateSearch,
    setFilters: updateFilters,
    setCursor,
    setPerPage: updatePerPage,
    setRequirementTypeFilter: updateRequirementTypeFilter,
    fetchConfiguration,
    fetchRequirements,
    updateConfiguration,
    createRequirement,
    updateRequirement,
    deleteRequirements,
    saveRequirementBatch,
    importFromLibraries,
  };
};
