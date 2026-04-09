/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TimesheetService, type TTimeSheet, type TTimeSheetCreatePayload } from "@/services/issue/timesheet.service";

const timesheetService = new TimesheetService();

export type TTimesheetRowType = "project" | "issue" | "test_case";

export type TTimesheetRow = {
  id: string;
  type: TTimesheetRowType;
  projectId: string;
  projectName?: string;
  issueId?: string;
  issueName?: string;
  issueSequenceId?: number;
  issueTypeId?: string | null;
  testCaseId?: string;
  testCaseName?: string;
  displayName: string;
};

/** 格式化为 "YYYY-MM-DD" */
export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 获取当前周的周一（ISO 周）*/
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 从 weekStart 推算 7 天的日期字符串数组 */
export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export type TUseTimesheetPageOptions = {
  workspaceSlug: string | undefined;
  memberId: string | undefined;
  /** 项目级模式：提供则使用项目级 API，不提供则使用工作区级 API */
  projectId?: string;
  projectName?: string;
};

const ROW_TYPE_ORDER: Record<TTimesheetRowType, number> = { project: 0, issue: 1, test_case: 2 };

function sortTimesheetRows(rows: TTimesheetRow[]): TTimesheetRow[] {
  const projectOrder = new Map<string, number>();
  for (const row of rows) {
    if (!projectOrder.has(row.projectId)) {
      projectOrder.set(row.projectId, projectOrder.size);
    }
  }
  return [...rows].sort((a, b) => {
    const pa = projectOrder.get(a.projectId) ?? Number.MAX_SAFE_INTEGER;
    const pb = projectOrder.get(b.projectId) ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    return ROW_TYPE_ORDER[a.type] - ROW_TYPE_ORDER[b.type];
  });
}

function buildRowsFromTimesheets(sheets: TTimeSheet[], projectName?: string): TTimesheetRow[] {
  const rowsById = new Map<string, TTimesheetRow>();

  for (const t of sheets) {
    const projectId = String(t.project);

    if (t.issue) {
      const id = `issue-${t.issue}`;
      if (!rowsById.has(id)) {
        const detail = t.issue_detail;
        rowsById.set(id, {
          id,
          type: "issue",
          projectId,
          projectName,
          issueId: t.issue,
          issueName: detail?.name ?? "",
          issueSequenceId: detail?.sequence_id ?? 0,
          issueTypeId: detail?.type_id ?? null,
          displayName: detail ? `#${detail.sequence_id} ${detail.name}` : `#${t.issue}`,
        });
      }
    } else if (t.test_case) {
      const id = `test_case-${t.test_case}`;
      if (!rowsById.has(id)) {
        const detail = t.test_case_detail;
        const name = detail?.name ?? "";
        rowsById.set(id, {
          id,
          type: "test_case",
          projectId,
          projectName,
          testCaseId: t.test_case,
          testCaseName: name,
          displayName: name,
        });
      }
    } else {
      const id = `project-${projectId}`;
      if (!rowsById.has(id)) {
        rowsById.set(id, {
          id,
          type: "project",
          projectId,
          projectName,
          displayName: projectName?.trim() ? projectName : "项目工时",
        });
      }
    }
  }

  return Array.from(rowsById.values());
}

/** 合并 API 行与当前 UI 行：优先保持已有行的顺序，避免填写工时后行跳到其它位置 */
function mergeRowsFromTimesheets(
  sheets: TTimeSheet[],
  projectName: string | undefined,
  previous: TTimesheetRow[]
): TTimesheetRow[] {
  const built = buildRowsFromTimesheets(sheets, projectName);
  const builtMap = new Map(built.map((r) => [r.id, r]));
  const seen = new Set<string>();

  if (previous.length === 0) {
    return sortTimesheetRows(built);
  }

  const ordered: TTimesheetRow[] = [];
  for (const r of previous) {
    ordered.push(builtMap.has(r.id) ? builtMap.get(r.id)! : r);
    seen.add(r.id);
  }
  for (const r of built) {
    if (!seen.has(r.id)) {
      ordered.push(r);
      seen.add(r.id);
    }
  }
  return ordered;
}

function mergeTimesheetRecords(previous: TTimeSheet[], incoming: TTimeSheet[]): TTimeSheet[] {
  if (incoming.length === 0) return previous;

  const incomingIds = new Set(incoming.map((timesheet) => timesheet.id));
  return [...incoming, ...previous.filter((timesheet) => !incomingIds.has(timesheet.id))];
}

