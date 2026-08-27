/** 基线三个视图（列表 / 条目 / 对比）共用的分页条。 */
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
    <footer className="flex shrink-0 items-center justify-between border-t border-subtle px-4 py-2.5 text-11 text-secondary">
      <span>{label}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!prevPageResults}
          onClick={() => onCursorChange(prevCursor)}
          className="grid size-7 place-items-center rounded border border-subtle disabled:opacity-40"
          aria-label={t("requirement_grid.pagination.previous_page")}
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <span className="tabular-nums">{Math.max(currentPage, 1)}</span>
        <button
          type="button"
          disabled={!nextPageResults}
          onClick={() => onCursorChange(nextCursor)}
          className="grid size-7 place-items-center rounded border border-subtle disabled:opacity-40"
          aria-label={t("requirement_grid.pagination.next_page")}
        >
          <ChevronRight className="size-3.5" />
        </button>
        <select
          value={perPage}
          onChange={(event) => onPerPageChange(Number(event.target.value))}
          className="h-7 rounded border border-subtle bg-surface-1 px-1.5 outline-none"
          aria-label={t("requirement_grid.pagination.per_page")}
        >
          {PER_PAGE_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {t("workspace_products.requirements.change.per_page_value", { count: value })}
            </option>
          ))}
        </select>
      </div>
    </footer>
  );
}
