/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { AnalyticsTab } from "@plane/types";
import { Overview } from "@/components/analytics/overview";
import { OverdueAnalytics } from "@/components/analytics/overdue";
import { Statistics } from "@/components/analytics/statistics";
import { WorkItems } from "@/components/analytics/work-items";

export const getAnalyticsTabs = (t: (key: string, params?: Record<string, any>) => string): AnalyticsTab[] => [
  { key: "overview", label: "概览", content: Overview, isDisabled: false },
  { key: "work-items", label: t("sidebar.work_items"), content: WorkItems, isDisabled: false },
  { key: "overdue", label: "延期", content: OverdueAnalytics, isDisabled: false },
  { key: "statistics", label: "统计", content: Statistics, isDisabled: false },
];
