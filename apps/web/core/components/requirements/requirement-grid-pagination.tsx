"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Loader as LoaderIcon } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { CustomMenu } from "@plane/ui";

const PAGE_SIZE_OPTIONS = [20, 50, 100];

type TProps = {
  totalCount: number;
  perPage: number;
  /** 0 起的当前页 */
  pageIndex: number;
  isLoading?: boolean;
  onPageChange: (pageIndex: number) => void;
  onPerPageChange: (perPage: number) => void;
};

/**
 * 需求表格底部的分页条：左「共 N 条」，右侧上一页 / 当前页 / 下一页 + 每页条数。
 * 替代 antd simple Pagination —— 那个没有中文 locale，每页条数会显示成「20 / page」。
 */
export const RequirementGridPagination = ({
  totalCount,
  perPage,
  pageIndex,
  isLoading = false,
  onPageChange,
  onPerPageChange,
}: TProps) => {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(totalCount / Math.max(perPage, 1)));
  const canPrev = pageIndex > 0;
  const canNext = pageIndex + 1 < totalPages;

  return (
    <div className="flex h-12 items-center gap-2 border-t border-subtle bg-surface-1 px-5 text-13 text-tertiary">
      <span className="flex items-center">
        {isLoading && <LoaderIcon className="mr-1 inline size-3.5 animate-spin" />}
        {t("workspace_products.requirements.data.pagination.total", { count: totalCount })}
      </span>
      <IconButton
        variant="ghost"
        size="lg"
        className="ml-auto"
        icon={ChevronLeft}
        disabled={!canPrev}
        onClick={() => onPageChange(pageIndex - 1)}
        aria-label={t("workspace_products.requirements.data.pagination.prev")}
      />
      <span className="grid h-7 min-w-7 place-items-center rounded-md bg-layer-2 px-1.5 font-semibold text-primary tabular-nums">
        {pageIndex + 1}
      </span>
      <IconButton
        variant="ghost"
        size="lg"
        icon={ChevronRight}
        disabled={!canNext}
        onClick={() => onPageChange(pageIndex + 1)}
        aria-label={t("workspace_products.requirements.data.pagination.next")}
      />
      <CustomMenu
        placement="top-end"
        closeOnSelect
        customButtonClassName="flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-subtle bg-surface-1 px-2.5 text-secondary hover:bg-layer-1"
        customButton={
          <>
            {t("workspace_products.requirements.data.pagination.page_size", { count: perPage })}
            <ChevronDown className="size-3.5 text-placeholder" />
          </>
        }
      >
        {PAGE_SIZE_OPTIONS.map((size) => (
          <CustomMenu.MenuItem key={size} onClick={() => size !== perPage && onPerPageChange(size)}>
            <span className={size === perPage ? "font-medium text-primary" : undefined}>
              {t("workspace_products.requirements.data.pagination.page_size", { count: size })}
            </span>
          </CustomMenu.MenuItem>
        ))}
      </CustomMenu>
    </div>
  );
};
