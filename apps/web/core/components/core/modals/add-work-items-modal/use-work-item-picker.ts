/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TProjectIssuesSearchParams, TWorkItemPickerOrderBy, TWorkItemPickerRow } from "@plane/types";
import useDebounce from "@/hooks/use-debounce";
import { ProjectService } from "@/services/project";

export type TWorkItemPickerKind = "cycle" | "release" | "module";

export type TPickerFilterKey = "typeIds" | "stateGroups" | "priorities" | "assigneeIds";

export type TPickerFilters = Record<TPickerFilterKey, string[]>;

export type TPickerSort = { orderBy: TWorkItemPickerOrderBy; order: "asc" | "desc" };

export const PICKER_PAGE_SIZE = 50;
/** 「选择全部符合条件的」按这个批量拉，接口上限 1000 */
const SELECT_ALL_BATCH = 500;

const EMPTY_FILTERS: TPickerFilters = { typeIds: [], stateGroups: [], priorities: [], assigneeIds: [] };

const projectService = new ProjectService();

/** 某行是否已在别的迭代 / 发布里（迭代加入即移动，发布加入后同时属于多个） */
export const isInOtherContainer = (kind: TWorkItemPickerKind, row: TWorkItemPickerRow) =>
  kind === "cycle" ? !!row.cycle : kind === "release" ? row.releases.length > 0 : false;

type TArgs = {
  workspaceSlug: string;
  projectId: string;
  kind: TWorkItemPickerKind;
  targetId: string;
};

/**
 * 「添加工作项」弹窗的数据：查询条件 → 分页拉取（带总数）→ 跨页、跨筛选保留的选择。
 * 弹窗关掉时整棵内容卸载，状态自然清空。
 */
