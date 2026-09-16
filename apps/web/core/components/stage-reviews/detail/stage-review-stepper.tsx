import { Check } from "lucide-react";
import { format } from "date-fns";
import { useTranslation } from "@plane/i18n";
import type { TStageReviewActivity, TStageReviewDetail } from "@plane/types";
import { EStageReviewResult, EStageReviewStatus, STAGE_REVIEW_STATUS_ORDER } from "@plane/types";
import { cn } from "@plane/utils";

const I18N = "stage_review";

/** 当前段的填色：跟状态药丸同一套「离完成还有多远」的配色，未评审这一段用主色表示「就在这」 */
const CURRENT_FILL: Record<EStageReviewStatus, string> = {
  [EStageReviewStatus.NOT_STARTED]: "bg-accent-primary",
  [EStageReviewStatus.IN_REVIEW]: "bg-warning-primary",
  [EStageReviewStatus.IN_APPROVAL]: "bg-accent-primary",
  [EStageReviewStatus.COMPLETED]: "bg-success-primary",
};

/**
 * 每一段右侧挂的一句话：走过的段写「哪天离开的」，当前段写「在等谁」。
 *
 * 日期从轨迹里取，只看状态记录（不通过是 field=result 的记录，不参与）：
 * 走过的段取「从它出发」那条记录（old_value）的时间；当前段是已评审时取「进入已评审」
 * 的时间。退回再前进会有多条，都取最近一条。
 */
export const useStepHints = (detail: TStageReviewDetail, activities: TStageReviewActivity[]) => {
  const { t } = useTranslation();
  const enteredAt = new Map<string, string>();
  const leftAt = new Map<string, string>();
  const keepLatest = (map: Map<string, string>, key: string | null, at: string) => {
    if (!key) return;
    const previous = map.get(key);
    if (!previous || previous < at) map.set(key, at);
  };
  for (const activity of activities) {
    if (activity.field !== "status") continue;
    keepLatest(enteredAt, activity.new_value, activity.created_at);
    keepLatest(leftAt, activity.old_value, activity.created_at);
  }
  const shortDate = (iso: string | undefined) => (iso ? format(new Date(iso), "MM-dd") : undefined);

  const currentHint = (() => {
    switch (detail.status) {
      case EStageReviewStatus.NOT_STARTED:
        return t(`${I18N}.detail.step_waiting_start`);
      case EStageReviewStatus.IN_REVIEW:
        if (detail.result === EStageReviewResult.REJECTED) return t(`${I18N}.detail.step_rejected`);
        return detail.leader_detail
          ? t(`${I18N}.detail.step_driven_by`, { name: detail.leader_detail.display_name })
          : t(`${I18N}.detail.step_waiting_leader`);
      case EStageReviewStatus.IN_APPROVAL:
        return detail.auditor_detail
          ? t(`${I18N}.detail.step_waiting_auditor`, { name: detail.auditor_detail.display_name })
          : t(`${I18N}.detail.step_waiting_audit`);
      default:
        return shortDate(enteredAt.get(EStageReviewStatus.COMPLETED));
    }
  })();

  return STAGE_REVIEW_STATUS_ORDER.map((step, index) => {
    if (step === detail.status) return currentHint;
    return index < STAGE_REVIEW_STATUS_ORDER.indexOf(detail.status) ? shortDate(leftAt.get(step)) : undefined;
  });
};

/**
 * 四段进度：每一步是一段实条 + 段名。它只**读**当前走到哪一步，点不动 —— 状态只能由
 * 底部那颗主按钮推进，把步骤做成可点的等于给了一个隐形的状态下拉框。
 *
 * 走过的段绿色打勾，当前段用状态色，没到的段灰色。唯一由结论带来的特例：评审中且
 * 上次不通过，当前段红色。
 */
export const StageReviewStepper = ({
  status,
  result = "",
  hints = [],
}: {
  status: EStageReviewStatus;
  result?: EStageReviewResult | "";
  /** 与 STAGE_REVIEW_STATUS_ORDER 一一对应，见 useStepHints */
  hints?: (string | undefined)[];
}) => {
  const { t } = useTranslation();
  const currentIndex = STAGE_REVIEW_STATUS_ORDER.indexOf(status);
  const currentFill =
    status === EStageReviewStatus.IN_REVIEW && result === EStageReviewResult.REJECTED
      ? "bg-danger-primary"
      : CURRENT_FILL[status];

  return (
    <div className="grid grid-cols-4 gap-2">
      {STAGE_REVIEW_STATUS_ORDER.map((step, index) => {
        const isPast = index < currentIndex;
        const isCurrent = index === currentIndex;
        const showCheck = isPast || (isCurrent && step === EStageReviewStatus.COMPLETED);
        const hint = hints[index];
        return (
          <div key={step} className="flex min-w-0 flex-col gap-2">
            <span
              className={cn("h-1.25 rounded-full bg-layer-3", isPast && "bg-success-primary", isCurrent && currentFill)}
            />
            <span
              className={cn(
                "flex min-w-0 items-center gap-1.5 text-13 whitespace-nowrap text-tertiary",
                isPast && "text-secondary",
                isCurrent && "font-semibold text-primary"
              )}
            >
              <span
                className={cn(
                  "grid size-4.5 shrink-0 place-items-center rounded-full border border-strong text-11 tabular-nums",
                  isPast && "border-transparent bg-success-primary text-on-color",
                  isCurrent && cn("border-transparent text-on-color", currentFill)
                )}
              >
                {showCheck ? <Check className="size-2.5" strokeWidth={3.5} /> : index + 1}
              </span>
              {t(`${I18N}.status.${step}`)}
              {hint && (
                <span className="ml-auto min-w-0 truncate pl-1 text-12 font-normal tabular-nums text-placeholder">
                  {hint}
                </span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
};
