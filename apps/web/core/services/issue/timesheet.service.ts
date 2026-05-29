/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TTimesheetCategoryDetail = {
  id: string;
  key: string;
  name: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
};

export type TTimeSheet = {
  id: string;
  member: string;
  member_detail: {
    id: string;
    display_name: string;
    avatar?: string;
    avatar_url?: string;
  };
  date: string;
  start_time: string;
  end_time: string;
  hours: string;
  description: string;
  project: string;
  category: string;
  category_detail: TTimesheetCategoryDetail | null;
  issue: string | null;
  issue_detail: {
    id: string;
    name: string;
    sequence_id: number;
    type_id: string | null;
    type_name?: string | null;
  } | null;
  test_case: string | null;
  test_case_detail: {
    id: string;
    name: string;
    code?: string;
  } | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
};

export type TTimesheetListParams = {
  member_id?: string;
  date__gte?: string;
  date__lte?: string;
  issue_id?: string;
  test_case_id?: string;
  category_id?: string;
  category_key?: string;
};

export type TTimesheetReportRow = {
  id: string;
  pms_project_name: string | null;
  project_name: string | null;
  issue_name: string | null;
  case_name: string | null;
  member_name: string | null;
  date: string;
  start_time: string;
  end_time: string;
  hours: string;
  description: string;
  category_name: string | null;
};

export type TTimesheetReportParams = {
  /** 单值或多值；多值以逗号分隔后发送给后端。 */
  project_id?: string | string[];
  member_id?: string | string[];
  category_id?: string | string[];
  category_key?: string | string[];
  /** 项目编号筛选；特殊值 "__empty__" 代表项目编号为空。 */
  pms_project_name?: string | string[];
  start_time?: string;
  end_time?: string;
  cursor?: string;
  per_page?: number;
};

/** 项目编号筛选中代表「空值」的特殊标记，前后端约定一致。 */
export const EMPTY_PMS_PROJECT_NAME = "__empty__";

export type TTimesheetReportResponse = {
  total_count: number;
  next_cursor: string;
  prev_cursor: string;
  next_page_results: boolean;
  prev_page_results: boolean;
  count: number;
  total_pages: number;
  total_results: number;
  results: TTimesheetReportRow[];
};

export type TTimeSheetCreatePayload = {
  date: string;
  start_time: string;
  end_time: string;
  hours: string;
  description?: string;
  issue?: string;
  test_case?: string;
  /** 工时类别 id。若不传，后端会根据 issue/test_case 回落推断，兼容旧客户端。 */
  category?: string;
};

export type TCopyPreviousWeekPayload = {
  week_start: string;
};

export type TCopyPreviousWeekResponse = {
  week_start: string;
  source_week_start: string;
  source_count: number;
  created_count: number;
  skipped_count: number;
  timesheets: TTimeSheet[];
};

type TDuplicateTimesheetCheck = {
  timesheets: TTimeSheet[];
  memberId?: string;
  date: string;
  startTime: string;
  endTime: string;
  issueId?: string;
  testCaseId?: string;
  /** 精确到类别维度判重；不传时回落到旧逻辑（按 issue/test_case 推断）。 */
  categoryId?: string;
};

const normalizeClockValue = (value: string) => value.slice(0, 5);

/**
 * 把支持单值或数组的查询参数统一写入到 query 对象中。
 * - 数组：去重 + 过滤空值后以逗号拼接；全部为空则不写入。
 * - 字符串：非空时直接写入。
 */
const assignMultiValueParam = (
  target: Record<string, string | number>,
  key: string,
  value: string | string[] | undefined
) => {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    const joined = Array.from(new Set(value.filter(Boolean))).join(",");
    if (joined) target[key] = joined;
    return;
  }
  if (value) target[key] = value;
};

export const hasDuplicateTimesheetEntry = ({
  timesheets,
  memberId,
  date,
  startTime,
  endTime,
  issueId,
  testCaseId,
  categoryId,
}: TDuplicateTimesheetCheck): boolean => {
  if (!memberId) return false;

  return timesheets.some((timesheet) => {
    const sameCategory = categoryId ? timesheet.category === categoryId : true;
    const sameTask = issueId
      ? timesheet.issue === issueId
      : testCaseId
        ? timesheet.test_case === testCaseId
        : !timesheet.issue && !timesheet.test_case;

    return (
      timesheet.member === memberId &&
      timesheet.date === date &&
      normalizeClockValue(timesheet.start_time) === normalizeClockValue(startTime) &&
      normalizeClockValue(timesheet.end_time) === normalizeClockValue(endTime) &&
      sameCategory &&
      sameTask
    );
  });
};

const readFirstErrorMessage = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim()) return value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = readFirstErrorMessage(item);
      if (message) return message;
    }
    return null;
  }

  if (value && typeof value === "object") {
    for (const nestedValue of Object.values(value)) {
      const message = readFirstErrorMessage(nestedValue);
      if (message) return message;
    }
  }

  return null;
};

