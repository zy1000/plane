/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import type { TOverdueRecord } from "@plane/types";
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

export const useOverdueExport = () => {
  const [isExporting, setIsExporting] = useState(false);
  const { workspaceSlug } = useParams();

  const workspaceSlugValue = workspaceSlug?.toString();

  // 导出当前筛选条件下的全部记录（忽略分页），records 由调用方传入已过滤的完整集合
  const exportXlsx = useCallback(
    async (records: TOverdueRecord[]) => {
      if (!workspaceSlugValue) return;
      setIsExporting(true);
      try {
        const { blob, filename } = await analyticsService.exportWorkspaceOverdueAnalyticsRecords(
          workspaceSlugValue,
          records
        );
        triggerBrowserDownload(blob, filename);
      } finally {
        setIsExporting(false);
      }
    },
    [workspaceSlugValue]
  );

  return {
    exportXlsx,
    isExporting,
  };
};
