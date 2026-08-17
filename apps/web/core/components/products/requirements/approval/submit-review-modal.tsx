/**
 * 提交评审：填变更原因。单条与批量共用。
 */
import { useEffect, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";

export function SubmitReviewModal({
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (isOpen) setReason("");
  }, [isOpen]);

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="p-5">
        <h2 className="text-16 font-semibold text-primary">
          {t("workspace_products.requirements.approval.submit.title")}
        </h2>

        <label className="mt-4 block">
          <span className="mb-2 block text-12 font-medium text-primary">
            {t("workspace_products.requirements.approval.submit.reason")}
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={6}
            maxLength={2000}
            autoFocus
            className="focus:border-accent-primary w-full resize-none rounded-md border border-subtle bg-surface-1 px-3 py-2.5 text-12 leading-5 text-primary outline-none"
          />
        </label>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="secondary" disabled={isSubmitting} onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" loading={isSubmitting} onClick={() => onSubmit(reason.trim())}>
            {t("workspace_products.requirements.approval.submit.confirm")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
