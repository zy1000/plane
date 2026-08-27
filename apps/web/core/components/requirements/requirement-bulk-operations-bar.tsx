"use client";

import { FolderOpenDot } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { BulkOperationsBar } from "@/components/common/bulk-operations-bar";

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
 * 需求没有批量改属性，只挂提交评审 / 移动模块 / 删除。
 * 调用方须把本组件放进分页行的 relative 容器里。
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

  return (
    <BulkOperationsBar
      selectedCount={selectedCount}
      selectedLabel={t("requirement_grid.data.selected_count", { count: selectedCount })}
      onClearSelection={onClearSelection}
      className={className}
    >
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
        <Button variant="error-outline" size="lg" disabled={disabled || effectiveDeleteCount === 0} onClick={onDelete}>
          {t("delete")}
        </Button>
      )}
    </BulkOperationsBar>
  );
}
