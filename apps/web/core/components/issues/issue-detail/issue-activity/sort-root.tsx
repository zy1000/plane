/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { memo } from "react";
import { ArrowUpWideNarrow, ArrowDownWideNarrow } from "lucide-react";
// plane package imports
import { E_SORT_ORDER } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";

export type TActivitySortRoot = {
  sortOrder: E_SORT_ORDER;
  toggleSort: () => void;
  /** icon：只有图标（迭代 / 用例活动页沿用）；label：带「最早在前 / 最新在前」文字 */
  variant?: "icon" | "label";
};
export const ActivitySortRoot = memo(function ActivitySortRoot(props: TActivitySortRoot) {
  const { sortOrder, toggleSort, variant = "icon" } = props;
  const { t } = useTranslation();
  const isAsc = sortOrder === E_SORT_ORDER.ASC;
  const SortIcon = isAsc ? ArrowUpWideNarrow : ArrowDownWideNarrow;
  if (variant === "label") {
    return (
      <button
        type="button"
        onClick={toggleSort}
        className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5 text-13 whitespace-nowrap text-secondary transition hover:bg-layer-1"
      >
        <SortIcon className="size-3.5" />
        {t(`issue_activity.sort.${isAsc ? "asc" : "desc"}`)}
      </button>
    );
  }
  return <IconButton variant="tertiary" icon={SortIcon} onClick={toggleSort} />;
});

ActivitySortRoot.displayName = "ActivitySortRoot";
