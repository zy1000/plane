/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

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
};

export type TTimeSheetCreatePayload = {
  date: string;
  start_time: string;
  end_time: string;
  hours: string;
  description?: string;
  issue?: string;
  test_case?: string;
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
};

const normalizeClockValue = (value: string) => value.slice(0, 5);

export const hasDuplicateTimesheetEntry = ({
  timesheets,
  memberId,
  date,
  startTime,
  endTime,
  issueId,
  testCaseId,
}: TDuplicateTimesheetCheck): boolean => {
  if (!memberId) return false;

  return timesheets.some((timesheet) => {
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
