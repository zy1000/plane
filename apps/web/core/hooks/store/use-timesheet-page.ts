/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORY_PANEL_KIND,
  getCategoryPanelKind,
  TIMESHEET_CATEGORY_KEY,
  type TTimesheetPanelKind,
} from "@/constants/timesheet-category";
import {
  TimesheetService,
  type TTimeSheet,
  type TTimeSheetCreatePayload,
} from "@/services/issue/timesheet.service";

const timesheetService = new TimesheetService();

/**
 * 行类别的面板形态，决定该行在右侧单元格里是纯项目级、工作项级还是测试用例级。
 *
 * 历史字段名仍保留为 `project`/`issue`/`test_case`，但语义已经从「唯一类别」
 * 迁移为「面板类别」：例如「项目工时」和「送样工时」都是 `"project"` 类面板，
 * 仅通过 `categoryKey`/`categoryId` 区分。
 */
export type TTimesheetRowType = TTimesheetPanelKind;

export type TTimesheetRow = {
  id: string;
  type: TTimesheetRowType;
  projectId: string;
  projectName?: string;
  /** 类别字典 id；由后端返回、前端创建时必须透传。 */
  categoryId?: string;
  /** 类别字典 key（PROJECT/ISSUE/TEST_CASE/SAMPLE/...）。 */
  categoryKey?: string;
  /** 类别字典展示名，用于在卡片/行名旁展示。 */
  categoryName?: string;
  /** 类别字典排序值，用于同一项目内多类别行的稳定排序。 */
  categorySortOrder?: number;
  issueId?: string;
  issueName?: string;
  issueSequenceId?: number;
  issueTypeId?: string | null;
  issueTypeName?: string | null;
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

/**
 * 构造任务行的唯一 id。
 *
 * - project 面板：`project-${projectId}-${categoryKey}`，允许同一项目下出现多条
 *   不同类别的纯项目级行（例如同时存在「项目工时」和「送样工时」）。
 * - issue / test_case 面板：对象 id 已经唯一确定类别，保留旧 id 规则以减少老数据兼容问题。
 */
function makeRowId(
  panel: TTimesheetPanelKind,
  payload: { projectId: string; categoryKey?: string; issueId?: string; testCaseId?: string }
): string {
  if (panel === "issue" && payload.issueId) return `issue-${payload.issueId}`;
  if (panel === "test_case" && payload.testCaseId) return `test_case-${payload.testCaseId}`;
  const key = payload.categoryKey || TIMESHEET_CATEGORY_KEY.PROJECT;
  return `project-${payload.projectId}-${key}`;
}

function resolvePanelKind(timesheet: TTimeSheet): TTimesheetPanelKind {
  const key = timesheet.category_detail?.key;
  if (key && CATEGORY_PANEL_KIND[key]) return CATEGORY_PANEL_KIND[key];
  // 兼容极早期还没有 category_detail 的响应：按挂靠对象推断
  if (timesheet.issue) return "issue";
  if (timesheet.test_case) return "test_case";
  return "project";
}

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
    const sa = a.categorySortOrder ?? Number.MAX_SAFE_INTEGER;
    const sb = b.categorySortOrder ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    // 同一类别内（例如一个项目下多条 issue），按 displayName 稳定排序
    return a.displayName.localeCompare(b.displayName);
  });
}

