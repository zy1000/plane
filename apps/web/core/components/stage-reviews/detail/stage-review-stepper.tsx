import { Fragment } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { EStageReviewStatus, STAGE_REVIEW_STATUS_ORDER } from "@plane/types";
import { cn } from "@plane/utils";

const I18N = "stage_review";

/**
 * 四步进度条：四个小圆点用一条细线连起来。
 *
 * 它只是**读**当前走到哪一步，点不动 —— 状态只能由底部那颗主按钮一步步推进（产品
 * 决策），把步骤做成可点的等于给了一个隐形的状态下拉框。既然点不动，它就不该比主按钮
 * 还重，所以是一条线而不是一排色块。
 */
export const StageReviewStepper = ({ status }: { status: EStageReviewStatus }) => {
  const { t } = useTranslation();
  const currentIndex = STAGE_REVIEW_STATUS_ORDER.indexOf(status);

  return (
    <div className="flex items-center">
      {STAGE_REVIEW_STATUS_ORDER.map((step, index) => {
        const isPast = index < currentIndex;
        const isCurrent = index === currentIndex;
        return (
          <Fragment key={step}>
            {index > 0 && (
              <span
                className={cn(
                  "mx-2.5 h-px flex-1 border-t",
                  index <= currentIndex ? "border-success-strong" : "border-subtle"
                )}
              />
            )}
            <span
              className={cn(
                "flex items-center gap-1.5 text-12 whitespace-nowrap text-tertiary",
                isPast && "text-secondary",
                isCurrent && "font-semibold text-primary"
              )}
            >
              <span
                className={cn(
                  "grid size-4.5 shrink-0 place-items-center rounded-full border text-10 tabular-nums",
                  "border-strong text-tertiary",
                  isPast && "border-success-strong bg-success-primary text-on-color",
                  isCurrent && "border-warning-strong bg-warning-primary text-on-color"
                )}
              >
                {isPast ? <Check className="size-2.5" strokeWidth={3.5} /> : index + 1}
              </span>
              {t(`${I18N}.status.${step}`)}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
};
