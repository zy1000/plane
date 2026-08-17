import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type {
  TRequirement,
  TRequirementApprovalPolicy,
  TRequirementConfiguration,
  TRequirementConfigurationPayload,
  TRequirementBatchSavePayload,
  TRequirementBuiltinValues,
  TRequirementData,
  TRequirementFilter,
  TRequirementImportPayload,
  TRequirementItemStatus,
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
  onPolicyUpdate,
}: {
  workspaceSlug: string | undefined;
  productId: string | undefined;
  onPolicyUpdate?: (policy: TRequirementApprovalPolicy) => void;
}) => {
  const { t } = useTranslation();
  const [configuration, setConfiguration] = useState<TRequirementConfiguration | null>(null);
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
      const response = await requirementService.getConfiguration(workspaceSlug, productId);
      setConfiguration(response);
      onPolicyUpdate?.(response.policy);
      return response;
    } catch (requestError) {
      setConfigurationError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsConfigurationLoading(false);
    }
  }, [onPolicyUpdate, productId, workspaceSlug]);

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
    async (payload: TRequirementConfigurationPayload) => {
      if (!workspaceSlug || !productId) throw new Error("Product is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.updateConfiguration(workspaceSlug, productId, payload);
        setConfiguration(response);
        onPolicyUpdate?.(response.policy);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [onPolicyUpdate, productId, workspaceSlug]
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

  /** builtin 必须整组传：后端按缺省值补齐没传的列，漏传等于把它清空 */
  const updateRequirement = useCallback(
    async (
      requirementId: string,
      payload: { data: TRequirementData; builtin: TRequirementBuiltinValues; version: number }
    ) => {
      if (!workspaceSlug || !productId) throw new Error("Product is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.updateRequirement(
          workspaceSlug,
          productId,
          requirementId,
          payload
        );
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

  /**
   * 把服务端返回的整行合并回当前页，不重拉列表。
   *
   * 更新类操作（网格改一格存一格、详情抽屉的 PATCH）返回的就是列表在用的那份序列化
   * 结果，行数与排序都不变，重拉买不到任何东西，反而会把 isRequirementsLoading 打开、
   * 让骨架屏顶掉表格 —— 骨架比表格窄得多，浏览器会顺手把横向滚动位置夹到 0 且不还原。
   * 只有新增与删除会改变本页构成，那时候才必须走 fetchRequirements。
   */
  const syncRequirements = useCallback((rows: TRequirement[]) => {
    if (!rows.length) return;
    const byId = new Map(rows.map((row) => [row.id, row]));
    setRequirementsPage((current) => ({
      ...current,
      results: current.results.map((item) => byId.get(item.id) ?? item),
    }));
  }, []);

  /**
   * 改一行的需求级交付状态（网格状态格的写入口）。
   *
   * 走独立的状态端点，与内容 PATCH / bulk_save 分开：不带 version、不 bump version、
   * 评审中也能改。响应虽是整行，但**只合并 status / can_submit_review** 进当前页 ——
   * 整行替换会与网格 autosave 在飞的内容保存交错（那边回写的 version 会被盖回旧值）。
   * 失败在这里统一 toast，调用方 void 掉即可。
   */
  const updateStatus = useCallback(
    async (requirementId: string, status: TRequirementItemStatus) => {
      if (!workspaceSlug || !productId) return null;
      try {
        const response = await requirementService.updateRequirementStatus(
          workspaceSlug,
          productId,
          requirementId,
          status
        );
        setRequirementsPage((current) => ({
          ...current,
          results: current.results.map((item) =>
            item.id === requirementId
              ? { ...item, status: response.status, can_submit_review: response.can_submit_review }
              : item
          ),
        }));
        return response;
      } catch (requestError) {
        const payload = requestError as { error?: string; detail?: string } | null;
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: payload?.error ?? payload?.detail ?? t("workspace_products.requirements.toast.failed"),
        });
        return null;
      }
    },
    [productId, t, workspaceSlug]
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
        // 网格是「改一格存一格」，纯更新一律走本地回填；见 syncRequirements
        if (payload.creates.length || payload.deletes.length) {
          await fetchRequirements();
        } else {
          syncRequirements(response.updated);
        }
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchRequirements, productId, syncRequirements, workspaceSlug]
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
    /*
     * 行也要一并清掉。列随类型走，行却是上一个类型的 —— 网格已经不再用骨架屏遮住
     * 加载中的这一帧（见 requirement-grid.tsx 的 isLoading && !requirements.length），
     * 留着旧行就会闪出「新类型的列配旧类型的行」。
     */
    setRequirementsPage(EMPTY_PAGE);
    setRequirementTypeFilter(value);
  }, []);

  return {
    configuration,
    policy: configuration?.policy ?? null,
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
    updateStatus,
    deleteRequirements,
    saveRequirementBatch,
    syncRequirements,
    importFromLibraries,
  };
};