export const useTimesheetPage = ({ workspaceSlug, memberId, projectId, projectName }: TUseTimesheetPageOptions) => {
  const [timesheets, setTimesheets] = useState<TTimeSheet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCopyingPreviousWeek, setIsCopyingPreviousWeek] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewType, setViewType] = useState<"table" | "timeline">("table");
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [rows, setRows] = useState<TTimesheetRow[]>([]);
  const fetchTimesheetsRequestId = useRef(0);
  const timesheetsRef = useRef<TTimeSheet[]>([]);

  const isProjectMode = !!projectId;

  useEffect(() => {
    timesheetsRef.current = timesheets;
  }, [timesheets]);

  useEffect(() => {
    setTimesheets([]);
    setRows([]);
  }, [projectId, weekStart]);

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 6);
    return d;
  }, [weekStart]);

  const fetchTimesheets = useCallback(async () => {
    if (!workspaceSlug) return;
    if (isProjectMode && !projectId) return;

    const reqId = ++fetchTimesheetsRequestId.current;
    setIsLoading(true);
    setError(null);
    try {
      const dateParams = {
        member_id: memberId,
        date__gte: formatDateKey(weekStart),
        date__lte: formatDateKey(weekEnd),
      };

      const data = isProjectMode
        ? await timesheetService.listByDateRange(workspaceSlug, projectId!, dateParams)
        : await timesheetService.workspaceList(workspaceSlug, dateParams);

      if (reqId !== fetchTimesheetsRequestId.current) return;
      setTimesheets(data);
      setRows((prev) => mergeRowsFromTimesheets(data, projectName, prev));
    } catch {
      if (reqId !== fetchTimesheetsRequestId.current) return;
      setError("获取工时记录失败");
    } finally {
      if (reqId === fetchTimesheetsRequestId.current) {
        setIsLoading(false);
      }
    }
  }, [workspaceSlug, projectId, isProjectMode, memberId, weekStart, weekEnd, projectName]);

  const createTimesheet = useCallback(
    async (targetProjectId: string, data: TTimeSheetCreatePayload): Promise<TTimeSheet | undefined> => {
      if (!workspaceSlug || !targetProjectId) return;
      const created = await timesheetService.create(workspaceSlug, targetProjectId, data);
      setTimesheets((prev) => mergeTimesheetRecords(prev, [created]));
      setRows((prev) => mergeRowsFromTimesheets([created], projectName, prev));
      return created;
    },
    [workspaceSlug, projectName]
  );

  const deleteTimesheet = useCallback(
    async (timesheetId: string) => {
      if (!workspaceSlug) return;
      const ts = timesheetsRef.current.find((t) => t.id === timesheetId);
      if (!ts) return;
      await timesheetService.destroy(workspaceSlug, String(ts.project), timesheetId);
      setTimesheets((prev) => prev.filter((t) => t.id !== timesheetId));
    },
    [workspaceSlug]
  );

  const copyPreviousWeek = useCallback(async () => {
    if (!workspaceSlug) return;

    setIsCopyingPreviousWeek(true);
    try {
      const payload = { week_start: formatDateKey(weekStart) };

      const result = isProjectMode
        ? await timesheetService.copyPreviousWeek(workspaceSlug, projectId!, payload)
        : await timesheetService.workspaceCopyPreviousWeek(workspaceSlug, payload);

      const copiedTimesheets = result.timesheets ?? [];
      setTimesheets((prev) => mergeTimesheetRecords(prev, copiedTimesheets));
      if (copiedTimesheets.length > 0) {
        setRows((prev) => mergeRowsFromTimesheets(copiedTimesheets, projectName, prev));
      }
      return result;
    } finally {
      setIsCopyingPreviousWeek(false);
    }
  }, [workspaceSlug, projectId, isProjectMode, weekStart, projectName]);

  const goToPrevWeek = useCallback(() => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  }, []);

  const goToNextWeek = useCallback(() => {
    setWeekStart((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  }, []);

  const goToCurrentWeek = useCallback(() => {
    setWeekStart(getWeekStart(new Date()));
  }, []);

  const addRow = useCallback((row: TTimesheetRow) => {
    setRows((prev) => {
      const exists = prev.some((r) => r.id === row.id);
      if (exists) return prev;
      return [...prev, row];
    });
  }, []);

  const removeRow = useCallback((rowId: string) => {
    setRows((prev) => prev.filter((r) => r.id !== rowId));
  }, []);

  const getTimesheetsForCell = useCallback(
    (row: TTimesheetRow, dateKey: string): TTimeSheet[] => {
      return timesheets.filter((t) => {
        if (t.date !== dateKey) return false;
        if (row.type === "issue") return t.issue === row.issueId;
        if (row.type === "test_case") return t.test_case === row.testCaseId;
        return t.project === row.projectId && !t.issue && !t.test_case;
      });
    },
    [timesheets]
  );

  const getCellHours = useCallback(
    (row: TTimesheetRow, dateKey: string): number => {
      return getTimesheetsForCell(row, dateKey).reduce((sum, t) => sum + parseFloat(t.hours || "0"), 0);
    },
    [getTimesheetsForCell]
  );

  const getDayTotalHours = useCallback(
    (dateKey: string): number => {
      return timesheets
        .filter((t) => t.date === dateKey)
        .reduce((sum, t) => sum + parseFloat(t.hours || "0"), 0);
    },
    [timesheets]
  );

  const totalWeekHours = useMemo(
    () => timesheets.reduce((sum, t) => sum + parseFloat(t.hours || "0"), 0),
    [timesheets]
  );

  return {
    timesheets,
    isLoading,
    isCopyingPreviousWeek,
    error,
    viewType,
    setViewType,
    weekStart,
    weekEnd,
    weekDays,
    rows,
    totalWeekHours,
    fetchTimesheets,
    createTimesheet,
    deleteTimesheet,
    copyPreviousWeek,
    goToPrevWeek,
    goToNextWeek,
    goToCurrentWeek,
    addRow,
    removeRow,
    getTimesheetsForCell,
    getCellHours,
    getDayTotalHours,
  };
};
