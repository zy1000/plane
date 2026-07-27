/**
 * 详情页头部按状态渲染的动作条。
 *
 * 四种组合：
 * - published：「编辑」
 * - draft 且从未发布：「提交审批」+「删除需求」
 * - draft 且曾发布：「提交审批」+「撤回草稿」（提示会恢复到 v{n}）
 * - in_review：提交人「撤回审批」、审批人「去审批」、其余人只看到状态
 */
import { Pencil, RotateCcw, Send, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TRequirement } from "@plane/types";
import { cn } from "@plane/utils";
import { PILL_BASE, REQUIREMENT_STATUS_PILL } from "./styles";

type TProps = {
  requirement: TRequirement;
  /** 当前用户是否是待审批变更单的提交人 */
  isSubmitter: boolean;
  isMutating: boolean;
  onEdit: () => void;
  onSubmitReview: () => void;
  onDiscardDraft: () => void;
  onWithdrawReview: () => void;
  onGoApprove: () => void;
};

export function RequirementStatusActions(props: TProps) {
  const {
    requirement,
    isSubmitter,
    isMutating,
    onEdit,
    onSubmitReview,
    onDiscardDraft,
    onWithdrawReview,
    onGoApprove,
  } = props;
  const { t } = useTranslation();
  const { status, current_version: currentVersion } = requirement;
  const hasPublishedVersion = currentVersion !== null;

  return (
    <>
      <span className={cn(PILL_BASE, REQUIREMENT_STATUS_PILL[status])}>
        {t(`workspace_products.requirements.status.${status}`)}
      </span>
      {hasPublishedVersion && (
        <span className="text-11 text-tertiary">
          {status === "published"
            ? `v${currentVersion}`
            : t("workspace_products.requirements.state.based_on", { version: currentVersion })}
        </span>
      )}

      {status === "published" && requirement.can_edit && (
        <Button variant="primary" loading={isMutating} onClick={onEdit}>
          <Pencil className="size-3.5" />
          {t("workspace_products.requirements.state.edit")}
        </Button>
      )}

      {status === "draft" && requirement.can_edit && (
        <>
          <Button variant="secondary" disabled={isMutating} onClick={onDiscardDraft}>
            {hasPublishedVersion ? <RotateCcw className="size-3.5" /> : <Trash2 className="size-3.5" />}
            {t(
              hasPublishedVersion
                ? "workspace_products.requirements.state.discard_draft"
                : "workspace_products.requirements.state.delete_requirement"
            )}
          </Button>
          <Button variant="primary" disabled={isMutating} onClick={onSubmitReview}>
            <Send className="size-3.5" />
            {t("workspace_products.requirements.state.submit_review")}
          </Button>
        </>
      )}

      {status === "in_review" && isSubmitter && (
        <Button variant="secondary" disabled={isMutating} onClick={onWithdrawReview}>
          <RotateCcw className="size-3.5" />
          {t("workspace_products.requirements.state.withdraw_review")}
        </Button>
      )}
      {status === "in_review" && !isSubmitter && requirement.can_approve && (
        <Button variant="primary" onClick={onGoApprove}>
          {t("workspace_products.requirements.state.go_approve")}
        </Button>
      )}
    </>
  );
}
