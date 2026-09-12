import { AlertTriangle, Check, Lock, MessageSquare, Minus } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { TReviewTailoringItem } from "@plane/types";
import { Checkbox } from "@plane/ui";
import { cn } from "@plane/utils";
import { getCellLockReason } from "./tailoring-matrix-model";

/** 已生成评审的格子挂一枚状态药丸，四种状态与阶段评审页同一套颜色 */
const REVIEW_STATUS_PILL: Record<string, string> = {
  not_started: "bg-layer-3 text-tertiary",
  in_review: "bg-accent-subtle text-accent-primary",
  in_approval: "bg-warning-subtle text-warning-primary",
  completed: "bg-success-subtle text-success-primary",
};

/**
 * 只读时的勾选标记。禁用态的 Checkbox 会把勾画成灰的，签批中 / 已生效时一眼分不清勾没勾，
 * 所以只读一律画成静态的浅蓝勾。
 */
export const ReadonlyCheck = ({ checked, indeterminate = false }: { checked: boolean; indeterminate?: boolean }) => (
  <span
    className={cn(
      "grid size-4 shrink-0 place-items-center rounded-sm border",
      checked || indeterminate ? "border-transparent bg-accent-primary/70 text-on-color" : "border-subtle bg-surface-1"
    )}
  >
    {checked ? (
      <Check className="size-3" strokeWidth={3} />
    ) : indeterminate ? (
      <Minus className="size-3" strokeWidth={3} />
    ) : null}
  </span>
);

/**
 * 矩阵的一格。四种样子：
 * - 勾上：蓝色勾选框；已生成评审的再挂状态药丸，已评审完成的换成锁（不能裁掉）
 * - 裁掉：灰底，原因直接印在格里，点开可改
 * - 裁掉但没写原因：琥珀色的「写原因」
 * - 有未保存的改动：右上角一枚蓝色角标
 */
export const MatrixCell = ({
  cell,
  editable,
  isDirty,
  isReasonOpen,
  onToggle,
  onOpenReason,
}: {
  cell: TReviewTailoringItem;
  editable: boolean;
  isDirty: boolean;
  isReasonOpen: boolean;
  onToggle: (selected: boolean) => void;
  onOpenReason: (anchor: HTMLElement) => void;
}) => {
  const { t } = useTranslation();
  const lock = getCellLockReason(cell, !cell.selected);
  const reason = cell.reason.trim();
  const missing = !cell.selected && !reason;

  return (
    <td
      className={cn(
        "relative h-11.5 w-[156px] min-w-[156px] border-b border-l border-subtle px-3",
        !cell.selected && "bg-layer-1",
        isReasonOpen && "shadow-[inset_0_0_0_1.5px_var(--border-color-accent-strong)]"
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {lock === "locked_completed" ? (
          <Tooltip tooltipContent={t(`review_tailoring.matrix.${lock}`)}>
            <span className="grid size-4 shrink-0 place-items-center rounded-sm border border-subtle bg-layer-3 text-placeholder">
              <Lock className="size-2.5" strokeWidth={2.6} />
            </span>
          </Tooltip>
        ) : !editable ? (
          <ReadonlyCheck checked={cell.selected} />
        ) : (
          <Tooltip tooltipContent={lock ? t(`review_tailoring.matrix.${lock}`) : ""} disabled={!lock}>
            <span className="flex shrink-0 items-center">
              <Checkbox
                checked={cell.selected}
                disabled={Boolean(lock)}
                onChange={(event) => onToggle(event.target.checked)}
              />
            </span>
          </Tooltip>
        )}

        {cell.stage_review_id && cell.stage_review_status && (
          <span
            className={cn(
              "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5 text-11 font-medium whitespace-nowrap",
              REVIEW_STATUS_PILL[cell.stage_review_status] ?? REVIEW_STATUS_PILL.not_started
            )}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {t(`stage_review.status.${cell.stage_review_status}`)}
          </span>
        )}

        {!cell.selected && (reason || editable || missing) && (
          <button
            type="button"
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1 rounded-sm text-left text-12",
              missing ? "font-medium text-warning-primary" : "text-tertiary hover:text-secondary",
              !editable && !reason && "cursor-default"
            )}
            title={reason || undefined}
            onClick={(event) => {
              if (!editable && !reason) return;
              onOpenReason(event.currentTarget.closest("td") ?? event.currentTarget);
            }}
          >
            {missing ? (
              <AlertTriangle className="size-3 shrink-0" strokeWidth={2.4} />
            ) : (
              <MessageSquare className="size-3 shrink-0" />
            )}
            <span className="truncate">
              {reason ||
                (editable ? t("review_tailoring.matrix.write_reason") : t("review_tailoring.matrix.reason_missing"))}
            </span>
          </button>
        )}
      </div>
      {isDirty && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-accent-primary" aria-hidden />}
    </td>
  );
};
