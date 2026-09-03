import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";

type Props = {
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  pageSizeOptions: readonly number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

const I18N = "workspace_settings.settings.data_dictionaries.pagination";
const ELLIPSIS = "…";

/** 首尾各一页 + 当前页前后各一页，中间省略；总页数不多时全部列出 */
const buildPages = (page: number, pageCount: number): (number | typeof ELLIPSIS)[] => {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const pages = new Set<number>([1, pageCount, page - 1, page, page + 1]);
  const ordered = [...pages].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b);
  const result: (number | typeof ELLIPSIS)[] = [];
  ordered.forEach((value, index) => {
    if (index > 0 && value - (ordered[index - 1] as number) > 1) result.push(ELLIPSIS);
    result.push(value);
  });
  return result;
};

const buttonClass =
  "grid h-7 min-w-7 place-items-center rounded px-1.5 text-12 tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40";

export function DictionaryItemsPagination(props: Props) {
  const { total, page, pageCount, pageSize, pageSizeOptions, onPageChange, onPageSizeChange } = props;
  const { t } = useTranslation();
  const [jump, setJump] = useState(String(page));

  useEffect(() => {
    setJump(String(page));
  }, [page]);

  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const commitJump = () => {
    const target = Number.parseInt(jump, 10);
    if (Number.isNaN(target)) {
      setJump(String(page));
      return;
    }
    onPageChange(Math.min(Math.max(target, 1), pageCount));
  };

  return (
    <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-subtle bg-surface-1 px-3 py-2 text-12 text-secondary">
      <select
        value={pageSize}
        onChange={(event) => onPageSizeChange(Number(event.target.value))}
        className="h-7 rounded border border-subtle bg-surface-1 px-1.5 text-12 outline-none"
        aria-label={t(`${I18N}.per_page`, { size: pageSize })}
      >
        {pageSizeOptions.map((value) => (
          <option key={value} value={value}>
            {t(`${I18N}.per_page`, { size: value })}
          </option>
        ))}
      </select>
      <span className="tabular-nums">{t(`${I18N}.range`, { start, end, total })}</span>

      <div className="flex-1" />

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className={cn(buttonClass, "text-secondary hover:bg-layer-1-hover")}
          aria-label={t(`${I18N}.prev`)}
        >
          <ChevronLeft className="size-3.5" />
        </button>
        {buildPages(page, pageCount).map((entry, index) =>
          entry === ELLIPSIS ? (
            <span key={`ellipsis-${index}`} className="grid h-7 w-6 place-items-center text-placeholder">
              {ELLIPSIS}
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              onClick={() => onPageChange(entry)}
              aria-current={entry === page ? "page" : undefined}
              className={cn(
                buttonClass,
                entry === page ? "bg-accent-primary font-medium text-on-color" : "text-secondary hover:bg-layer-1-hover"
              )}
            >
              {entry}
            </button>
          )
        )}
        <button
          type="button"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
          className={cn(buttonClass, "text-secondary hover:bg-layer-1-hover")}
          aria-label={t(`${I18N}.next`)}
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>

      <label className="flex items-center gap-1.5">
        {t(`${I18N}.jump_to`)}
        <input
          value={jump}
          onChange={(event) => setJump(event.target.value.replace(/\D/g, ""))}
          onBlur={commitJump}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitJump();
            }
          }}
          inputMode="numeric"
          className="h-7 w-12 rounded border border-subtle bg-surface-1 text-center text-12 tabular-nums outline-none focus:border-accent-strong"
          aria-label={t(`${I18N}.jump_to`)}
        />
        {t(`${I18N}.page`)}
      </label>
    </footer>
  );
}
