/** 提交前填变更原因。首次发布与后续变更共用这个弹窗。 */
import { useEffect, useState } from "react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";

export function SubmitChangeModal({
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
          {t("workspace_products.requirements.change.submit.title")}
        </h2>
        <p className="mt-1 text-12 leading-5 text-secondary">
          {t("workspace_products.requirements.change.submit.description")}
        </p>
        <label className="mt-4 block">
          <span className="mb-2 block text-12 font-medium text-primary">
            {t("workspace_products.requirements.change.submit.reason")}
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={2000}
            autoFocus
            className="focus:border-accent-primary w-full resize-none rounded-md border border-subtle bg-surface-1 px-3 py-2.5 text-12 leading-5 text-primary outline-none placeholder:text-placeholder"
            placeholder={t("workspace_products.requirements.change.submit.reason_placeholder")}
          />
        </label>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="secondary" disabled={isSubmitting} onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" loading={isSubmitting} onClick={() => onSubmit(reason.trim())}>
            {t("workspace_products.requirements.change.submit.confirm")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
