/**
 * 「通过审批后又改过」时压在标题下的提示条。
 *
 * 它回答用户的两个问题：**我看到的这些值不是评审通过的那一版**（第一行文案），以及
 * **我到底改了什么、能不能退回去**（两个动作）。
 *
 * 退回走的是版本历史里那个回滚端点 —— 同一件事不该有两套实现，区别只在这里叫「放弃
 * 改动」：在版本历史里你是在挑一个版本，在这里你只是想撤销自己刚才干的事。
 */
import { useState } from "react";
import { GitCompareArrows, Undo2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirement, TRequirementBuiltinFieldConfig, TRequirementField } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { RequirementService } from "@/services/requirement.service";
import { RequirementApprovedDiff } from "./requirement-approved-diff";

const requirementService = new RequirementService();

export const RequirementModifiedBanner = ({
  workspaceSlug,
  productId,
  requirement,
  requirementTypeName,
  fields,
  builtinLayout = null,
  readOnly,
  onDiscarded,
}: {
  workspaceSlug: string;
  productId: string;
  requirement: TRequirement;
  requirementTypeName: string;
  fields: TRequirementField[];
  /** 该需求类型的内置字段布局；null 回退现状顺序 */
  builtinLayout?: TRequirementBuiltinFieldConfig[] | null;
  /** 行在评审中或没有写权限时不给「放弃改动」—— 服务端也会再拦一道 */
  readOnly: boolean;
  onDiscarded?: () => void;
}) => {
  const { t } = useTranslation();
  const [isDiffOpen, setIsDiffOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isDiscarding, setIsDiscarding] = useState(false);

  const approvedVersion = requirement.approved_version;
  if (requirement.approval_state !== "modified" || approvedVersion === null) return null;

  const discard = async () => {
    setIsDiscarding(true);
    try {
      await requirementService.rollbackRequirement(workspaceSlug, productId, requirement.id, approvedVersion);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("success"),
        // 这里回到的就是已通过的那一版，没有什么要「重新提交」的
        message: t("requirement_detail.modified_banner.discarded", { version: approvedVersion }),
      });
      setIsConfirmOpen(false);
      setIsDiffOpen(false);
      onDiscarded?.();
    } catch (error) {
      const payload = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: payload?.error ?? t("requirement_detail.versions.rollback_failed"),
      });
    } finally {
      setIsDiscarding(false);
    }
  };

  return (
    <div className="rounded-md border border-warning-subtle bg-warning-subtle/30 px-3 py-2.5">
      <p className="text-12 leading-5 text-primary">
        {t("requirement_detail.modified_banner.title", { version: approvedVersion })}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1">
        <button
          type="button"
          onClick={() => setIsDiffOpen((current) => !current)}
          className="flex items-center gap-1 text-11 text-accent-primary hover:underline"
        >
          <GitCompareArrows className="size-3" />
          {isDiffOpen
            ? t("requirement_detail.modified_banner.hide_diff")
            : t("requirement_detail.modified_banner.view_diff", { version: approvedVersion })}
        </button>
        {!readOnly && (
          <button
            type="button"
            onClick={() => setIsConfirmOpen(true)}
            className="flex items-center gap-1 text-11 text-secondary hover:text-primary"
          >
            <Undo2 className="size-3" />
            {t("requirement_detail.modified_banner.discard", { version: approvedVersion })}
          </button>
        )}
      </div>

      {isDiffOpen && (
        <div className="mt-3 border-t border-warning-subtle pt-3">
          <RequirementApprovedDiff
            workspaceSlug={workspaceSlug}
            productId={productId}
            requirement={requirement}
            requirementTypeName={requirementTypeName}
            fields={fields}
            builtinLayout={builtinLayout}
          />
        </div>
      )}

      <AlertModalCore
        isOpen={isConfirmOpen}
        isSubmitting={isDiscarding}
        handleClose={() => setIsConfirmOpen(false)}
        handleSubmit={() => void discard()}
        title={t("requirement_detail.modified_banner.discard_title")}
        content={t("requirement_detail.modified_banner.discard_description", { version: approvedVersion })}
        primaryButtonText={{
          default: t("requirement_detail.versions.rollback_confirm"),
          loading: t("requirement_detail.versions.rollback_confirm"),
        }}
        secondaryButtonText={t("cancel")}
      />
    </div>
  );
};
