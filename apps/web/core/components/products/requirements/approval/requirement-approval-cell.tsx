/**
 * 网格里的审批态列。
 *
 * 紧跟勾选框的固定列，而不是最后一列 —— 20 列的网格里最后一列要横滚才看得见，而这是
 * 每行都要扫一眼的信息。它替代了原来的「变更 / 最后变更于」两列：那两列是相对基线版本
 * 的，基线已经不是变更单位了。
 */
import { Lock, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirement, TRequirementApprovalState } from "@plane/types";
import { cn } from "@plane/utils";

export const REQUIREMENT_APPROVAL_PILL: Record<TRequirementApprovalState, string> = {
  draft: "bg-layer-2 text-secondary",
  in_review: "bg-warning-subtle text-warning-primary",
  pending_deletion: "bg-danger-subtle text-danger-primary",
  approved: "bg-success-subtle text-success-primary",
  modified: "bg-accent-subtle text-accent-primary",
};

type TProps = {
  requirement: TRequirement | null;
  /** 编辑态下未保存的新行还没有 id，只显示草稿胶囊 */
  isStagedCreate?: boolean;
  onOpenChangeRequest?: (changeRequestId: string) => void;
};

export const RequirementApprovalCell = ({ requirement, isStagedCreate, onOpenChangeRequest }: TProps) => {
  const { t } = useTranslation();

  if (isStagedCreate || !requirement) {
    return (
      <span className={cn("inline-flex h-5 items-center rounded px-1.5 text-10", REQUIREMENT_APPROVAL_PILL.draft)}>
        {t("requirement_approval.state.draft")}
      </span>
    );
  }

  const state = requirement.approval_state;
  const pill = (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded px-1.5 text-10 font-medium",
        REQUIREMENT_APPROVAL_PILL[state]
      )}
    >
      {state === "pending_deletion" && <Trash2 className="size-2.5" />}
      {state === "in_review" && <Lock className="size-2.5" />}
      {t(`requirement_approval.state.${state}`)}
    </span>
  );

  return (
    <div className="flex flex-col items-center gap-0.5">
      {requirement.pending_change_request_id && onOpenChangeRequest ? (
        <button
          type="button"
          onClick={() => onOpenChangeRequest(requirement.pending_change_request_id as string)}
          title={t("requirement_approval.open_change_request")}
        >
          {pill}
        </button>
      ) : (
        pill
      )}
      <span className="flex items-center gap-1 text-10 text-tertiary tabular-nums">
        {requirement.approved_version !== null && `v${requirement.approved_version}`}
        {state === "modified" && (
          <Tooltip tooltipContent={t("requirement_approval.has_unsubmitted_changes")}>
            <span className="text-accent-primary">•</span>
          </Tooltip>
        )}
      </span>
    </div>
  );
};
