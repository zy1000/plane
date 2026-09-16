import { useEffect, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";

const I18N = "stage_review";

/**
 * 审核通过弹窗。审核意见**选填** —— 通过本身就是结论，多数时候没什么要说；有话才写。
 *
 * 意见与退回理由同口径，只进轨迹里单独一项（`extra.approval_comment`），不落评审字段。
 * 规则以后端为准（utils/stage_review.py 的 advance）。
 */
export const ApproveStageReviewModal = ({
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (comment: string) => void;
}) => {
  const { t } = useTranslation();
  const [comment, setComment] = useState("");

  // 每次打开都从空开始
  useEffect(() => {
    if (isOpen) setComment("");
  }, [isOpen]);

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="px-6 pt-5.5">
        <h3 className="text-18 font-semibold text-primary">{t(`${I18N}.approve.title`)}</h3>
        <p className="mt-1 text-12 text-tertiary">{t(`${I18N}.approve.description`)}</p>
      </div>

      <div className="px-6 py-5">
        <label className="mb-2 block text-12 font-medium text-primary">
          {t(`${I18N}.approve.comment`)}
          <span className="ml-1 font-normal text-tertiary">{t(`${I18N}.submit.reason_optional`)}</span>
        </label>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={t(`${I18N}.approve.comment_placeholder`)}
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
        <Button variant="primary" size="sm" disabled={isSubmitting} onClick={() => onSubmit(comment.trim())}>
          {t(`${I18N}.approve.confirm`)}
        </Button>
      </div>
    </ModalCore>
  );
};
