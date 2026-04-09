/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import { TimesheetService, type TTimeSheet, type TTimeSheetCreatePayload } from "@/services/issue/timesheet.service";

const timesheetService = new TimesheetService();

export const useTimesheet = (
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  issueId: string | undefined,
  testCaseId?: string | undefined
) => {
  const [timesheets, setTimesheets] = useState<TTimeSheet[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalHours = timesheets.reduce((sum, t) => sum + parseFloat(t.hours || "0"), 0);

  const fetchTimesheets = useCallback(async () => {
    if (!workspaceSlug || !projectId || (!issueId && !testCaseId)) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await timesheetService.list(workspaceSlug, projectId, issueId, testCaseId);
      setTimesheets(data);
    } catch (err) {
      setError("获取工时记录失败");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, projectId, issueId, testCaseId]);

  const createTimesheet = useCallback(
    async (data: TTimeSheetCreatePayload) => {
      if (!workspaceSlug || !projectId) return;
      const created = await timesheetService.create(workspaceSlug, projectId, data);
      setTimesheets((prev) => [created, ...prev]);
      return created;
    },
    [workspaceSlug, projectId]
  );

  const deleteTimesheet = useCallback(
    async (timesheetId: string) => {
      if (!workspaceSlug || !projectId) return;
      await timesheetService.destroy(workspaceSlug, projectId, timesheetId);
      setTimesheets((prev) => prev.filter((t) => t.id !== timesheetId));
    },
    [workspaceSlug, projectId]
  );

  return {
    timesheets,
    isLoading,
    error,
    totalHours,
    fetchTimesheets,
    createTimesheet,
    deleteTimesheet,
  };
};
