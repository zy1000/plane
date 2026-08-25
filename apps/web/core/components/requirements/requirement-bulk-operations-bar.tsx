"use client";

import { FolderOpenDot } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Checkbox } from "@plane/ui";
import { cn } from "@plane/utils";

type TProps = {
  selectedCount: number;
  disabled?: boolean;
  onClearSelection: () => void;
  /** 可提交评审的数量；为 0 或不传则不显示提交按钮 */
  submitReviewCount?: number;
  onSubmitReview?: () => void;
  /** 可直接删除的数量；不传则按 selectedCount 计 */
  deleteCount?: number;
  onDelete?: () => void;
  onMoveToModule?: () => void;
  className?: string;
};

/**
 * 需求网格勾选后的底部批量操作栏。
 *
 * 宽度贴内容、水平居中，浮在分页上方（不占布局行）。
 * 需求没有批量改属性，只挂提交评审 / 移动模块 / 删除。
 *
 * 调用方须把本组件放进分页行的 relative 容器里，用 absolute bottom-full 贴在分页顶上。
 */
export function RequirementBulkOperationsBar(props: TProps) {
  const {
    selectedCount,
    disabled = false,
    onClearSelection,
    submitReviewCount = 0,
    onSubmitReview,
    deleteCount,
    onDelete,
    onMoveToModule,
    className,
  } = props;
  const { t } = useTranslation();
  const effectiveDeleteCount = deleteCount ?? selectedCount;

  if (selectedCount <= 0) return null;

  return (
    <div className={cn("pointer-events-none absolute inset-x-0 bottom-full z-[20] flex justify-center pb-2", className)}>
      <div className="pointer-events-auto inline-flex h-10 w-fit items-center gap-2.5 rounded-[10px] border border-subtle bg-surface-1 px-2.5 shadow-md">
        <div className="flex items-center gap-2 border-r border-subtle pr-2.5">
          <Checkbox checked onClick={onClearSelection} className="size-3.5 !outline-none" iconClassName="size-3" />
          <span className="text-xs text-secondary" aria-live="polite">
            {t("requirement_grid.data.selected_count", { count: selectedCount })}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {onSubmitReview && submitReviewCount > 0 && (
            <Button variant="primary" size="lg" disabled={disabled} onClick={onSubmitReview}>
              {t("requirement_approval.review")}
            </Button>
          )}
          {onMoveToModule && (
            <Button variant="secondary" size="lg" disabled={disabled} onClick={onMoveToModule}>
              <FolderOpenDot className="size-3.5" />
              {t("requirement_modules.move_to_module")}
            </Button>
          )}
          {onDelete && (
            <Button
              variant="error-outline"
              size="lg"
              disabled={disabled || effectiveDeleteCount === 0}
              onClick={onDelete}
            >
              {t("delete")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
