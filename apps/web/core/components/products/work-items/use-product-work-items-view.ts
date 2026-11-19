/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { TStateGroups, TWorkItemFilterExpression } from "@plane/types";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProductWorkItems } from "@/hooks/store/use-product-work-items";
import type { TProductWorkItem } from "@/types/product-work-items";
import { useProductWorkItemsFilter } from "./filters/use-product-work-items-filter";
import { useProductWorkItemsFiltersConfig } from "./filters/use-product-work-items-filters-config";
import { usePeekProjectPools } from "./use-peek-project-pools";

const DEFAULT_PER_PAGE = 20;

const serializeExpression = (expression: TWorkItemFilterExpression) =>
  expression && Object.keys(expression).length > 0 ? JSON.stringify(expression) : undefined;

/**
 * 产品工作项页的视图状态：状态组 / 搜索 / 富筛选 / 分页 → 接口参数，
 * 以及点行开详情抽屉、抽屉关上后重拉本页（抽屉里改过的状态、负责人等要回显）。
 */
export const useProductWorkItemsView = ({ workspaceSlug, productId }: { workspaceSlug: string; productId: string }) => {
  const [stateGroup, setStateGroup] = useState<TStateGroups | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);

  const { data, isLoading, hasError, mutate } = useProductWorkItems({
    workspaceSlug: workspaceSlug || undefined,
    productId: productId || undefined,
    query: { page, per_page: perPage, state_group: stateGroup ?? undefined, search: search || undefined, filters },
  });

  const configs = useProductWorkItemsFiltersConfig({ workspaceSlug, productId, facets: data?.facets });
  const filter = useProductWorkItemsFilter({
    instanceKey: `${workspaceSlug}:${productId}`,
    configs,
    onExpressionChange: (expression) => {
      setFilters(serializeExpression(expression));
      setPage(1);
    },
  });

  // 换产品时回到初始视图
  useEffect(() => {
    setStateGroup(null);
    setSearch("");
    setFilters(undefined);
    setPage(1);
  }, [workspaceSlug, productId]);

  const selectStateGroup = useCallback((group: TStateGroups | null) => {
    setStateGroup(group);
    setPage(1);
  }, []);

  const changeSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const changePerPage = useCallback((value: number) => {
    setPerPage(value);
    setPage(1);
  }, []);

  const { peekIssue, setPeekIssue } = useIssueDetail();
  const openRow = useCallback(
    (row: TProductWorkItem) => setPeekIssue({ workspaceSlug, projectId: row.project_id, issueId: row.id }),
    [setPeekIssue, workspaceSlug]
  );

  usePeekProjectPools(workspaceSlug, peekIssue?.projectId);

  const wasPeekOpen = useRef(false);
  useEffect(() => {
    const isOpen = !!peekIssue;
    if (wasPeekOpen.current && !isOpen) void mutate();
    wasPeekOpen.current = isOpen;
  }, [peekIssue, mutate]);

  return {
    data,
    isLoading,
    hasError,
    retry: () => void mutate(),
    filter,
    stateGroup,
    selectStateGroup,
    search,
    changeSearch,
    page,
    setPage,
    perPage,
    changePerPage,
    hasQuery: !!search || !!filters,
    openRow,
  };
};
