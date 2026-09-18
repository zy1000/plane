import { AlertTriangle, MessageSquare } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { TReviewTailoringItem } from "@plane/types";
import { cn } from "@plane/utils";
import { KeepCutSegment } from "./keep-cut-segment";
import { getCellLockReason, isCompletedCut } from "./tailoring-matrix-model";

/** 已生成评审的格子挂一枚状态药丸，四种状态与阶段评审页同一套颜色 */
const REVIEW_STATUS_PILL: Record<string, string> = {
  not_started: "bg-layer-3 text-tertiary",
  in_review: "bg-accent-subtle text-accent-primary",
  in_approval: "bg-warning-subtle text-warning-primary",
  completed: "bg-success-subtle text-success-primary",
};

/**
 * 矩阵的一格：「保留 | 裁剪」控件 + 右侧一条信息。
 * - 保留：右侧是评审状态药丸（生成过评审才有）
 * - 裁剪：原因直接写在格里，点开弹窗编辑；没写原因是琥珀色的「补充裁剪原因」
 * - 有未保存的改动：右上角一枚蓝色角标
 *
 * 裁剪格不铺底色：一张表整屏都是裁剪项是常态，铺了会把整个表面染灰，
 * 连阶段行和表头都分不出来。状态由「保留 | 裁剪」和原因那条文字表达。
 */
export const MatrixCell = ({
  cell,
  editable,
  isDirty,
  isSelected,
  className,
  onToggle,
  onOpenReason,
}: {
  cell: TReviewTailoringItem;
  editable: boolean;
  isDirty: boolean;
  /** 被批量选中：整格涂淡蓝 */
  isSelected: boolean;
  /** 整行要加的边框（换阶段那道分隔线）由调用方给 */
  className?: string;
  onToggle: (selected: boolean) => void;
  onOpenReason: () => void;
}) => {
  const { t } = useTranslation();
  const keepLock = cell.selected ? null : getCellLockReason(cell, true);
  const reason = cell.reason.trim();
  const missing = !cell.selected && !reason;
  const willDeleteCompleted = isCompletedCut(cell);

  return (
    <td
      className={cn(
        "relative h-11.5 min-w-[250px] border-b border-l border-subtle px-3.5",
        isSelected && "bg-accent-subtle",
        className
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <KeepCutSegment
          value={cell.selected}
          editable={editable}
          keepLockReason={keepLock ? t(`review_tailoring.matrix.${keepLock}`) : null}
          onChange={onToggle}
        />

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

        {willDeleteCompleted && (
          <Tooltip tooltipContent={t("review_tailoring.matrix.completed_will_delete")}>
            <span className="flex shrink-0 items-center text-danger-primary">
              <AlertTriangle className="size-3.5" strokeWidth={2.4} />
            </span>
          </Tooltip>
        )}

        {!cell.selected &&
          (reason || editable ? (
            <button
              type="button"
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left text-13",
                missing ? "font-medium text-warning-primary" : "text-secondary hover:text-primary"
              )}
              title={reason || undefined}
              onClick={onOpenReason}
            >
              {missing ? (
                <AlertTriangle className="size-3.5 shrink-0" strokeWidth={2.4} />
              ) : (
                <MessageSquare className="size-3.5 shrink-0 text-placeholder" />
              )}
              <span className="truncate">{reason || t("review_tailoring.matrix.write_reason")}</span>
            </button>
          ) : (
            <span className="truncate text-12 text-placeholder">{t("review_tailoring.matrix.reason_missing")}</span>
          ))}
      </div>
      {isDirty && <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-accent-primary" aria-hidden />}
    </td>
  );
};
