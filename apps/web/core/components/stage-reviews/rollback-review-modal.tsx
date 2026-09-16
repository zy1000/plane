import { useEffect, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { EStageReviewStatus } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";

const I18N = "stage_review";

/**
 * 退回弹窗。**理由必填** —— 退回是把已经走过的一步收回来，事后最常被追问的就是「为什么退」，
 * 所以它和「提交审核要带结论」一样属于动作本身，不是可选的补充。
 *
 * 理由只进轨迹里单独一项，与结论说明不共用字段：那一项说的是「结论为什么是它」，这一项说的
 * 是「为什么要退回重来」。规则以后端为准（utils/stage_review.py 的 rollback）。
 */
export const RollbackStageReviewModal = ({
  isOpen,
  targetStatus,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  /** 退回之后落到哪一步，用来把后果写进副标题 */
  targetStatus?: EStageReviewStatus;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) => {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");

  // 每次打开都从空开始：上一次退回的理由不该跟着这一次走
  useEffect(() => {
    if (isOpen) setReason("");
  }, [isOpen]);

  const canSubmit = reason.trim().length > 0;

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="px-6 pt-5.5">
        <h3 className="text-18 font-semibold text-primary">{t(`${I18N}.rollback.title`)}</h3>
        <p className="mt-1 text-12 text-tertiary">
          {targetStatus
            ? t(`${I18N}.rollback.description`, { status: t(`${I18N}.status.${targetStatus}`) })
            : t(`${I18N}.rollback.description_plain`)}
        </p>
      </div>

      <div className="px-6 py-5">
        <label className="mb-2 block text-12 font-medium text-primary">
          {t(`${I18N}.rollback.reason`)}
          <span className="ml-0.5 text-danger-primary">*</span>
        </label>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t(`${I18N}.rollback.reason_placeholder`)}
          className={cn(
            "min-h-18 w-full rounded-lg border border-subtle bg-surface-1 px-3 py-2.5 text-13 leading-relaxed",
            "text-primary placeholder:text-tertiary focus:border-accent-strong focus:outline-none"
          )}
        />
      </div>

      <div className="flex justify-end gap-2 px-6 pb-5.5">
        <Button variant="neutral-primary" size="sm" onClick={onClose}>
          {t(`${I18N}.actions.cancel`)}
        </Button>
        <Button variant="primary" size="sm" disabled={!canSubmit || isSubmitting} onClick={() => onSubmit(reason.trim())}>
          {t(`${I18N}.rollback.confirm`)}
        </Button>
      </div>
    </ModalCore>
  );
};
