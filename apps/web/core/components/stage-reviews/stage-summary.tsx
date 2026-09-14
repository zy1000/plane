import { useMemo } from "react";
import { useTranslation } from "@plane/i18n";
import type { TStageReview } from "@plane/types";
import { EStageReviewStatus, STAGE_REVIEW_STATUS_ORDER } from "@plane/types";
import { cn } from "@plane/utils";
import { countByStatus } from "./stage-review-rows";
import { STAGE_REVIEW_STATUS_FILL } from "./status-icon";

const I18N = "stage_review";

/** 分段条从左往右排：已评审 → 审核中 → 评审中 → 未评审 */
const BAR_ORDER = [...STAGE_REVIEW_STATUS_ORDER].reverse();

const shortDate = (value: string) => value.slice(5, 10);

/**
 * 阶段摘要：阶段名 + 条数 / 产品数 / 计划区间 + 完成百分比 + 分段条 + 状态图例。
 *
 * 数字按**当前阶段的全部评审**算，不受筛选影响。图例点一下等于在筛选行里加（或去掉）
 * 一个「状态」值 —— 同一个条件，两边同步亮。
 */
export const StageReviewSummary = ({
  label,
  reviews,
  activeStatuses,
  onToggleStatus,
}: {
  label: string;
  reviews: TStageReview[];
  activeStatuses: EStageReviewStatus[];
  onToggleStatus: (status: EStageReviewStatus) => void;
}) => {
  const { t } = useTranslation();

  const { counts, productCount, planRange, percent } = useMemo(() => {
    const nextCounts = countByStatus(reviews);
    const starts = reviews.map((review) => review.start_date).filter((value): value is string => Boolean(value));
    const ends = reviews.map((review) => review.end_date).filter((value): value is string => Boolean(value));
    const from = starts.length > 0 ? starts.reduce((min, value) => (value < min ? value : min)) : null;
    const to = ends.length > 0 ? ends.reduce((max, value) => (value > max ? value : max)) : null;
    return {
      counts: nextCounts,
      productCount: new Set(reviews.map((review) => review.product_id)).size,
      planRange: from || to ? [from, to].map((value) => (value ? shortDate(value) : "—")).join(" → ") : null,
      percent: reviews.length === 0 ? 0 : Math.round((nextCounts[EStageReviewStatus.COMPLETED] / reviews.length) * 100),
    };
  }, [reviews]);

  return (
    <div className="flex shrink-0 flex-col gap-3 border-b border-subtle px-6 pt-4 pb-3.5">
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
        <h2 className="text-18 font-semibold text-primary">{label}</h2>
        <span className="text-13 text-tertiary">
          {t(`${I18N}.list.summary_meta`, { reviews: reviews.length, products: productCount })}
          {planRange && ` · ${t(`${I18N}.list.summary_plan`, { range: planRange })}`}
        </span>
        <span className="ml-auto text-13 text-tertiary">
          <b className="mr-1 text-18 font-semibold tabular-nums text-primary">{percent}%</b>
          {t(`${I18N}.status.completed`)}
        </span>
      </div>

      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-layer-3">
        {BAR_ORDER.map((status) =>
          counts[status] > 0 ? (
            <span
              key={status}
              className={cn("h-full", STAGE_REVIEW_STATUS_FILL[status])}
              style={{ flexGrow: counts[status] }}
            />
          ) : null
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STAGE_REVIEW_STATUS_ORDER.map((status) => {
          const isActive = activeStatuses.includes(status);
          return (
            <button
              key={status}
              type="button"
              aria-pressed={isActive}
              onClick={() => onToggleStatus(status)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 transition",
                isActive ? "border-accent-strong bg-accent-subtle" : "border-subtle bg-surface-1 hover:bg-layer-1"
              )}
            >
              <span className={cn("size-2 rounded-full", STAGE_REVIEW_STATUS_FILL[status])} />
              <span className={isActive ? "text-12 text-accent-primary" : "text-12 text-secondary"}>
                {t(`${I18N}.status.${status}`)}
              </span>
              <b className={isActive ? "text-12 font-semibold tabular-nums text-accent-primary" : "text-12 font-semibold tabular-nums text-primary"}>
                {counts[status]}
              </b>
            </button>
          );
        })}
      </div>
    </div>
  );
};
