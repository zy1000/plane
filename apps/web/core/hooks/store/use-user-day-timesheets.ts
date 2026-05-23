/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useRef, useState } from "react";
import { TimesheetService, type TTimeSheet } from "@/services/issue/timesheet.service";

const timesheetService = new TimesheetService();

export const useUserDayTimesheets = (
  workspaceSlug: string | undefined,
  memberId: string | undefined
) => {
  const [cache, setCache] = useState<Record<string, TTimeSheet[]>>({});
  const cacheRef = useRef(cache);

  cacheRef.current = cache;

  const ensureLoaded = useCallback(
    async (date: string): Promise<TTimeSheet[]> => {
      if (!workspaceSlug || !memberId) return [];
      if (cacheRef.current[date]) return cacheRef.current[date];

      const data = await timesheetService.workspaceList(workspaceSlug, {
        member_id: memberId,
        date__gte: date,
        date__lte: date,
      });

      setCache((prev) => ({ ...prev, [date]: data }));
      return data;
    },
    [workspaceSlug, memberId]
  );

  const getDayTimesheets = useCallback(
    (date: string): TTimeSheet[] => cache[date] ?? [],
    [cache]
  );

  return { getDayTimesheets, ensureLoaded };
};
