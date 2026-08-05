/**
 * 页面头部按基线状态渲染的动作条。
 *
 * 四种组合：
 * - published：「编辑」
 * - draft 且从未发布：「提交审批」
 * - draft 且曾发布：「提交审批」+「撤回草稿」（提示会恢复到 v{n}）
 * - in_review：提交人「撤回审批」、审批人「去审批」、其余人只看到状态
 */
import { Pencil, RotateCcw } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { TRequirementBaseline } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import { PILL_BASE, REQUIREMENT_STATUS_PILL } from "./styles";

type TProps = {
  baseline: TRequirementBaseline;
  /** 当前用户是否是待审批变更单的提交人 */
  isSubmitter: boolean;
  isMutating: boolean;
  onEdit: () => void;
  onSubmitReview: () => void;
  onDiscardDraft: () => void;
  onWithdrawReview: () => void;
  onGoApprove: () => void;
};

export function RequirementStatusMeta({ baseline, className }: { baseline: TRequirementBaseline; className?: string }) {
  const { t } = useTranslation();
  const { status, current_version: currentVersion } = baseline;

  return (
    <span className={cn("flex shrink-0 items-center gap-2", className)}>
      <span className={cn(PILL_BASE, REQUIREMENT_STATUS_PILL[status], "text-12")}>
        {t(`workspace_products.requirements.status.${status}`)}
      </span>
      {currentVersion !== null && (
        <span className="hidden text-11 text-tertiary xl:inline">
          {status === "published"
            ? `v${currentVersion}`
            : t("workspace_products.requirements.state.based_on", { version: currentVersion })}
        </span>
      )}
    </span>
  );
}

export function RequirementStatusActions(props: TProps) {
  const {
    baseline,
    isSubmitter,
    isMutating,
    onEdit,
    onSubmitReview,
    onDiscardDraft,
    onWithdrawReview,
    onGoApprove,
  } = props;
  const { t } = useTranslation();
  const { status, current_version: currentVersion } = baseline;
  const hasPublishedVersion = currentVersion !== null;

  return (
    <>
      {status === "published" && baseline.can_edit && (
        <Button variant="primary" loading={isMutating} onClick={onEdit}>
          <Pencil className="size-3.5" />
          {t("workspace_products.requirements.state.edit")}
        </Button>
      )}

      {status === "draft" && baseline.can_edit && (
        <>
          {hasPublishedVersion && (
            <>
              <Button
                variant="secondary"
                disabled={isMutating}
                onClick={onDiscardDraft}
                className="hidden md:inline-flex"
              >
                <RotateCcw className="size-3.5" />
                {t("workspace_products.requirements.state.discard_draft")}
              </Button>
              <CustomMenu
                ellipsis
                closeOnSelect
                placement="bottom-end"
                className="md:hidden"
                buttonClassName="size-7 border border-subtle bg-surface-1"
                ariaLabel={t("workspace_products.requirements.state.more_actions")}
              >
                <CustomMenu.MenuItem className="flex items-center gap-2" onClick={onDiscardDraft}>
                  <RotateCcw className="size-3.5 shrink-0" />
                  {t("workspace_products.requirements.state.discard_draft")}
                </CustomMenu.MenuItem>
              </CustomMenu>
            </>
          )}
          <Button variant="primary" size="lg" disabled={isMutating} onClick={onSubmitReview}>
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
      {status === "in_review" && !isSubmitter && baseline.can_approve && (
        <Button variant="primary" onClick={onGoApprove}>
          {t("workspace_products.requirements.state.go_approve")}
        </Button>
      )}
    </>
  );
}
