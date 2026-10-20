import { useTranslation } from "@plane/i18n";
import type { TRisk } from "@plane/types";
import { AlertModalCore } from "@plane/ui";

/** 删除确认：列表行尾菜单与详情抽屉共用。已同步到简道云的，那边的记录会一起删，文案里说清 */
export const DeleteRiskModal = ({
  isOpen,
  risk,
  isSubmitting,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  risk: Pick<TRisk, "id" | "code" | "name" | "external_id"> | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => Promise<unknown> | void;
}) => {
  const { t } = useTranslation();
  const title = [risk?.code, risk?.name].filter(Boolean).join(" ");
  const description = t("risk.detail.delete_confirm_description", { title });
  return (
    <AlertModalCore
      isOpen={isOpen}
      handleClose={onClose}
      handleSubmit={() => void onConfirm()}
      isSubmitting={isSubmitting}
      title={t("risk.detail.delete_confirm_title")}
      content={risk?.external_id ? `${description} ${t("risk.detail.delete_sync_note")}` : description}
    />
  );
};
