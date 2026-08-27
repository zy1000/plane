import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";

type Props = {
  displayName: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
};

export function ConfirmProductMemberRemove(props: Props) {
  const { displayName, isOpen, onClose, onConfirm } = props;
  const { t } = useTranslation();
  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={isRemoving ? undefined : onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXL}
    >
      <div className="bg-surface-1 px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
        <div className="sm:flex sm:items-start">
          <div className="mx-auto flex size-12 shrink-0 items-center justify-center rounded-full bg-danger-subtle sm:mx-0 sm:size-10">
            <AlertTriangle className="size-6 text-danger-primary" aria-hidden="true" />
          </div>
          <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
            <h3 className="text-16 leading-6 font-medium text-primary">
              {t("workspace_products.settings.members.remove_confirm_title", { name: displayName })}
            </h3>
            <p className="mt-2 text-13 text-secondary">
              {t("workspace_products.settings.members.remove_confirm_description")}
            </p>
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 p-4 sm:px-6">
        <Button variant="secondary" size="lg" onClick={onClose} disabled={isRemoving}>
          {t("cancel")}
        </Button>
        <Button variant="error-fill" size="lg" onClick={handleRemove} loading={isRemoving}>
          {isRemoving
            ? t("workspace_products.settings.members.removing")
            : t("workspace_products.settings.members.remove")}
        </Button>
      </div>
    </ModalCore>
  );
}
