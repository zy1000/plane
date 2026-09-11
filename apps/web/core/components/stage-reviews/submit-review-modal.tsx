import { useEffect, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TProductionMode, TShipmentAssessment, TStageReviewDetail, TSubmitStageReviewPayload } from "@plane/types";
import {
  EStageReviewKind,
  EStageReviewResult,
  PRODUCTION_MODES,
  SHIPMENT_ASSESSMENTS,
} from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";

const I18N = "stage_review";

const RESULTS: EStageReviewResult[] = [
  EStageReviewResult.PASSED,
  EStageReviewResult.REJECTED,
  EStageReviewResult.WAIVED,
  EStageReviewResult.CONDITIONAL,
];

const O_STAGE_KINDS: EStageReviewKind[] = [EStageReviewKind.O_STAGE_REVIEW, EStageReviewKind.O_STAGE_ACTIVITY];

/** 分段选择的一格 */
const Option = ({
  active,
  warn,
  children,
  onClick,
}: {
  active: boolean;
  warn?: boolean;
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
      active && warn && "border-warning-strong bg-warning-subtle text-warning-primary ring-warning-strong"
    )}
  >
    {children}
  </button>
);

/**
 * 提交审核弹窗。
 *
 * 三条规则都在这一屏里：**评审结果是提交的门槛**（不选就点不动主按钮）；选中「条件
 * 通过」才展开原因，且原因必填；**生产方式与出货评估只在 O 阶段的两种类型上出现**，
 * 出现了就必填。前后端两侧同一套判断，后端那份才是规则本身（utils/stage_review.py）。
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
  const isOStage = O_STAGE_KINDS.includes(detail.kind);

  const [result, setResult] = useState<EStageReviewResult | "">(detail.result);
  const [reason, setReason] = useState(detail.conditional_reason);
  const [productionMode, setProductionMode] = useState<TProductionMode | "">(detail.production_mode);
  const [shipment, setShipment] = useState<TShipmentAssessment | "">(detail.shipment_assessment);

  // 退回后再提交是常态：每次打开都拿当前评审上的值做初值
  useEffect(() => {
    if (!isOpen) return;
    setResult(detail.result);
    setReason(detail.conditional_reason);
    setProductionMode(detail.production_mode);
    setShipment(detail.shipment_assessment);
  }, [isOpen, detail]);

  const isConditional = result === EStageReviewResult.CONDITIONAL;
  const canSubmit =
    Boolean(result) &&
    (!isConditional || reason.trim().length > 0) &&
    (!isOStage || (Boolean(productionMode) && Boolean(shipment)));

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="px-6 pt-5.5">
        <h3 className="text-18 font-semibold text-primary">{t(`${I18N}.submit.title`)}</h3>
        <p className="mt-1 text-12 text-tertiary">
          {detail.auditor_detail
            ? t(`${I18N}.submit.description`, { auditor: detail.auditor_detail.display_name })
            : t(`${I18N}.submit.description_no_auditor`)}
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
                warn={option === EStageReviewResult.CONDITIONAL}
                onClick={() => setResult(option)}
              >
                {t(`${I18N}.result.${option}`)}
              </Option>
            ))}
          </div>
        </div>

        {isConditional && (
          <div>
            <label className="mb-2 block text-12 font-medium text-primary">
              {t(`${I18N}.submit.conditional_reason`)}
              <span className="ml-0.5 text-danger-primary">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={t(`${I18N}.submit.conditional_reason_placeholder`)}
              className={cn(
                "min-h-18 w-full rounded-lg border border-subtle bg-surface-1 px-3 py-2.5 text-13 leading-relaxed",
                "text-primary placeholder:text-tertiary focus:border-accent-strong focus:outline-none"
              )}
            />
          </div>
        )}

        {isOStage && (
          <>
            <div>
              <label className="mb-2 block text-12 font-medium text-primary">
                {t(`${I18N}.submit.production_mode`)}
                <span className="ml-0.5 text-danger-primary">*</span>
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {PRODUCTION_MODES.map((option) => (
                  <Option key={option} active={productionMode === option} onClick={() => setProductionMode(option)}>
                    {t(`${I18N}.production_mode.${option}`)}
                  </Option>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-12 font-medium text-primary">
                {t(`${I18N}.submit.shipment_assessment`)}
                <span className="ml-0.5 text-danger-primary">*</span>
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {SHIPMENT_ASSESSMENTS.map((option) => (
                  <Option key={option} active={shipment === option} onClick={() => setShipment(option)}>
                    {t(`${I18N}.shipment_assessment.${option}`)}
                  </Option>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex justify-end gap-2 px-6 pb-5.5">
        <Button variant="neutral-primary" size="sm" onClick={onClose}>
          {t(`${I18N}.actions.cancel`)}
        </Button>
        <Button
          variant="primary"
          size="sm"
          disabled={!canSubmit || isSubmitting}
          onClick={() =>
            onSubmit({
              result: result as EStageReviewResult,
              conditional_reason: isConditional ? reason.trim() : "",
              production_mode: isOStage ? productionMode : "",
              shipment_assessment: isOStage ? shipment : "",
            })
          }
        >
          {t(`${I18N}.actions.submit_for_approval`)}
        </Button>
      </div>
    </ModalCore>
  );
};
