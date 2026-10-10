/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";

const I18N = "work_item_picker";

/** 页码窗口：总页数不多全列，否则「1 … 前 当前 后 … 末」 */
const pageWindow = (current: number, pageCount: number): (number | "gap")[] => {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = new Set([1, pageCount, current - 1, current, current + 1]);
  const sorted = [...pages].filter((page) => page >= 1 && page <= pageCount).sort((a, b) => a - b);
  return sorted.flatMap((page, index) => (index > 0 && page - sorted[index - 1] > 1 ? ["gap" as const, page] : [page]));
};

export const WorkItemPickerPager = (props: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) => {
  const { page, pageSize, total, onChange } = props;
  const { t } = useTranslation();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const navButton =
    "grid size-7.5 place-items-center rounded-md text-secondary hover:bg-layer-1 disabled:pointer-events-none disabled:text-placeholder";

  return (
    <div className="flex min-w-0 items-center gap-1 text-13 text-tertiary">
      <span className="mr-3 whitespace-nowrap tabular-nums">{t(`${I18N}.pager`, { from, to, total })}</span>
      <button
        type="button"
        aria-label={t(`${I18N}.prev_page`)}
        className={navButton}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft className="size-4" />
      </button>
      {pageWindow(page, pageCount).map((item, index) =>
        item === "gap" ? (
          <span key={`gap-${index}`} className="grid size-7.5 place-items-center text-placeholder">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            aria-current={item === page ? "page" : undefined}
            className={cn(
              "grid h-7.5 min-w-7.5 place-items-center rounded-md px-1.5 tabular-nums",
              item === page ? "bg-layer-2 font-semibold text-primary" : "text-secondary hover:bg-layer-1"
            )}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        )
      )}
      <button
        type="button"
        aria-label={t(`${I18N}.next_page`)}
        className={navButton}
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
};

/** 左侧放分页或提示，右侧「其中 N 项将从原迭代移到本迭代」+ 取消 / 添加 N 项 */
export const WorkItemPickerFooter = (props: {
  left: ReactNode;
  moveHint?: string;
  selectedCount: number;
  isSubmitting: boolean;
  /** 「选择全部 N 条」还在拉：先别让提交 */
  isBusy?: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) => {
  const { left, moveHint, selectedCount, isSubmitting, isBusy = false, onCancel, onSubmit } = props;
  const { t } = useTranslation();

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-t border-subtle px-5 py-3.5 sm:px-7">
      <div className="mr-auto min-w-0">{left}</div>
      {moveHint && (
        <span className="flex items-center gap-1.5 text-13 text-warning-primary">
          <Info className="size-3.5 shrink-0" />
          {moveHint}
        </span>
      )}
      <Button variant="secondary" size="lg" onClick={onCancel}>
        {t("common.cancel")}
      </Button>
      <Button
        variant="primary"
        size="lg"
        onClick={onSubmit}
        loading={isSubmitting}
        disabled={isSubmitting || isBusy || selectedCount === 0}
      >
        {isSubmitting
          ? t(`${I18N}.adding`)
          : selectedCount > 0
            ? t(`${I18N}.add_count`, { count: selectedCount })
            : t(`${I18N}.add`)}
      </Button>
    </div>
  );
};
