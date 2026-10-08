import { useEffect, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TStageReviewDetail, TSubmitStageReviewPayload } from "@plane/types";
import { EStageReviewResult } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { joinPeopleNames } from "./people";

const I18N = "stage_review";

const RESULTS: EStageReviewResult[] = [
  EStageReviewResult.PASSED,
  EStageReviewResult.REJECTED,
  EStageReviewResult.WAIVED,
  EStageReviewResult.CONDITIONAL,
];

/** 只有「通过」的说明是选填，其余三种都要写清楚为什么是这个结论 */
const isReasonRequired = (result: EStageReviewResult | "") => Boolean(result) && result !== EStageReviewResult.PASSED;

/** 说明框的提示语按结论换：问的不是同一件事 */
const REASON_PLACEHOLDER: Record<EStageReviewResult, string> = {
  [EStageReviewResult.PASSED]: "reason_placeholder_passed",
  [EStageReviewResult.REJECTED]: "reason_placeholder_rejected",
  [EStageReviewResult.WAIVED]: "reason_placeholder_waived",
  [EStageReviewResult.CONDITIONAL]: "reason_placeholder_conditional",
};

/** 选中时的配色：条件通过琥珀、不通过红，其余主色 */
const OPTION_TONE: Partial<Record<EStageReviewResult, string>> = {
  [EStageReviewResult.CONDITIONAL]: "border-warning-strong bg-warning-subtle text-warning-primary ring-warning-strong",
  [EStageReviewResult.REJECTED]: "border-danger-strong bg-danger-subtle text-danger-primary ring-danger-strong",
};

/** 分段选择的一格 */
const Option = ({
  active,
  tone,
  children,
  onClick,
}: {
  active: boolean;
  tone?: string;
  children: React.ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "grid h-9.5 place-items-center rounded-lg border border-subtle bg-surface-1 px-2 text-13 text-secondary transition",
      "hover:border-strong",
      active && "border-accent-strong bg-accent-subtle font-semibold text-accent-primary ring-1 ring-accent-primary",
      active && tone
    )}
  >
    {children}
  </button>
);

/**
 * 提交审核弹窗。
 *
 * 规则都在这一屏里：**评审结果是提交的门槛**（不选就点不动主按钮）；**结论决定落点**
 * —— 不通过留在评审中，其余（通过 / 免审 / 条件通过）都进审核中，副标题与主按钮跟着结论
 * 说清楚点下去会发生什么；**结论说明常显**，除「通过」外都必填。前后端两侧同一套判断，
 * 后端那份才是规则本身（utils/stage_review.py）。O 阶段的生产方式 / 出货评估在右栏随时改，
 * 不在这里填。
 */
export const SubmitStageReviewModal = ({
  isOpen,
  detail,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  detail: TStageReviewDetail;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: TSubmitStageReviewPayload) => void;
}) => {
  const { t } = useTranslation();
  const [result, setResult] = useState<EStageReviewResult | "">(detail.result);
  const [reason, setReason] = useState(detail.conditional_reason);

  // 退回后再提交是常态：每次打开都拿当前评审上的值做初值
  useEffect(() => {
    if (!isOpen) return;
    setResult(detail.result);
    setReason(detail.conditional_reason);
  }, [isOpen, detail]);

  /** 换结论时说明跟着换：条件通过的放行条件不能原样变成不通过的整改要求；切回原结论则还原 */
  const pickResult = (option: EStageReviewResult) => {
    setResult(option);
    setReason(option === detail.result ? detail.conditional_reason : "");
  };

  const needsReason = isReasonRequired(result);
  const canSubmit = Boolean(result) && (!needsReason || reason.trim().length > 0);

  const effect = (() => {
    if (!result) return t(`${I18N}.submit.description`);
    if (result === EStageReviewResult.REJECTED) return t(`${I18N}.submit.effect_rejected`);
    if (detail.auditor_details.length === 0) return t(`${I18N}.submit.effect_approval_no_auditor`);
    return t(`${I18N}.submit.${detail.auditor_details.length > 1 ? "effect_approval_any" : "effect_approval"}`, {
      auditor: joinPeopleNames(detail.auditor_details),
    });
  })();

  const confirmLabel =
    result === EStageReviewResult.REJECTED
      ? t(`${I18N}.submit.confirm_rejected`)
      : t(`${I18N}.actions.submit_for_approval`);

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="px-6 pt-5.5">
        <h3 className="text-18 font-semibold text-primary">{t(`${I18N}.submit.title`)}</h3>
        <p
          className={cn(
            "mt-1 text-12 text-tertiary",
            result === EStageReviewResult.REJECTED && "text-danger-primary"
          )}
        >
          {effect}
        </p>
      </div>

      <div className="flex flex-col gap-4.5 px-6 py-5">
        <div>
          <label className="mb-2 block text-12 font-medium text-primary">
            {t(`${I18N}.submit.result`)}
            <span className="ml-0.5 text-danger-primary">*</span>
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {RESULTS.map((option) => (
              <Option
                key={option}
                active={result === option}
                tone={OPTION_TONE[option]}
                onClick={() => pickResult(option)}
              >
                {t(`${I18N}.result.${option}`)}
              </Option>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-12 font-medium text-primary">
            {t(`${I18N}.submit.reason`)}
            {needsReason ? (
              <span className="ml-0.5 text-danger-primary">*</span>
            ) : (
              <span className="ml-1 font-normal text-tertiary">{t(`${I18N}.submit.reason_optional`)}</span>
            )}
          </label>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={
              result
                ? t(`${I18N}.submit.${REASON_PLACEHOLDER[result]}`)
                : t(`${I18N}.submit.reason_placeholder`)
            }
            className={cn(
              "min-h-18 w-full rounded-lg border border-subtle bg-surface-1 px-3 py-2.5 text-13 leading-relaxed",
              "text-primary placeholder:text-tertiary focus:border-accent-strong focus:outline-none"
            )}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 px-6 pb-5.5">
        <Button variant="neutral-primary" size="sm" onClick={onClose}>
          {t(`${I18N}.actions.cancel`)}
        </Button>
        <Button
          variant={result === EStageReviewResult.REJECTED ? "error-fill" : "primary"}
          size="sm"
          disabled={!canSubmit || isSubmitting}
          onClick={() =>
            onSubmit({
              result: result as EStageReviewResult,
              conditional_reason: reason.trim(),
            })
          }
        >
          {confirmLabel}
        </Button>
      </div>
    </ModalCore>
  );
};
