/**
 * 网格里的审批态列。
 *
 * 紧跟勾选框的固定列，而不是最后一列 —— 20 列的网格里最后一列要横滚才看得见，而这是
 * 每行都要扫一眼的信息。它替代了原来的「变更 / 最后变更于」两列：那两列是相对基线版本
 * 的，基线已经不是变更单位了。
 */
import { Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { TRequirement, TRequirementApprovalState } from "@plane/types";
import { cn } from "@plane/utils";

export const REQUIREMENT_APPROVAL_PILL: Record<TRequirementApprovalState, string> = {
  draft: "bg-layer-3 text-primary",
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
      <span className={cn("inline-flex h-5 items-center rounded px-1.5 text-11", REQUIREMENT_APPROVAL_PILL.draft)}>
        {t("requirement_approval.state.draft")}
      </span>
    );
  }

  const state = requirement.approval_state;
  /**
   * 胶囊恒单行：列宽定死 144px，减去两侧 page-x 内边距只剩 100px 上下，
   * 换行的那一行会把整格顶成两行、行高被这一列一个人决定。装不下就省略号，不折行。
   */
  const pill = (
    <span
      className={cn(
        "inline-flex h-5 min-w-0 max-w-full items-center gap-1 whitespace-nowrap rounded px-1.5 text-11 font-medium",
        REQUIREMENT_APPROVAL_PILL[state]
      )}
    >
      {state === "pending_deletion" && <Trash2 className="size-2.5 shrink-0" />}
      <span className="truncate">{t(`requirement_approval.state.${state}`)}</span>
    </span>
  );

  /**
   * 胶囊与版本号并排成一行，不再上下堆叠。
   *
   * 堆两行会把整行撑到 54px，而其余九列都只有一行内容 —— 于是这一列凭空比别人「重」，
   * 整张表的行高也跟着被它一个人决定。表格统一 44px 行高（见 requirement-grid-shared）。
   *
   * 靠左，不居中：一行的总宽随「有没有版本号 / 有没有圆点」而变，居中会让每行胶囊的
   * 左边缘各错开几像素，竖着扫一列时像没对齐。其余列也都是左对齐的。
   */
  return (
    <div className="flex min-w-0 items-center gap-1">
      {requirement.pending_change_request_id && onOpenChangeRequest ? (
        <button
          type="button"
          className="flex min-w-0 items-center"
          onClick={() => onOpenChangeRequest(requirement.pending_change_request_id as string)}
          title={t("requirement_approval.open_change_request")}
        >
          {pill}
        </button>
      ) : (
        pill
      )}
      <span className="flex shrink-0 items-center gap-1 text-11 text-tertiary tabular-nums">
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
