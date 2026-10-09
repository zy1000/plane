/**
 * 关联研发需求弹窗的数据：按产品分组、每组各自分页懒加载。
 *
 * 分组名单与组内条数来自 linkable 接口的 extra_stats.by_product —— 它跟着搜索与类型走、
 * 不随产品筛选变化，所以先用 per_page=1 打一次拿分组，展开哪组再按 product_id 拉哪组。
 * 搜索词 / 类型一变，已加载的组全部作废（组内结果跟着变了）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { TLinkableRequirementFacets, TRequirement } from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();
const PAGE_SIZE = 50;
/** 「全选」一次拉多少条：接口上限 */
const BULK_PAGE_SIZE = 100;

export type TLinkableGroupState = {
  rows: TRequirement[];
  /** 已加载到的页序号；游标形状是 "limit:page:is_prev"（utils/paginator.py 的 Cursor） */
  page: number;
  hasMore: boolean;
  isLoading: boolean;
  error: boolean;
};

type TParams = {
  isOpen: boolean;
  workspaceSlug: string;
  projectId: string;
  search: string;
  requirementTypeId: string | null;
};

export const useLinkableRequirementGroups = ({
  isOpen,
  workspaceSlug,
  projectId,
  search,
  requirementTypeId,
}: TParams) => {
  const [facets, setFacets] = useState<TLinkableRequirementFacets | null>(null);
  const [isFacetsLoading, setIsFacetsLoading] = useState(false);
  const [facetsError, setFacetsError] = useState(false);
  const [groups, setGroups] = useState<Record<string, TLinkableGroupState>>({});
  /**
   * 查询代号：搜索词 / 类型每变一次 +1。慢的那次响应可能后到，代号对不上就丢掉，
   * 免得旧搜索词的结果盖住新的。
   */
  const generationRef = useRef(0);
  const [reloadKey, setReloadKey] = useState(0);

  const baseParams = useCallback(
    () => ({
      ...(search ? { search } : {}),
      ...(requirementTypeId ? { requirementTypeId } : {}),
    }),
    [requirementTypeId, search]
  );

  useEffect(() => {
    if (!isOpen || !workspaceSlug || !projectId) return;
    const generation = ++generationRef.current;
    setGroups({});
    setFacetsError(false);
    setIsFacetsLoading(true);
    requirementService
      .listLinkableRequirements(workspaceSlug, projectId, { ...baseParams(), perPage: 1 })
      .then((response) => {
        if (generation !== generationRef.current) return;
        setFacets(response?.extra_stats ?? { by_product: {}, total: 0 });
      })
      .catch(() => {
        if (generation !== generationRef.current) return;
        setFacets(null);
        setFacetsError(true);
      })
      .finally(() => {
        if (generation === generationRef.current) setIsFacetsLoading(false);
      });
  }, [baseParams, isOpen, projectId, reloadKey, workspaceSlug]);

  const loadGroup = useCallback(
    async (productId: string, { more = false }: { more?: boolean } = {}) => {
      const generation = generationRef.current;
      const current = groups[productId];
      if (current?.isLoading) return;
      if (!more && current && !current.error) return;
      const nextPage = more && current ? current.page + 1 : 0;

      setGroups((previous) => ({
        ...previous,
        [productId]: {
          rows: more ? (previous[productId]?.rows ?? []) : [],
          page: previous[productId]?.page ?? 0,
          hasMore: previous[productId]?.hasMore ?? false,
          isLoading: true,
          error: false,
        },
      }));
      try {
        const response = await requirementService.listLinkableRequirements(workspaceSlug, projectId, {
          ...baseParams(),
          productId,
          perPage: PAGE_SIZE,
          cursor: `${PAGE_SIZE}:${nextPage}:0`,
        });
        if (generation !== generationRef.current) return;
        setGroups((previous) => ({
          ...previous,
          [productId]: {
            rows: [...(more ? (previous[productId]?.rows ?? []) : []), ...(response?.results ?? [])],
            page: nextPage,
            hasMore: Boolean(response?.next_page_results),
            isLoading: false,
            error: false,
          },
        }));
      } catch {
        if (generation !== generationRef.current) return;
        setGroups((previous) => ({
          ...previous,
          [productId]: { ...(previous[productId] as TLinkableGroupState), isLoading: false, error: true },
        }));
      }
    },
    [baseParams, groups, projectId, workspaceSlug]
  );

  /**
   * 「全选」要的是整组（或整个结果集）的行，不只是已经加载出来的那一页。
   * 组已经全部加载完就直接用，否则按页拉完。
   */
  const fetchAll = useCallback(
    async (productId?: string): Promise<TRequirement[]> => {
      const loaded = productId ? groups[productId] : undefined;
      if (loaded && !loaded.hasMore && !loaded.isLoading && !loaded.error) return loaded.rows;
      const rows: TRequirement[] = [];
      for (let page = 0; ; page += 1) {
        const response = await requirementService.listLinkableRequirements(workspaceSlug, projectId, {
          ...baseParams(),
          ...(productId ? { productId } : {}),
          perPage: BULK_PAGE_SIZE,
          cursor: `${BULK_PAGE_SIZE}:${page}:0`,
        });
        rows.push(...(response?.results ?? []));
        if (!response?.next_page_results) break;
      }
      return rows;
    },
    [baseParams, groups, projectId, workspaceSlug]
  );

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  return { facets, isFacetsLoading, facetsError, groups, loadGroup, fetchAll, reload };
};
