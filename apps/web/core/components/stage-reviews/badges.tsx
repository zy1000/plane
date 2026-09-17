import { useTranslation } from "@plane/i18n";
import { EStageReviewResult, EStageReviewStatus } from "@plane/types";
import { cn } from "@plane/utils";

const I18N = "stage_review";

/**
 * 药丸只有两种尺寸，抽屉里不再各处覆写：
 * - sm：活动区、右栏结论里的方角小药丸，22px / 12 号
 * - md：抽屉标题行的状态药丸，28px 圆角 / 13 号
 */
type TPillSize = "sm" | "md";

const PILL_SIZE: Record<TPillSize, string> = {
  sm: "h-5.5 gap-1.5 rounded-md px-2 text-12 [&>span]:size-1.5",
  md: "h-7 gap-2 rounded-full px-3 text-13 [&>span]:size-2",
};

/**
 * 状态药丸。四个状态是一条线上的四步，配色跟着「离完成还有多远」走：
 * 灰（没开始）→ 琥珀（在评）→ 蓝（在审）→ 绿（评完）。
 */
const STATUS_PILL: Record<EStageReviewStatus, string> = {
  [EStageReviewStatus.NOT_STARTED]: "bg-layer-2 text-tertiary",
  [EStageReviewStatus.IN_REVIEW]: "bg-warning-subtle text-warning-primary",
  [EStageReviewStatus.IN_APPROVAL]: "bg-accent-subtle text-accent-primary",
  [EStageReviewStatus.COMPLETED]: "bg-success-subtle text-success-primary",
};

export const StageReviewStatusBadge = ({
  status,
  size = "sm",
  className,
}: {
  status: EStageReviewStatus;
  size?: TPillSize;
  className?: string;
}) => {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center font-medium whitespace-nowrap",
        PILL_SIZE[size],
        STATUS_PILL[status],
        className
      )}
    >
      <span className="rounded-full bg-current" />
      {t(`${I18N}.status.${status}`)}
    </span>
  );
};

/** 结论药丸。免审是中性色 —— 它不是「评过了」，是「这次不用评」 */
const RESULT_PILL: Record<EStageReviewResult, string> = {
  [EStageReviewResult.PASSED]: "bg-success-subtle text-success-primary",
  [EStageReviewResult.REJECTED]: "bg-danger-subtle text-danger-primary",
  [EStageReviewResult.WAIVED]: "bg-layer-2 text-tertiary",
  [EStageReviewResult.CONDITIONAL]: "bg-warning-subtle text-warning-primary",
};

export const StageReviewResultBadge = ({
  result,
  size = "sm",
  className,
}: {
  result: EStageReviewResult | "";
  size?: TPillSize;
  className?: string;
}) => {
  const { t } = useTranslation();
  // 空串 = 还没有结论，用破折号占位，别渲染一个空药丸
  if (!result) return <span className="text-14 text-placeholder">—</span>;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center font-medium whitespace-nowrap",
        PILL_SIZE[size],
        RESULT_PILL[result],
        className
      )}
    >
      {t(`${I18N}.result.${result}`)}
    </span>
  );
};
