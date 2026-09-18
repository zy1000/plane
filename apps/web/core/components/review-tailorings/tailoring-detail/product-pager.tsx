import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import type { TMatrixScroll } from "./use-matrix-scroll";

/** 产品少于这个数就不给翻页器 —— 两三列直接拖滚动条更快 */
const MIN_PRODUCTS = 4;

/**
 * Tab 条右侧的产品列翻页器：显示现在看到第几到第几个产品，点箭头整列跳。
 * 只滚动容器，不改任何数据。装得下全部产品时不显示。
 */
export const ProductPager = ({ scroll }: { scroll: TMatrixScroll }) => {
  const { t } = useTranslation();
  const { firstVisible, lastVisible, total, isScrolled, hasMore } = scroll;

  if (total < MIN_PRODUCTS || (!isScrolled && !hasMore)) return null;

  const button = (direction: -1 | 1, label: string, disabled: boolean) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        "grid size-6 place-items-center rounded-md transition-colors",
        disabled
          ? "text-placeholder"
          : "text-tertiary hover:bg-surface-1 hover:text-primary hover:shadow-raised-100"
      )}
      onClick={() => scroll.scrollByColumn(direction)}
    >
      {direction === -1 ? <ChevronLeft className="size-3.5" /> : <ChevronRight className="size-3.5" />}
    </button>
  );

  return (
    <div className="flex h-7.5 items-center gap-0.5 rounded-lg border border-subtle bg-layer-1 p-0.5">
      {button(-1, t("review_tailoring.matrix.prev_column"), !isScrolled)}
      <span className="px-1.5 text-12 whitespace-nowrap text-secondary tabular-nums">
        {t("review_tailoring.matrix.product_range", {
          from: firstVisible || 1,
          to: lastVisible || total,
          total,
        })}
      </span>
      {button(1, t("review_tailoring.matrix.next_column"), !hasMore)}
    </div>
  );
};
