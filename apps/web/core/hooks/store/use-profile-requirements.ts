import { useCallback, useEffect, useRef, useState } from "react";
import type {
  TProfileRequirementsResponse,
  TProjectRequirement,
  TRequirement,
  TRequirementTypeSchema,
} from "@plane/types";
import type { TProjectRequirementListQuery } from "@/components/projects/requirements/filters";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load requirements.";
  }
  return "Unable to load requirements.";
};

const EMPTY_PAGE: TProfileRequirementsResponse = {
  results: [],
  total_count: 0,
  total_pages: 0,
  count: 0,
  extra_stats: null,
};

/** 稳定引用，避免每次渲染都产生新数组把下游 memo 打穿 */
const EMPTY_REQUIREMENT_TYPES: TRequirementTypeSchema[] = [];

/**
 * profile「需求」tab：某成员负责的产品需求，跨产品聚合。
 *
 * 与 use-project-requirements 同形（局部 state、游标分页、筛选先清游标），但**只读**：
 * 需求内容的写入权在产品上，这里连关联/状态都不碰。需求类型 schema 随列表的
 * extra_stats 一起回来，不另拉配置接口。
 */
export const useProfileRequirements = ({
  workspaceSlug,
  userId,
  initialListQuery,
}: {
  workspaceSlug: string | undefined;
  userId: string | undefined;
  initialListQuery?: TProjectRequirementListQuery;
}) => {
  const [requirementsPage, setRequirementsPage] = useState<TProfileRequirementsResponse>(EMPTY_PAGE);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && userId));
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState<string | undefined>();
  const [perPage, setPerPage] = useState(20);
  const [listFilters, setListFiltersState] = useState<TProjectRequirementListQuery>(initialListQuery ?? {});
  /** 产品范围；null = 全部。与筛选在服务端 AND 叠加 */
  const [productId, setProductIdState] = useState<string | null>(null);

  /** 只认最后一次发出的请求 */
  const requestSequenceRef = useRef(0);

  const fetchRequirements = useCallback(async () => {
    if (!workspaceSlug || !userId) return EMPTY_PAGE;
    const requestSequence = ++requestSequenceRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const response = await requirementService.listUserRequirements(workspaceSlug, userId, {
        cursor,
        perPage,
        search,
        requirementTypeId: listFilters.requirementTypeId,
        productId: productId ?? undefined,
        status: listFilters.status,
        title: listFilters.title,
        approvalState: listFilters.approvalState,
        priority: listFilters.priority,
        startDate: listFilters.startDate,
        startDateFrom: listFilters.startDateFrom,
        startDateTo: listFilters.startDateTo,
        targetDate: listFilters.targetDate,
        targetDateFrom: listFilters.targetDateFrom,
        targetDateTo: listFilters.targetDateTo,
      });
      if (requestSequence !== requestSequenceRef.current) return response;
      setRequirementsPage(response);
      return response;
    } catch (requestError) {
      if (requestSequence === requestSequenceRef.current) setError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      if (requestSequence === requestSequenceRef.current) setIsLoading(false);
    }
  }, [cursor, listFilters, perPage, productId, search, userId, workspaceSlug]);

  useEffect(() => {
    void fetchRequirements().catch(() => undefined);
  }, [fetchRequirements]);

  /** 抽屉里改完的行合并回当前页（只覆盖需求本体字段，保留 product_name 等列表注解） */
  const syncRequirements = useCallback((rows: TRequirement[]) => {
    if (!rows.length) return;
    const byId = new Map(rows.map((row) => [row.id, row]));
    setRequirementsPage((current) => ({
      ...current,
      results: current.results.map((item) => {
        const next = byId.get(item.id);
        return next ? ({ ...item, ...next } as TProjectRequirement) : item;
      }),
    }));
  }, []);

  // 所有会改变结果集的设置都必须先把游标清掉，否则会停在一个对新结果集无意义的页码上
  const updateSearch = useCallback((value: string) => {
    setCursor(undefined);
    setSearch(value);
  }, []);
  const updatePerPage = useCallback((value: number) => {
    setCursor(undefined);
    setPerPage(value);
  }, []);
  const setListFilters = useCallback((value: TProjectRequirementListQuery) => {
    setCursor(undefined);
    setListFiltersState(value);
  }, []);
  const setProductId = useCallback((value: string | null) => {
    setCursor(undefined);
    setProductIdState(value);
  }, []);

  return {
    requirementsPage,
    requirementTypes: requirementsPage.extra_stats?.requirement_types ?? EMPTY_REQUIREMENT_TYPES,
    isLoading,
    error,
    search,
    cursor,
    perPage,
    listFilters,
    productId,
    setSearch: updateSearch,
    setCursor,
    setPerPage: updatePerPage,
    setListFilters,
    setProductId,
    fetchRequirements,
    syncRequirements,
  };
};
