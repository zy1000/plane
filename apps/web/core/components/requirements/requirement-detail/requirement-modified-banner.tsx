/**
 * 「通过审批后又改过」时压在标题下的提示条。
 *
 * 它回答用户的两个问题：**我看到的这些值不是评审通过的那一版**（第一行文案），以及
 * **我到底改了什么、能不能退回去、要不要提交**（三个动作）。
 *
 * 退回走的是版本历史里那个回滚端点 —— 同一件事不该有两套实现，区别只在这里叫「放弃
 * 改动」：在版本历史里你是在挑一个版本，在这里你只是想撤销自己刚才干的事。
 *
 * 「提交评审」由调用方注入（onSubmitReview）：弹窗与提交逻辑长在列表页上，这里只放入口 ——
 * 横幅说「尚未提交」却没有提交按钮，用户得回列表找行菜单，等于横幅自己把路堵了。
 */
import { useState } from "react";
import { GitCompareArrows, Pencil, Send, Undo2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TRequirement, TRequirementBuiltinFieldConfig, TRequirementField } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
import { RequirementService } from "@/services/requirement.service";
import { RequirementApprovedDiff } from "./requirement-approved-diff";

const requirementService = new RequirementService();

/** 横幅里的次要动作：透明底、hover 才浮出，与右侧的主按钮拉开层级 */
export const BANNER_GHOST_BUTTON =
  "inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-body-xs-medium text-secondary transition-colors hover:bg-layer-transparent-hover hover:text-primary";

export const RequirementModifiedBanner = ({
  workspaceSlug,
  productId,
  requirement,
  requirementTypeName,
  fields,
  builtinLayout = null,
  readOnly,
  onDiscarded,
  onSubmitReview,
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
  /** 打开提交评审弹窗；不传（项目侧 / 范围抽屉）则不出按钮 */
  onSubmitReview?: () => void;
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
    <div className="rounded-md border border-warning-subtle bg-warning-subtle/30 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Pencil className="size-3.5 shrink-0 text-warning-primary" />
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-body-xs-medium text-primary">{t("requirement_detail.modified_banner.title")}</span>
          <span className="text-caption-sm-regular text-tertiary tabular-nums">
            {t("requirement_detail.modified_banner.approved_version", { version: approvedVersion })}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setIsDiffOpen((current) => !current)}
            className={cn(BANNER_GHOST_BUTTON, isDiffOpen && "bg-layer-transparent-hover text-primary")}
          >
            <GitCompareArrows className="size-3.5" />
            {isDiffOpen
              ? t("requirement_detail.modified_banner.hide_diff")
              : t("requirement_detail.modified_banner.view_diff")}
          </button>
          {!readOnly && (
            <button type="button" onClick={() => setIsConfirmOpen(true)} className={BANNER_GHOST_BUTTON}>
              <Undo2 className="size-3.5" />
              {t("requirement_detail.modified_banner.discard")}
            </button>
          )}
          {onSubmitReview && requirement.can_submit_review && (
            <Button variant="primary" size="lg" className="ml-1" onClick={onSubmitReview}>
              <Send className="size-3.5" />
              {t("requirement_approval.submit_review")}
            </Button>
          )}
        </div>
      </div>

      {isDiffOpen && (
        <div className="mt-2.5 border-t border-warning-subtle pt-3">
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
