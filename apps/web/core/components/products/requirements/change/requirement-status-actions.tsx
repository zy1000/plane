/**
 * 页面头部按基线状态渲染的动作条。
 *
 * 四种组合：
 * - published：「编辑」
 * - draft 且从未发布：「提交审批」
 * - draft 且曾发布：「提交审批」+「撤回草稿」（提示会恢复到 v{n}）
 * - in_review：提交人「撤回审批」、审批人「去审批」、其余人只看到状态
 */
import { ChevronDown, Pencil, RotateCcw } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Popover } from "@plane/propel/popover";
import type { TRequirementBaseline } from "@plane/types";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import { RequirementBaselineSummary } from "../requirement-baseline-summary";
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

/**
 * 页头的状态 pill，同时是基线摘要的入口。
 *
 * 做成可点开而不是纯展示：pill 紧挨着 <h1>需求</h1>，单独一个「已发布」没有主语，
 * 浮层标题的「需求基线」才把它认领回去；顺带让负责人、审批规则、审批人在不新增
 * 任何横向带的前提下随时可查。
 */
export function RequirementStatusMeta({
  baseline,
  className,
  onViewDetail,
}: {
  baseline: TRequirementBaseline;
  className?: string;
  onViewDetail: () => void;
}) {
  const { t } = useTranslation();
  const { status, current_version: currentVersion } = baseline;

  return (
    <Popover>
      <Popover.Button
        type="button"
        className={cn(
          "flex shrink-0 cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 transition-colors duration-150 hover:bg-layer-transparent-hover motion-reduce:transition-none",
          className
        )}
        aria-label={t("workspace_products.requirements.baseline.summary_title")}
      >
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
        <ChevronDown className="size-3 shrink-0 text-tertiary" />
      </Popover.Button>
      <Popover.Panel
        side="bottom"
        align="start"
        positionerClassName="z-50"
        className="overflow-hidden rounded-lg border border-subtle bg-surface-1 shadow-raised-200"
      >
        <RequirementBaselineSummary baseline={baseline} onViewDetail={onViewDetail} />
      </Popover.Panel>
    </Popover>
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
