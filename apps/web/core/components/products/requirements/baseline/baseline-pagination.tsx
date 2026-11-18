/** 基线三个视图（列表 / 条目 / 对比）与变更记录列表共用的分页条。 */
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { CustomMenu } from "@plane/ui";

const PER_PAGE_OPTIONS = [10, 20, 50];

type TProps = {
  label: string;
  perPage: number;
  nextCursor?: string;
  prevCursor?: string;
  nextPageResults?: boolean;
  prevPageResults?: boolean;
  onPerPageChange: (value: number) => void;
  onCursorChange: (value: string | undefined) => void;
};

export function BaselinePagination(props: TProps) {
  const {
    label,
    perPage,
    nextCursor,
    prevCursor,
    nextPageResults,
    prevPageResults,
    onPerPageChange,
    onCursorChange,
  } = props;
  const { t } = useTranslation();
  const currentPage = Number(prevCursor?.split(":")[1] ?? -1) + 2;

  return (
    <footer className="flex h-12 shrink-0 items-center gap-2 border-t border-subtle px-6 text-13 text-tertiary">
      <span>{label}</span>
      {/* 外观与需求明细的 RequirementGridPagination 保持一致 */}
      <IconButton
        variant="ghost"
        size="lg"
        className="ml-auto"
        icon={ChevronLeft}
        disabled={!prevPageResults}
        onClick={() => onCursorChange(prevCursor)}
        aria-label={t("requirement_grid.pagination.previous_page")}
      />
      <span className="grid h-7 min-w-7 place-items-center rounded-md bg-layer-1 px-1.5 font-semibold text-primary tabular-nums">
        {Math.max(currentPage, 1)}
      </span>
      <IconButton
        variant="ghost"
        size="lg"
        icon={ChevronRight}
        disabled={!nextPageResults}
        onClick={() => onCursorChange(nextCursor)}
        aria-label={t("requirement_grid.pagination.next_page")}
      />
      <CustomMenu
        placement="top-end"
        closeOnSelect
        ariaLabel={t("requirement_grid.pagination.per_page")}
        customButtonClassName="flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-subtle bg-surface-1 px-2.5 text-secondary hover:bg-layer-1"
        customButton={
          <>
            {t("workspace_products.requirements.change.per_page_value", { count: perPage })}
            <ChevronDown className="size-3.5 text-placeholder" />
          </>
        }
      >
        {PER_PAGE_OPTIONS.map((value) => (
          <CustomMenu.MenuItem key={value} onClick={() => value !== perPage && onPerPageChange(value)}>
            <span className={value === perPage ? "font-medium text-primary" : undefined}>
              {t("workspace_products.requirements.change.per_page_value", { count: value })}
            </span>
          </CustomMenu.MenuItem>
        ))}
      </CustomMenu>
    </footer>
  );
}
