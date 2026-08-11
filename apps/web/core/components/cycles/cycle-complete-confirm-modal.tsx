/**
 * 迭代完成的软提示确认框。
 *
 * 触发条件：目标状态为「已完成」且迭代关联需求中仍有 stage 为已立项/已排期的行
 * （即尚未进入任何发布单）。这是**软提示不是门槛**：需求阶段永不阻塞迭代流转
 * （单向依赖铁律），确认后照常完成，这些需求保持「已排期」（carryover 语义）。
 */
import { useTranslation } from "@plane/i18n";
import { AlertModalCore } from "@plane/ui";

type TProps = {
  open: boolean;
  loading: boolean;
  /** 尚未进入发布单的关联需求条数 */
  count: number;
  /** 这些需求的展示名（编号 + 标题），列出来让用户知道是哪几条 */
  requirementNames: string[];
  onCancel: () => void;
  onConfirm: () => void;
};

export const CycleCompleteConfirmModal = ({
  open,
  loading,
  count,
  requirementNames,
  onCancel,
  onConfirm,
}: TProps) => {
  const { t } = useTranslation();

  return (
    <AlertModalCore
      isOpen={open}
      isSubmitting={loading}
      handleClose={onCancel}
      handleSubmit={onConfirm}
      // 软提示不是危险操作，用 primary 的 Info 视觉而不是红色警告
      variant="primary"
      title={t("project_requirements.cycle_complete_confirm.title")}
      // AlertModalCore 会把 content 包进 <p>，列表用 block span 而不是 ul/li
      content={
        <span className="block">
          <span className="block">{t("project_requirements.cycle_complete_confirm.body", { count })}</span>
          {requirementNames.length > 0 && (
            <span className="mt-2 block max-h-40 space-y-1 overflow-y-auto rounded-md bg-layer-2 p-2 vertical-scrollbar scrollbar-sm">
              {requirementNames.map((name, index) => (
                <span key={index} className="block truncate text-12 text-primary" title={name}>
                  {name}
                </span>
              ))}
            </span>
          )}
        </span>
      }
      // AlertModalCore 的按钮默认是英文硬编码，本仓库其余调用点也都显式传
      primaryButtonText={{
        default: t("project_requirements.cycle_complete_confirm.confirm"),
        loading: t("loading"),
      }}
      secondaryButtonText={t("project_requirements.cycle_complete_confirm.cancel")}
    />
  );
};
