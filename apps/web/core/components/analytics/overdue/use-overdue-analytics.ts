/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import type { TOverdueAnalyticsResponse, TOverdueAnalyticsStatus } from "@plane/types";
import { useAnalytics } from "@/hooks/store/use-analytics";
import { AnalyticsService } from "@/services/analytics.service";

const analyticsService = new AnalyticsService();

export const useOverdueAnalytics = (status: TOverdueAnalyticsStatus) => {
  const { workspaceSlug } = useParams();
  const { selectedProjects } = useAnalytics();

  const workspaceSlugValue = workspaceSlug?.toString();
  const projectIdsParam = useMemo(
    () => (selectedProjects.length > 0 ? selectedProjects.join(",") : undefined),
    [selectedProjects]
  );

  const swrKey = workspaceSlugValue
    ? `workspace-overdue-analytics-${workspaceSlugValue}-${status}-${projectIdsParam ?? "all-projects"}`
    : null;

  const { data, error, isLoading, mutate } = useSWR<TOverdueAnalyticsResponse>(
    swrKey,
    workspaceSlugValue
      ? () =>
          analyticsService.getWorkspaceOverdueAnalytics(workspaceSlugValue, {
            status,
            ...(projectIdsParam ? { project_ids: projectIdsParam } : {}),
          })
      : null
  );

  return {
    data,
    error,
    isLoading,
    mutate,
  };
};
