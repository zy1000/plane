/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TimesheetService,
  type TTimesheetReportParams,
  type TTimesheetReportRow,
} from "@/services/issue/timesheet.service";

const service = new TimesheetService();

export type TTimesheetReportFilters = {
  /** 项目 id 列表，多选；空数组或 undefined 代表不过滤。 */
  projectIds?: string[];
  /** 成员 id 列表，多选；空数组或 undefined 代表不过滤。 */
  memberIds?: string[];
  /** 类别 key 列表，多选；空数组或 undefined 代表不过滤。 */
  categoryKeys?: string[];
  startDate?: string;
  endDate?: string;
};

type TUseTimesheetReportOptions = {
  workspaceSlug: string;
  defaultPageSize?: number;
};

const triggerBrowserDownload = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

const buildParams = (
  filters: TTimesheetReportFilters,
  pageSize: number,
  page: number
): TTimesheetReportParams => {
  const params: TTimesheetReportParams = {
    per_page: pageSize,
  };
  if (filters.projectIds && filters.projectIds.length > 0) params.project_id = filters.projectIds;
  if (filters.memberIds && filters.memberIds.length > 0) params.member_id = filters.memberIds;
  if (filters.categoryKeys && filters.categoryKeys.length > 0) params.category_key = filters.categoryKeys;
  if (filters.startDate) params.start_time = filters.startDate;
  if (filters.endDate) params.end_time = filters.endDate;
  // OffsetPaginator 的 cursor 形式为 "<limit>:<pageIndex>:0"，pageIndex 从 0 开始
  if (page > 1) params.cursor = `${pageSize}:${page - 1}:0`;
  return params;
};

export const useTimesheetReport = ({
  workspaceSlug,
  defaultPageSize = 50,
}: TUseTimesheetReportOptions) => {
  const [filters, setFiltersState] = useState<TTimesheetReportFilters>({});
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(defaultPageSize);
  const [rows, setRows] = useState<TTimesheetReportRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const currentParams = useMemo(
    () => buildParams(filters, pageSize, page),
    [filters, pageSize, page]
  );

  const fetchRows = useCallback(async () => {
    if (!workspaceSlug) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await service.reportList(workspaceSlug, currentParams);
      setRows(response?.results ?? []);
      setTotal(response?.total_count ?? 0);
    } catch (err: unknown) {
      const message =
        (err as { detail?: string; message?: string } | null)?.detail ??
        (err as { message?: string } | null)?.message ??
        "加载报表失败";
      setError(message);
      setRows([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, currentParams]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const setFilters = useCallback((next: TTimesheetReportFilters) => {
    setFiltersState(next);
    setPage(1);
    setSelectedIds([]);
  }, []);

  const patchFilters = useCallback((patch: Partial<TTimesheetReportFilters>) => {
    setFiltersState((prev) => ({ ...prev, ...patch }));
    setPage(1);
    setSelectedIds([]);
  }, []);

  const resetFilters = useCallback(() => {
    setFiltersState({});
    setPage(1);
    setSelectedIds([]);
  }, []);

  const exportCurrent = useCallback(async () => {
    if (!workspaceSlug) return;
    setIsExporting(true);
    try {
      const baseParams: TTimesheetReportParams = {};
      if (filters.projectIds && filters.projectIds.length > 0) baseParams.project_id = filters.projectIds;
      if (filters.memberIds && filters.memberIds.length > 0) baseParams.member_id = filters.memberIds;
      if (filters.categoryKeys && filters.categoryKeys.length > 0) baseParams.category_key = filters.categoryKeys;
      if (filters.startDate) baseParams.start_time = filters.startDate;
      if (filters.endDate) baseParams.end_time = filters.endDate;
      const { blob, filename } = await service.reportExport(
        workspaceSlug,
        baseParams
      );
      triggerBrowserDownload(blob, filename);
    } finally {
      setIsExporting(false);
    }
  }, [workspaceSlug, filters]);

  const exportSelected = useCallback(async () => {
    if (!workspaceSlug || selectedIds.length === 0) return;
    setIsExporting(true);
    try {
      const { blob, filename } = await service.reportExport(
        workspaceSlug,
        {},
        selectedIds
      );
      triggerBrowserDownload(blob, filename);
    } finally {
      setIsExporting(false);
    }
  }, [workspaceSlug, selectedIds]);

  return {
    filters,
    setFilters,
    patchFilters,
    resetFilters,
    page,
    pageSize,
    setPage,
    setPageSize,
    rows,
    total,
    isLoading,
    error,
    selectedIds,
    setSelectedIds,
    refetch: fetchRows,
    exportCurrent,
    exportSelected,
    isExporting,
  };
};
