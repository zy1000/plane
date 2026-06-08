/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { TOverdueAnalyticsStatus, TOverdueEntityType } from "@plane/types";
import { useAnalytics } from "@/hooks/store/use-analytics";
import { AnalyticsService } from "@/services/analytics.service";

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

type TOverdueExportOptions = {
  status: TOverdueAnalyticsStatus;
  entityType?: TOverdueEntityType;
};

export const useOverdueExport = () => {
  const [isExporting, setIsExporting] = useState(false);
  const { workspaceSlug } = useParams();
  const { selectedProjects } = useAnalytics();

  const workspaceSlugValue = workspaceSlug?.toString();
  const projectIdsParam = useMemo(
    () => (selectedProjects.length > 0 ? selectedProjects.join(",") : undefined),
    [selectedProjects]
  );

  const exportXlsx = useCallback(
    async ({ status, entityType }: TOverdueExportOptions) => {
      if (!workspaceSlugValue) return;
      setIsExporting(true);
      try {
        const { blob, filename } = await analyticsService.exportWorkspaceOverdueAnalytics(workspaceSlugValue, {
          status,
          ...(entityType ? { entity_type: entityType } : {}),
          ...(projectIdsParam ? { project_ids: projectIdsParam } : {}),
        });
        triggerBrowserDownload(blob, filename);
      } finally {
        setIsExporting(false);
      }
    },
    [workspaceSlugValue, projectIdsParam]
  );

  return {
    exportXlsx,
    isExporting,
  };
};
