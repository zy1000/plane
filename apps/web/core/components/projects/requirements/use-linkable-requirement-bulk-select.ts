import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TLinkableRequirementFacets, TRequirement } from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();
/** 与 linkable 列表后端 MAX_PER_PAGE 对齐，全选时尽量少打几页 */
const BULK_PAGE_SIZE = 100;

export type TBulkSelectionState = "checked" | "indeterminate" | "unchecked";

export const getBulkSelectionState = (picked: number, total: number): TBulkSelectionState => {
  if (total <= 0 || picked <= 0) return "unchecked";
  return picked >= total ? "checked" : "indeterminate";
};

const mergeById = (previous: TRequirement[], incoming: TRequirement[]) => {
  if (!incoming.length) return previous;
  const ids = new Set(previous.map((row) => row.id));
  const extras = incoming.filter((row) => !ids.has(row.id));
  return extras.length ? [...previous, ...extras] : previous;
};

const fetchAllLinkableRequirements = async (
  workspaceSlug: string,
  projectId: string,
  params: { search?: string; productId?: string } = {}
) => {
  const collected: TRequirement[] = [];
  let page = 0;
  let hasMore = true;
  while (hasMore) {
    const response = await requirementService.listLinkableRequirements(workspaceSlug, projectId, {
      search: params.search || undefined,
      productId: params.productId,
      perPage: BULK_PAGE_SIZE,
      cursor: `${BULK_PAGE_SIZE}:${page}:0`,
    });
    collected.push(...(response?.results ?? []));
    hasMore = Boolean(response?.next_page_results);
    page += 1;
    if (page > 500) break;
  }
  return collected;
};

type TArgs = {
  isOpen: boolean;
  workspaceSlug: string;
  projectId: string;
  selected: TRequirement[];
  setSelected: (updater: (previous: TRequirement[]) => TRequirement[]) => void;
  facetCounts: TLinkableRequirementFacets | null;
  productFilter: string | undefined;
  search: string;
  rows: TRequirement[];
  hasMore: boolean;
  totalCount: number;
};

/**
 * 关联需求弹窗的整组勾选：左侧按产品、中间按当前筛选。
 *
 * 候选是分页的，勾「全部」必须把剩余页拉完，不能只勾当前已渲染的那一截。
 */
export const useLinkableRequirementBulkSelect = (args: TArgs) => {
  const {
    isOpen,
    workspaceSlug,
    projectId,
    selected,
    setSelected,
    facetCounts,
    productFilter,
    search,
    rows,
    hasMore,
    totalCount,
  } = args;
  const { t } = useTranslation();
  const [isSelecting, setIsSelecting] = useState(false);
  const isOpenRef = useRef(isOpen);
  useEffect(() => {
    isOpenRef.current = isOpen;
    if (!isOpen) setIsSelecting(false);
  }, [isOpen]);

  const selectedIds = useMemo(() => new Set(selected.map((row) => row.id)), [selected]);

  const pickedCountOf = useCallback(
    (productId: string) => selected.filter((row) => row.product_id === productId).length,
    [selected]
  );

  const productState = useCallback(
    (productId: string) =>
      getBulkSelectionState(pickedCountOf(productId), facetCounts?.by_product[productId] ?? 0),
    [facetCounts, pickedCountOf]
  );

  const allProductsState = getBulkSelectionState(selected.length, facetCounts?.total ?? 0);

  const viewState = useMemo((): TBulkSelectionState => {
    if (!search) {
      if (!productFilter) return allProductsState;
      return productState(productFilter);
    }
    if (!rows.length || totalCount <= 0) return "unchecked";
    const loadedPicked = rows.filter((row) => selectedIds.has(row.id)).length;
    if (loadedPicked <= 0) return "unchecked";
    if (loadedPicked === rows.length && !hasMore) return "checked";
    return "indeterminate";
  }, [allProductsState, hasMore, productFilter, productState, rows, search, selectedIds, totalCount]);

  const runBulk = useCallback(
    async (task: () => Promise<void>) => {
      if (isSelecting) return;
      setIsSelecting(true);
      try {
        await task();
      } catch {
        if (!isOpenRef.current) return;
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("error"),
          message: t("project_requirements.linkable.load_failed"),
        });
      } finally {
        if (isOpenRef.current) setIsSelecting(false);
      }
    },
    [isSelecting, t]
  );

  const toggleProduct = useCallback(
    (productId: string) => {
      const expected = facetCounts?.by_product[productId] ?? 0;
      if (expected <= 0) return;
      if (productState(productId) === "checked") {
        setSelected((previous) => previous.filter((row) => row.product_id !== productId));
        return;
      }
      void runBulk(async () => {
        const incoming = await fetchAllLinkableRequirements(workspaceSlug, projectId, { productId });
        if (!isOpenRef.current) return;
        setSelected((previous) => mergeById(previous, incoming));
      });
    },
    [facetCounts, productState, projectId, runBulk, setSelected, workspaceSlug]
  );

  const toggleAllProducts = useCallback(() => {
    const expected = facetCounts?.total ?? 0;
    if (expected <= 0) return;
    if (allProductsState === "checked") {
      setSelected(() => []);
      return;
    }
    void runBulk(async () => {
      const incoming = await fetchAllLinkableRequirements(workspaceSlug, projectId);
      if (!isOpenRef.current) return;
      setSelected((previous) => mergeById(previous, incoming));
    });
  }, [allProductsState, facetCounts, projectId, runBulk, setSelected, workspaceSlug]);

  const toggleCurrentView = useCallback(() => {
    if (totalCount <= 0) return;
    if (!search) {
      if (productFilter) toggleProduct(productFilter);
      else toggleAllProducts();
      return;
    }
    if (viewState === "checked") {
      if (!hasMore) {
        const loadedIds = new Set(rows.map((row) => row.id));
        setSelected((previous) => previous.filter((row) => !loadedIds.has(row.id)));
        return;
      }
      void runBulk(async () => {
        const incoming = await fetchAllLinkableRequirements(workspaceSlug, projectId, {
          search,
          productId: productFilter,
        });
        if (!isOpenRef.current) return;
        const removeIds = new Set(incoming.map((row) => row.id));
        setSelected((previous) => previous.filter((row) => !removeIds.has(row.id)));
      });
      return;
    }
    void runBulk(async () => {
      const incoming = await fetchAllLinkableRequirements(workspaceSlug, projectId, {
        search,
        productId: productFilter,
      });
      if (!isOpenRef.current) return;
      setSelected((previous) => mergeById(previous, incoming));
    });
  }, [
    hasMore,
    productFilter,
    projectId,
    rows,
    runBulk,
    search,
    setSelected,
    toggleAllProducts,
    toggleProduct,
    totalCount,
    viewState,
    workspaceSlug,
  ]);

  return {
    isSelecting,
    productState,
    allProductsState,
    viewState,
    toggleProduct,
    toggleAllProducts,
    toggleCurrentView,
  };
};
