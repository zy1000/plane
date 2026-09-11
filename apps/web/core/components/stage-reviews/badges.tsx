import { useTranslation } from "@plane/i18n";
import { EStageReviewResult, EStageReviewStatus } from "@plane/types";
import { cn } from "@plane/utils";

const I18N = "stage_review";

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

export const StageReviewStatusBadge = ({ status, className }: { status: EStageReviewStatus; className?: string }) => {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-11 font-medium whitespace-nowrap",
        STATUS_PILL[status],
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
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
  className,
}: {
  result: EStageReviewResult | "";
  className?: string;
}) => {
  const { t } = useTranslation();
  // 空串 = 还没有结论，用破折号占位，别渲染一个空药丸
  if (!result) return <span className="text-13 text-tertiary">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-11 font-medium whitespace-nowrap",
        RESULT_PILL[result],
        className
      )}
    >
      {t(`${I18N}.result.${result}`)}
    </span>
  );
};
