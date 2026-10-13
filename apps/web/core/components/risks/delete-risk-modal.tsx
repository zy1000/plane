import { useTranslation } from "@plane/i18n";
import type { TRisk } from "@plane/types";
import { AlertModalCore } from "@plane/ui";

/** 删除确认：列表行尾菜单与详情抽屉共用。编号不会被复用，文案里说清 */
export const DeleteRiskModal = ({
  isOpen,
  risk,
  isSubmitting,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  risk: Pick<TRisk, "id" | "code" | "name"> | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => Promise<unknown> | void;
}) => {
  const { t } = useTranslation();
  return (
    <AlertModalCore
      isOpen={isOpen}
      handleClose={onClose}
      handleSubmit={() => void onConfirm()}
      isSubmitting={isSubmitting}
      title={t("risk.detail.delete_confirm_title")}
      content={t("risk.detail.delete_confirm_description", { code: risk?.code ?? "", name: risk?.name ?? "" })}
    />
  );
};
