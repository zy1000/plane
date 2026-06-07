/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Card, Loader } from "@plane/ui";
import type { TOverdueSummary } from "@plane/types";

type Props = {
  summary?: TOverdueSummary;
  isLoading?: boolean;
};

const SUMMARY_ITEMS: Array<{ key: keyof TOverdueSummary; label: string }> = [
  { key: "total", label: "延期总数" },
  { key: "work_items", label: "延期工作项" },
  { key: "cycles", label: "延期迭代" },
  { key: "releases", label: "延期发布" },
  { key: "test_plans", label: "延期测试计划" },
];

export const OverdueSummaryCards = ({ summary, isLoading = false }: Props) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
    {SUMMARY_ITEMS.map((item) => (
      <Card key={item.key} className="border border-subtle p-4">
        <div className="text-xs text-placeholder">{item.label}</div>
        {isLoading ? (
          <Loader className="mt-2">
            <Loader.Item height="28px" width="56px" />
          </Loader>
        ) : (
          <div className="mt-1 text-2xl font-semibold text-primary">{summary?.[item.key] ?? 0}</div>
        )}
      </Card>
    ))}
  </div>
);
