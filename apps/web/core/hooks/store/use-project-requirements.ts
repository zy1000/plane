import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  TProjectRequirement,
  TProjectRequirementCreatePayload,
  TProjectRequirementsResponse,
  TRequirementBatchSavePayload,
  TRequirementBatchSaveResponse,
  TRequirementFilter,
  TRequirementItemStatus,
  TRequirementProjectSubmitChangePayload,
  TRequirementTypeSchema,
} from "@plane/types";
import type { TProjectRequirementListQuery } from "@/components/projects/requirements/filters";
import { RequirementService, type TProjectRequirementConfiguration } from "@/services/requirement.service";

const requirementService = new RequirementService();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load project requirements.";
  }
  return "Unable to load project requirements.";
};

const EMPTY_PAGE: TProjectRequirementsResponse = {
  results: [],
  total_count: 0,
  total_pages: 0,
  count: 0,
  extra_stats: null,
};

/** 稳定引用，避免每次渲染都产生新数组把下游 memo 打穿 */
const EMPTY_REQUIREMENT_TYPES: TRequirementTypeSchema[] = [];
const EMPTY_PRODUCT_IDS: string[] = [];

/**
 * 一个项目引用的产品需求。
 *
 * 与 use-product-requirements 的形状刻意对齐（同样是局部 state hook，不进 MobX root
 * store，见 docs/domain-glossary.md 的前端接线约定），但能力少得多：
 * 项目对需求内容**没有任何写入口**，这里只有关联/解除关联，外加需求级交付状态的
 * 人工维护（updateStatus）—— 状态长在需求本体上、跨项目共享一份，项目侧改的与
 * 产品侧改的是同一个值。
 *
 * 需求类型与字段单独取一次（configuration）：网格要靠它渲染自定义列，而它只随
 * 关联关系变化，不该跟着分页与筛选一起重拉。
 */
