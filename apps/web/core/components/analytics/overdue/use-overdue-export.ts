/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { useAnalytics } from "@/hooks/store/use-analytics";
import { AnalyticsService } from "@/services/analytics.service";
import type { TOverdueExportOptions } from "./filters/match-overdue-record";

const analyticsService = new AnalyticsService();

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

export const useOverdueExport = () => {
  const [isExporting, setIsExporting] = useState(false);
  const { workspaceSlug } = useParams();
  const { selectedProjects } = useAnalytics();

  const workspaceSlugValue = workspaceSlug?.toString();

  const exportXlsx = useCallback(
    async ({ status, entityType, dateField, startDate, endDate, projectIds }: TOverdueExportOptions) => {
      if (!workspaceSlugValue) return;
      setIsExporting(true);
      try {
        const combinedProjectIds = projectIds && projectIds.length > 0 ? projectIds : selectedProjects;
        const combinedProjectIdsParam = combinedProjectIds.length > 0 ? combinedProjectIds.join(",") : undefined;

        const { blob, filename } = await analyticsService.exportWorkspaceOverdueAnalytics(workspaceSlugValue, {
          ...(status ? { status } : {}),
          ...(entityType ? { entity_type: entityType } : {}),
          ...(dateField ? { date_field: dateField } : {}),
          ...(startDate ? { start_date: startDate } : {}),
          ...(endDate ? { end_date: endDate } : {}),
          ...(combinedProjectIdsParam ? { project_ids: combinedProjectIdsParam } : {}),
        });
        triggerBrowserDownload(blob, filename);
      } finally {
        setIsExporting(false);
      }
    },
    [workspaceSlugValue, selectedProjects]
  );

  return {
    exportXlsx,
    isExporting,
  };
};