function buildRowsFromTimesheets(sheets: TTimeSheet[], projectName?: string): TTimesheetRow[] {
  const rowsById = new Map<string, TTimesheetRow>();

  for (const t of sheets) {
    const projectId = String(t.project);
    const panel = resolvePanelKind(t);
    const categoryDetail = t.category_detail;
    const categoryKey = categoryDetail?.key;

    if (panel === "issue" && t.issue) {
      const id = makeRowId("issue", { projectId, issueId: t.issue });
      if (!rowsById.has(id)) {
        const detail = t.issue_detail;
        rowsById.set(id, {
          id,
          type: "issue",
          projectId,
          projectName,
          categoryId: t.category || categoryDetail?.id,
          categoryKey,
          categoryName: categoryDetail?.name,
          categorySortOrder: categoryDetail?.sort_order,
          issueId: t.issue,
          issueName: detail?.name ?? "",
          issueSequenceId: detail?.sequence_id ?? 0,
          issueTypeId: detail?.type_id ?? null,
          issueTypeName: detail?.type_name ?? null,
          displayName: detail ? `#${detail.sequence_id} ${detail.name}` : `#${t.issue}`,
        });
      }
    } else if (panel === "test_case" && t.test_case) {
      const id = makeRowId("test_case", { projectId, testCaseId: t.test_case });
      if (!rowsById.has(id)) {
        const detail = t.test_case_detail;
        const name = detail?.name ?? "";
        rowsById.set(id, {
          id,
          type: "test_case",
          projectId,
          projectName,
          categoryId: t.category || categoryDetail?.id,
          categoryKey,
          categoryName: categoryDetail?.name,
          categorySortOrder: categoryDetail?.sort_order,
          testCaseId: t.test_case,
          testCaseName: name,
          displayName: name,
        });
      }
    } else {
      const id = makeRowId("project", { projectId, categoryKey });
      if (!rowsById.has(id)) {
        const fallbackLabel = projectName?.trim() ? projectName : "项目工时";
        rowsById.set(id, {
          id,
          type: "project",
          projectId,
          projectName,
          categoryId: t.category || categoryDetail?.id,
          categoryKey,
          categoryName: categoryDetail?.name,
          categorySortOrder: categoryDetail?.sort_order,
          displayName: fallbackLabel,
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

/** 工时填报最早允许日期：上个月1号 */
export function getEarliestAllowedDate(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}

/** 判断某个日期是否允许填报工时 */
export function isDateEditable(dateKey: string): boolean {
  const earliest = getEarliestAllowedDate();
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date >= earliest;
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

  const isWeekFullyReadOnly = useMemo(() => {
    return weekDays.every((d) => !isDateEditable(formatDateKey(d)));
  }, [weekDays]);

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

  const updateTimesheet = useCallback(
    async (timesheetId: string, data: Partial<TTimeSheetCreatePayload>): Promise<TTimeSheet | undefined> => {
      if (!workspaceSlug) return;
      const ts = timesheetsRef.current.find((t) => t.id === timesheetId);
      if (!ts) return;
      const updated = await timesheetService.update(workspaceSlug, String(ts.project), timesheetId, data);
      setTimesheets((prev) => prev.map((t) => (t.id === timesheetId ? updated : t)));
      return updated;
    },
    [workspaceSlug]
  );

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

  const goToWeek = useCallback((date: Date) => {
    setWeekStart(getWeekStart(date));
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

  const getTimesheetsForDate = useCallback(
    (dateKey: string): TTimeSheet[] => timesheets.filter((t) => t.date === dateKey),
    [timesheets]
  );

  const getTimesheetsForCell = useCallback(
    (row: TTimesheetRow, dateKey: string): TTimeSheet[] => {
      return timesheets.filter((t) => {
        if (t.date !== dateKey) return false;
        if (row.type === "issue") return t.issue === row.issueId;
        if (row.type === "test_case") return t.test_case === row.testCaseId;
        // project 面板：同一项目可能有多条不同类别的纯项目级行，必须按 category 区分
        if (t.project !== row.projectId || t.issue || t.test_case) return false;
        if (row.categoryId) return t.category === row.categoryId;
        if (row.categoryKey) return t.category_detail?.key === row.categoryKey;
        return true;
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
    updateTimesheet,
    deleteTimesheet,
    copyPreviousWeek,
    goToPrevWeek,
    goToNextWeek,
    goToCurrentWeek,
    goToWeek,
    isWeekFullyReadOnly,
    addRow,
    removeRow,
    getTimesheetsForDate,
    getTimesheetsForCell,
    getCellHours,
    getDayTotalHours,
  };
};
