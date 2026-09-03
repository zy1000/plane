"use client";

/**
 * 历史区标题行右侧：过滤（全部 / 只看版本 / 结构变更）+「对比两版」。
 * 过滤代替了原来的两个页签 —— 「只看版本」就是原来的版本页。
 */
import { GitCompareArrows } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import type { THistoryCounts, THistoryFilter } from "./requirement-history-model";

const FILTERS: THistoryFilter[] = ["all", "versions", "schema"];

export const RequirementHistoryToolbar = ({
  filter,
  onFilterChange,
  counts,
  canCompare,
  isComparing,
  onToggleCompare,
}: {
  filter: THistoryFilter;
  onFilterChange: (filter: THistoryFilter) => void;
  counts: THistoryCounts;
  canCompare: boolean;
  isComparing: boolean;
  onToggleCompare: () => void;
}) => {
  const { t } = useTranslation();
  const countOf = (key: THistoryFilter) =>
    key === "versions" ? counts.versions : key === "schema" ? counts.schema : null;

  return (
    <div className="flex items-center gap-2">
      <div role="radiogroup" className="flex items-center gap-0.5 rounded-md bg-layer-1 p-0.5">
        {FILTERS.map((key) => {
          const isActive = filter === key;
          const count = countOf(key);
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isActive}
              onClick={() => onFilterChange(key)}
              className={cn(
                "inline-flex h-6 items-center gap-1.5 rounded px-2 text-caption-md-medium transition-colors",
                isActive ? "bg-surface-1 text-primary shadow-raised-100" : "text-tertiary hover:text-secondary"
              )}
            >
              {t(`requirement_detail.history.filter.${key}`)}
              {count !== null && count > 0 && (
                <span
                  className={cn(
                    "rounded px-1 text-caption-md-regular tabular-nums",
                    isActive ? "bg-layer-1 text-tertiary" : "bg-layer-3 text-tertiary"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        disabled={!canCompare}
        onClick={onToggleCompare}
        title={canCompare ? undefined : t("requirement_detail.history.compare.button_disabled")}
        className={cn(
          "inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-strong px-2 text-body-xs-medium transition-colors",
          isComparing ? "border-accent-strong text-accent-primary" : "text-secondary hover:bg-layer-1 hover:text-primary",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        )}
      >
        <GitCompareArrows className="size-3.5" />
        {t("requirement_detail.history.compare.button")}
      </button>
    </div>
  );
};
