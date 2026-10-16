/** 基线三个视图（列表 / 条目 / 对比）与变更记录列表共用的分页条。 */
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";

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
      <button
        type="button"
        disabled={!prevPageResults}
        onClick={() => onCursorChange(prevCursor)}
        className="ml-auto grid size-7 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover disabled:pointer-events-none disabled:text-disabled"
        aria-label={t("requirement_grid.pagination.previous_page")}
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="grid h-7 min-w-7 place-items-center rounded-md bg-layer-1 px-1.5 font-semibold text-primary tabular-nums">
        {Math.max(currentPage, 1)}
      </span>
      <button
        type="button"
        disabled={!nextPageResults}
        onClick={() => onCursorChange(nextCursor)}
        className="grid size-7 place-items-center rounded-md text-secondary hover:bg-layer-transparent-hover disabled:pointer-events-none disabled:text-disabled"
        aria-label={t("requirement_grid.pagination.next_page")}
      >
        <ChevronRight className="size-4" />
      </button>
      <select
        value={perPage}
        onChange={(event) => onPerPageChange(Number(event.target.value))}
        className="h-7 cursor-pointer rounded-md border border-subtle bg-surface-1 px-2 text-13 text-primary outline-none hover:bg-layer-transparent-hover"
        aria-label={t("requirement_grid.pagination.per_page")}
      >
        {PER_PAGE_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {t("workspace_products.requirements.change.per_page_value", { count: value })}
          </option>
        ))}
      </select>
    </footer>
  );
}
