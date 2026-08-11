/**
 * 解除关联的二次确认。
 *
 * 单独成一个组件是为了把文案钉在一个地方：解除关联**不删除需求**，但会丢掉本项目内
 * 记录的阶段。这两句话必须同时出现 —— 只说前半句，用户会以为这个操作完全无损。
 */
import { useTranslation } from "@plane/i18n";
import { AlertModalCore } from "@plane/ui";

type TProps = {
  isOpen: boolean;
  isSubmitting: boolean;
  /** 待解除的条数，只用来决定标题的单复数 */
  count: number;
  handleClose: () => void;
  handleSubmit: () => void;
};

export const UnlinkRequirementConfirmModal = ({
  isOpen,
  isSubmitting,
  count,
  handleClose,
  handleSubmit,
}: TProps) => {
  const { t } = useTranslation();

  return (
    <AlertModalCore
      isOpen={isOpen}
      isSubmitting={isSubmitting}
      handleClose={handleClose}
      handleSubmit={handleSubmit}
      title={t("project_requirements.unlink_confirm.title")}
      content={t("project_requirements.unlink_confirm.description", { count })}
      // AlertModalCore 的按钮默认是英文硬编码，本仓库其余调用点也都显式传
      primaryButtonText={{ default: t("project_requirements.unlink"), loading: t("loading") }}
      secondaryButtonText={t("cancel")}
    />
  );
};