export const useWorkItemPicker = ({ workspaceSlug, projectId, kind, targetId }: TArgs) => {
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<TPickerFilters>(EMPTY_FILTERS);
  const [mine, setMine] = useState(false);
  const [includeOther, setIncludeOther] = useState(false);
  const [sort, setSort] = useState<TPickerSort>({ orderBy: "priority", order: "desc" });
  /** 页码记在「哪组条件」下，条件一变自动回到第 1 页，不用再多发一次请求 */
  const [pageState, setPageState] = useState({ key: "", page: 1 });

  const [rows, setRows] = useState<TWorkItemPickerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const [selected, setSelected] = useState<Map<string, TWorkItemPickerRow>>(() => new Map());
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  /** 「选择全部 N 条」是在哪组条件下点的；条件一变横幅就回到「本页」状态 */
  const [allMatchingKey, setAllMatchingKey] = useState<string | null>(null);

  const debouncedSearch: string = useDebounce(search.trim(), 400);
  const requestSeq = useRef(0);
  /** 「选择全部 N 条」的批次号：用户手动移除 / 清空时作废进行中的那一轮，免得结果回填 */
  const bulkSeq = useRef(0);

  const baseParams = useMemo((): TProjectIssuesSearchParams => {
    const csv = (values: string[]) => (values.length ? values.join(",") : undefined);
    return {
      search: debouncedSearch,
      workspace_search: false,
      my_work_items: mine,
      type_ids: csv(filters.typeIds),
      state_groups: csv(filters.stateGroups),
      priorities: csv(filters.priorities),
      assignee_ids: csv(filters.assigneeIds),
      order_by: sort.orderBy,
      order: sort.order,
      ...(kind === "cycle" && { cycle: true, cycle_id: targetId, include_other_cycles: includeOther }),
      ...(kind === "release" && { release: true, release_id: targetId, include_other_releases: includeOther }),
      ...(kind === "module" && { module: targetId }),
    };
  }, [debouncedSearch, filters, includeOther, kind, mine, sort, targetId]);
  const queryKey = useMemo(() => JSON.stringify(baseParams), [baseParams]);
  const page = pageState.key === queryKey ? pageState.page : 1;
  const setPage = useCallback((next: number) => setPageState({ key: queryKey, page: next }), [queryKey]);

  useEffect(() => {
    const seq = ++requestSeq.current;
    setIsLoading(true);
    setHasError(false);
    projectService
      .workItemPickerSearch(workspaceSlug, projectId, {
        ...baseParams,
        limit: PICKER_PAGE_SIZE,
        offset: (page - 1) * PICKER_PAGE_SIZE,
      })
      .then((response) => {
        if (seq !== requestSeq.current) return;
        setRows(response.results);
        setTotal(response.total_count);
      })
      .catch(() => {
        if (seq !== requestSeq.current) return;
        setRows([]);
        setTotal(0);
        setHasError(true);
      })
      .finally(() => {
        if (seq === requestSeq.current) setIsLoading(false);
      });
  }, [baseParams, page, projectId, workspaceSlug]);

  // ---------- 选择 ----------
  const isSelected = useCallback((id: string) => selected.has(id), [selected]);

  /** 有移除动作时：作废进行中的全选，「已选中全部 N 条」也不再成立 */
  const invalidateAllMatching = useCallback(() => {
    bulkSeq.current += 1;
    setIsSelectingAll(false);
    setAllMatchingKey(null);
  }, []);

  const toggleRow = useCallback(
    (row: TWorkItemPickerRow) => {
      const removing = selected.has(row.id);
      if (removing) invalidateAllMatching();
      setSelected((current) => {
        const next = new Map(current);
        if (removing) next.delete(row.id);
        else next.set(row.id, row);
        return next;
      });
    },
    [invalidateAllMatching, selected]
  );

  const pageSelection: "none" | "some" | "all" = useMemo(() => {
    const count = rows.filter((row) => selected.has(row.id)).length;
    if (count === 0) return "none";
    return count === rows.length ? "all" : "some";
  }, [rows, selected]);

  const togglePage = useCallback(() => {
    const removing = rows.length > 0 && rows.every((row) => selected.has(row.id));
    if (removing) invalidateAllMatching();
    setSelected((current) => {
      const next = new Map(current);
      rows.forEach((row) => (removing ? next.delete(row.id) : next.set(row.id, row)));
      return next;
    });
  }, [invalidateAllMatching, rows, selected]);

  const clearSelection = useCallback(() => {
    invalidateAllMatching();
    setSelected(new Map());
  }, [invalidateAllMatching]);

  const selectAllMatching = useCallback(async () => {
    const seq = ++bulkSeq.current;
    setIsSelectingAll(true);
    try {
      const collected: TWorkItemPickerRow[] = [];
      for (let offset = 0; offset < total; offset += SELECT_ALL_BATCH) {
        const response = await projectService.workItemPickerSearch(workspaceSlug, projectId, {
          ...baseParams,
          limit: SELECT_ALL_BATCH,
          offset,
        });
        if (seq !== bulkSeq.current) return;
        collected.push(...response.results);
        if (response.results.length < SELECT_ALL_BATCH) break;
      }
      setSelected((current) => {
        const next = new Map(current);
        collected.forEach((row) => next.set(row.id, row));
        return next;
      });
      setAllMatchingKey(queryKey);
    } catch {
      if (seq === bulkSeq.current) setHasError(true);
    } finally {
      if (seq === bulkSeq.current) setIsSelectingAll(false);
    }
  }, [baseParams, projectId, queryKey, total, workspaceSlug]);

  // ---------- 条件 ----------
  const setFilter = useCallback((key: TPickerFilterKey, value: string[]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => setFilters(EMPTY_FILTERS), []);

  const hasFilters = Object.values(filters).some((values) => values.length > 0);

  /** 点列头：同一列切换方向，换列从降序开始 */
  const toggleSortColumn = useCallback((orderBy: TWorkItemPickerOrderBy) => {
    setSort((current) =>
      current.orderBy === orderBy
        ? { orderBy, order: current.order === "desc" ? "asc" : "desc" }
        : { orderBy, order: "desc" }
    );
  }, []);

  const selectedRows = useMemo(() => Array.from(selected.values()), [selected]);
  const moveCount = useMemo(
    () => selectedRows.filter((row) => isInOtherContainer(kind, row)).length,
    [kind, selectedRows]
  );

  return {
    // 条件
    search,
    setSearch,
    debouncedSearch,
    filters,
    setFilter,
    clearFilters,
    hasFilters,
    mine,
    setMine,
    includeOther,
    setIncludeOther,
    sort,
    setSort,
    toggleSortColumn,
    page,
    setPage,
    // 数据
    rows,
    total,
    isLoading,
    hasError,
    // 选择
    selectedRows,
    selectedCount: selected.size,
    isSelected,
    toggleRow,
    pageSelection,
    togglePage,
    clearSelection,
    selectAllMatching,
    isSelectingAll,
    allMatchingSelected: allMatchingKey === queryKey,
    moveCount,
  };
};

export type TWorkItemPicker = ReturnType<typeof useWorkItemPicker>;