export const useProjectRequirements = ({
  workspaceSlug,
  projectId,
  initialListQuery,
  initialModuleId,
  initialProductId,
  initialRequirementTypeId,
}: {
  workspaceSlug: string | undefined;
  projectId: string | undefined;
  initialListQuery?: TProjectRequirementListQuery;
  /** 首屏就带着 ?moduleId= / ?product= 时传进来，免得挂载后再追平初值、多打一次列表 */
  initialModuleId?: string | null;
  initialProductId?: string | null;
  /** 首屏就带着类型页签（?req_type=）时传进来，理由同上 */
  initialRequirementTypeId?: string | null;
}) => {
  const [configuration, setConfiguration] = useState<TProjectRequirementConfiguration | null>(null);
  const [requirementsPage, setRequirementsPage] = useState<TProjectRequirementsResponse>(EMPTY_PAGE);
  const [isConfigurationLoading, setIsConfigurationLoading] = useState(Boolean(workspaceSlug && projectId));
  const [isRequirementsLoading, setIsRequirementsLoading] = useState(Boolean(workspaceSlug && projectId));
  const [isMutating, setIsMutating] = useState(false);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [requirementsError, setRequirementsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<TRequirementFilter[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [perPage, setPerPage] = useState(20);
  const [listFilters, setListFiltersState] = useState<TProjectRequirementListQuery>(initialListQuery ?? {});
  /**
   * 左侧栏的浏览范围；null = 「全部」。独立于 listFilters ——
   * rich-filters 的表达式重建不感知它们，与筛选在服务端 AND 叠加。
   */
  const [moduleId, setModuleIdState] = useState<string | null>(initialModuleId ?? null);
  const [productId, setProductIdState] = useState<string | null>(initialProductId ?? null);
  /**
   * 类型页签；null = 「全部」。选中某个类型时表格换成该类型的字段视图，列表只取这一类。
   * 与筛选里的「需求类型」同一个查询参数，页签优先。
   */
  const [requirementTypeId, setRequirementTypeIdState] = useState<string | null>(initialRequirementTypeId ?? null);
  /**
   * 当前这页数据是按哪个类型取回来的。表格按它渲染而不是按页签：切类型时新数据回来前，
   * 不能拿上一个类型的行去套新类型的列。
   */
  const [loadedRequirementTypeId, setLoadedRequirementTypeId] = useState<string | null>(
    initialRequirementTypeId ?? null
  );

  const fetchConfiguration = useCallback(async () => {
    if (!workspaceSlug || !projectId) return null;
    setIsConfigurationLoading(true);
    setConfigurationError(null);
    try {
      const response = await requirementService.getProjectRequirementConfiguration(workspaceSlug, projectId);
      setConfiguration(response);
      return response;
    } catch (requestError) {
      setConfigurationError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsConfigurationLoading(false);
    }
  }, [projectId, workspaceSlug]);

  /** 只认最后一次发出的请求。切筛选很快，慢的那次响应后到会把新结果连同游标一起盖掉 */
  const requestSequenceRef = useRef(0);

  /**
   * override 用于 mutation 后立刻按新游标重拉：setCursor 之后闭包里的 cursor 仍是
   * 旧值，不显式覆盖的话这次请求会带着旧游标发出，与 effect 触发的回第一页请求
   * 交错时可能把重置结果盖掉。
   */
  const fetchRequirements = useCallback(
    async (override?: { cursor: string | undefined }) => {
      if (!workspaceSlug || !projectId) return EMPTY_PAGE;
      const requestSequence = ++requestSequenceRef.current;
      setIsRequirementsLoading(true);
      setRequirementsError(null);
      try {
        const response = await requirementService.listProjectRequirements(workspaceSlug, projectId, {
          cursor: override ? override.cursor : cursor,
          perPage,
          search,
          filters,
          requirementTypeId: requirementTypeId ?? listFilters.requirementTypeId,
          productId: productId ?? undefined,
          status: listFilters.status,
          title: listFilters.title,
          approvalState: listFilters.approvalState,
          priority: listFilters.priority,
          assigneeId: listFilters.assigneeId,
          startDate: listFilters.startDate,
          startDateFrom: listFilters.startDateFrom,
          startDateTo: listFilters.startDateTo,
          targetDate: listFilters.targetDate,
          targetDateFrom: listFilters.targetDateFrom,
          targetDateTo: listFilters.targetDateTo,
          moduleId: moduleId ?? undefined,
        });
        if (requestSequence !== requestSequenceRef.current) return response;
        setRequirementsPage(response);
        setLoadedRequirementTypeId(requirementTypeId);
        return response;
      } catch (requestError) {
        if (requestSequence === requestSequenceRef.current) {
          setRequirementsError(getErrorMessage(requestError));
        }
        throw requestError;
      } finally {
        if (requestSequence === requestSequenceRef.current) setIsRequirementsLoading(false);
      }
    },
    [cursor, filters, listFilters, moduleId, perPage, productId, projectId, requirementTypeId, search, workspaceSlug]
  );

  useEffect(() => {
    setConfiguration(null);
    setRequirementsPage(EMPTY_PAGE);
    setCursor(undefined);
    void fetchConfiguration().catch(() => undefined);
  }, [fetchConfiguration]);

  useEffect(() => {
    void fetchRequirements().catch(() => undefined);
  }, [fetchRequirements]);

  /**
   * 写成功之后的重拉。写已经落库，重拉失败不能让调用方当成写失败 —— 否则建需求弹窗会留着
   * 草稿让人再点一次保存（建出重复的一条），或者放弃时把已被新需求引用的附件删掉。
   * 失败原因两个 fetch 自己记进 configurationError / requirementsError，页面照常提示。
   */
  const refreshAfterWrite = useCallback(async () => {
    await fetchConfiguration().catch(() => undefined);
    await fetchRequirements({ cursor: undefined }).catch(() => undefined);
  }, [fetchConfiguration, fetchRequirements]);

  /**
   * 关联一批需求。
   *
   * 关联会改变本页构成，也可能引入新的需求类型（网格要多渲染几列自定义字段），
   * 所以配置与列表都要重拉 —— 与产品页的 importFromLibraries 同一个理由。
   */
  const linkRequirements = useCallback(
    async (requirementIds: string[]) => {
      if (!workspaceSlug || !projectId) throw new Error("Project is required.");
      if (!requirementIds.length) return;
      setIsMutating(true);
      try {
        const response = await requirementService.linkRequirementsToProject(workspaceSlug, projectId, {
          requirements: requirementIds,
        });
        // 结果集变了，游标必须回到第一页 —— 否则可能停在一个已经越界的页码上。
        // 显式传 cursor 覆盖闭包里的旧值；不能只靠 effect 重拉 —— 已在第一页时
        // setCursor(undefined) 是 no-op，effect 不会重发，刷新会被跳过
        setCursor(undefined);
        await refreshAfterWrite();
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [projectId, refreshAfterWrite, workspaceSlug]
  );

  /**
   * 提研发需求：建在所选产品下，产品和需求由服务端一并关联进本项目。
   * 与关联同理，配置（可能多出一个需求类型）和列表都要重拉、游标回第一页。
   */
  const createRequirement = useCallback(
    async (payload: TProjectRequirementCreatePayload) => {
      if (!workspaceSlug || !projectId) throw new Error("Project is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.createProjectRequirement(workspaceSlug, projectId, payload);
        setCursor(undefined);
        await refreshAfterWrite();
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [projectId, refreshAfterWrite, workspaceSlug]
  );

  const unlinkRequirements = useCallback(
    async (requirementIds: string[]) => {
      if (!workspaceSlug || !projectId) throw new Error("Project is required.");
      if (!requirementIds.length) return;
      setIsMutating(true);
      try {
        // 后端没有批量解除端点：解除是幂等的单行操作，串行几次比为它单开一个
        // 端点更省事，选区通常也只有几条
        for (const requirementId of requirementIds) {
          await requirementService.unlinkRequirementFromProject(workspaceSlug, projectId, requirementId);
        }
        // 同上：解除之后当前页可能已经不存在了，游标回第一页并显式覆盖重拉
        setCursor(undefined);
        await fetchConfiguration();
        await fetchRequirements({ cursor: undefined });
      } finally {
        setIsMutating(false);
      }
    },
    [fetchConfiguration, fetchRequirements, projectId, workspaceSlug]
  );

  /** 评审人与规则由提交人本次指定，随 payload 一起发 */
  const submitChange = useCallback(
    async (requirementId: string, payload: TRequirementProjectSubmitChangePayload) => {
      if (!workspaceSlug || !projectId) throw new Error("Project is required.");
      setIsMutating(true);
      try {
        const changeRequest = await requirementService.submitChangeFromProject(
          workspaceSlug,
          projectId,
          requirementId,
          payload
        );
        // 提交后这一行进入评审、变成只读，审批态要立刻反映出来
        await fetchRequirements();
        return changeRequest;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchRequirements, projectId, workspaceSlug]
  );

  /** 把服务端返回的整行合并回当前页，不重拉列表 */
  const syncRequirements = useCallback((rows: TProjectRequirement[]) => {
    if (!rows.length) return;
    const byId = new Map(rows.map((row) => [row.id, row]));
    setRequirementsPage((current) => ({
      ...current,
      results: current.results.map((item) => byId.get(item.id) ?? item),
    }));
  }, []);

  /**
   * 类型视图里改一格存一行：内容的写入权在产品上，直接打这一行所属产品的 bulk-save。
   *
   * 服务端回的是产品口径的行，没有项目侧字段（工作项数、所属产品名、关联排序等），
   * 所以按字段合并回当前页而不是整行替换，也不重拉列表 —— 重拉会让骨架屏顶掉表格。
   */
  const saveRequirementRow = useCallback(
    async (rowProductId: string, payload: TRequirementBatchSavePayload): Promise<TRequirementBatchSaveResponse> => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      const response = await requirementService.bulkSaveRequirements(workspaceSlug, rowProductId, payload);
      const updated = response?.updated ?? [];
      if (updated.length) {
        const byId = new Map(updated.map((row) => [row.id, row]));
        setRequirementsPage((current) => ({
          ...current,
          results: current.results.map((item) => {
            const saved = byId.get(item.id);
            return saved ? { ...item, ...saved } : item;
          }),
        }));
      }
      return response;
    },
    [workspaceSlug]
  );

  /**
   * 人工改需求级交付状态。
   *
   * 只改这一行 + 分面计数，不重拉列表 —— 状态变化不改变结果集构成（除非当前正按
   * 状态筛选，那种情况下重拉反而会让刚改完的行凭空消失，更难理解）。
   * 服务端返回该行的项目侧整行（与列表同口径），直接就地替换。
   *
   * by_status 必须本地纠正，否则顶部状态筛选条的数字会停在改动前。
   */
  const updateStatus = useCallback(
    async (requirementId: string, status: TRequirementItemStatus) => {
      if (!workspaceSlug || !projectId) throw new Error("Project is required.");
      const row = await requirementService.updateProjectRequirement(workspaceSlug, projectId, requirementId, {
        status,
      });
      setRequirementsPage((current) => {
        const previous = current.results.find((item) => item.id === requirementId);
        const facets = current.extra_stats;
        if (!previous || !facets || previous.status === row.status) return current;
        return {
          ...current,
          extra_stats: {
            ...facets,
            by_status: {
              ...facets.by_status,
              [previous.status]: Math.max(0, (facets.by_status[previous.status] ?? 0) - 1),
              [row.status]: (facets.by_status[row.status] ?? 0) + 1,
            },
          },
        };
      });
      syncRequirements([row]);
      return row;
    },
    [projectId, syncRequirements, workspaceSlug]
  );

  // 所有会改变结果集的设置都必须先把游标清掉，否则会停在一个对新结果集无意义的页码上
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
  const setListFilters = useCallback((value: TProjectRequirementListQuery) => {
    setCursor(undefined);
    setListFiltersState(value);
  }, []);
  const setModuleId = useCallback((value: string | null) => {
    setCursor(undefined);
    setModuleIdState(value);
  }, []);
  const setProductId = useCallback((value: string | null) => {
    setCursor(undefined);
    setProductIdState(value);
  }, []);
  const setRequirementTypeId = useCallback((value: string | null) => {
    setCursor(undefined);
    setRequirementTypeIdState(value);
  }, []);

  const editableProductIds = configuration?.editable_product_ids ?? EMPTY_PRODUCT_IDS;
  const editableProductIdSet = useMemo(() => new Set(editableProductIds), [editableProductIds]);

  return {
    configuration,
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
    listFilters,
    moduleId,
    productId,
    requirementTypeId,
    loadedRequirementTypeId,
    editableProductIds: editableProductIdSet,
    setSearch: updateSearch,
    setFilters: updateFilters,
    setCursor,
    setPerPage: updatePerPage,
    setListFilters,
    setModuleId,
    setProductId,
    setRequirementTypeId,
    fetchConfiguration,
    fetchRequirements,
    linkRequirements,
    createRequirement,
    unlinkRequirements,
    submitChange,
    updateStatus,
    syncRequirements,
    saveRequirementRow,
  };
};