export const getTimesheetErrorMessage = (
  error: unknown,
  fallback = "保存失败，请重试"
): string => readFirstErrorMessage(error) ?? fallback;

export class TimesheetService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(
    workspaceSlug: string,
    projectId: string,
    issueId?: string,
    testCaseId?: string
  ): Promise<TTimeSheet[]> {
    const params: Record<string, string> = {};
    if (issueId) params["issue_id"] = issueId;
    if (testCaseId) params["test_case_id"] = testCaseId;
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/timesheets/`, { params })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listByDateRange(
    workspaceSlug: string,
    projectId: string,
    params: TTimesheetListParams
  ): Promise<TTimeSheet[]> {
    const queryParams: Record<string, string> = {};
    if (params.member_id) queryParams["member_id"] = params.member_id;
    if (params.date__gte) queryParams["date__gte"] = params.date__gte;
    if (params.date__lte) queryParams["date__lte"] = params.date__lte;
    if (params.issue_id) queryParams["issue_id"] = params.issue_id;
    if (params.test_case_id) queryParams["test_case_id"] = params.test_case_id;
    if (params.category_id) queryParams["category_id"] = params.category_id;
    if (params.category_key) queryParams["category__key"] = params.category_key;
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/timesheets/`, {
      params: queryParams,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async workspaceList(workspaceSlug: string, params: TTimesheetListParams): Promise<TTimeSheet[]> {
    const queryParams: Record<string, string> = {};
    if (params.member_id) queryParams["member_id"] = params.member_id;
    if (params.date__gte) queryParams["date__gte"] = params.date__gte;
    if (params.date__lte) queryParams["date__lte"] = params.date__lte;
    if (params.category_id) queryParams["category_id"] = params.category_id;
    if (params.category_key) queryParams["category__key"] = params.category_key;
    return this.get(`/api/workspaces/${workspaceSlug}/timesheets/`, { params: queryParams })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async workspaceCopyPreviousWeek(
    workspaceSlug: string,
    data: TCopyPreviousWeekPayload
  ): Promise<TCopyPreviousWeekResponse> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/timesheets/copy-previous-week/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async reportList(
    workspaceSlug: string,
    params: TTimesheetReportParams
  ): Promise<TTimesheetReportResponse> {
    const queryParams: Record<string, string | number> = {};
    assignMultiValueParam(queryParams, "project_id", params.project_id);
    assignMultiValueParam(queryParams, "member_id", params.member_id);
    assignMultiValueParam(queryParams, "category_id", params.category_id);
    assignMultiValueParam(queryParams, "category_key", params.category_key);
    assignMultiValueParam(queryParams, "pms_project_name", params.pms_project_name);
    if (params.start_time) queryParams.start_time = params.start_time;
    if (params.end_time) queryParams.end_time = params.end_time;
    if (params.cursor) queryParams.cursor = params.cursor;
    if (params.per_page) queryParams.per_page = params.per_page;
    return this.get(`/api/workspaces/${workspaceSlug}/timesheets/reports/`, {
      params: queryParams,
    })
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async reportExport(
    workspaceSlug: string,
    params: TTimesheetReportParams,
    ids?: string[]
  ): Promise<{ blob: Blob; filename: string }> {
    const queryParams: Record<string, string> = {};
    assignMultiValueParam(queryParams, "project_id", params.project_id);
    assignMultiValueParam(queryParams, "member_id", params.member_id);
    assignMultiValueParam(queryParams, "category_id", params.category_id);
    assignMultiValueParam(queryParams, "category_key", params.category_key);
    assignMultiValueParam(queryParams, "pms_project_name", params.pms_project_name);
    if (params.start_time) queryParams.start_time = params.start_time;
    if (params.end_time) queryParams.end_time = params.end_time;
    if (ids && ids.length > 0) queryParams.ids = ids.join(",");
    return this.get(
      `/api/workspaces/${workspaceSlug}/timesheets/reports/export/`,
      {
        params: queryParams,
        responseType: "blob",
      }
    )
      .then((response) => {
        const disposition: string = response?.headers?.["content-disposition"] ?? "";
        const match = disposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/i);
        const filename = match
          ? decodeURIComponent(match[1].trim().replace(/^"|"$/g, ""))
          : `timesheet-report-${Date.now()}.xlsx`;
        return { blob: response?.data as Blob, filename };
      })
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(
    workspaceSlug: string,
    projectId: string,
    data: TTimeSheetCreatePayload
  ): Promise<TTimeSheet> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/timesheets/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async copyPreviousWeek(
    workspaceSlug: string,
    projectId: string,
    data: TCopyPreviousWeekPayload
  ): Promise<TCopyPreviousWeekResponse> {
    return this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/timesheets/copy-previous-week/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    timesheetId: string,
    data: Partial<TTimeSheetCreatePayload>
  ): Promise<TTimeSheet> {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/timesheets/${timesheetId}/`,
      data
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, projectId: string, timesheetId: string): Promise<void> {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/timesheets/${timesheetId}/`
    )
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
