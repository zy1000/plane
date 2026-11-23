"use client";

import { Check, FolderInput, Layers, Trash2 } from "lucide-react";
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
  /** 产品集的需求：批量设置使用范围 */
  onSetScope?: () => void;
  className?: string;
};

/**
 * 需求网格勾选后的批量操作浮条：沿用工作项 / 用例的浅色浮条（common/bulk-operations-bar）。
 *
 * 需求没有批量改属性，只挂提交评审 / 移动模块 / 设置使用范围 / 删除。
 * 按钮用短名，完整说法放在悬停提示里。
 * 调用方须把本组件放进分页行的 relative 容器里（absolute bottom-full 贴在分页顶上）。
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
    onSetScope,
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
        <Button
          variant="ghost"
          size="lg"
          disabled={disabled}
          onClick={onSubmitReview}
          title={t("requirement_approval.submit_review")}
        >
          <Check className="size-3.5" />
          评审
        </Button>
      )}
      {onMoveToModule && (
        <Button
          variant="ghost"
          size="lg"
          disabled={disabled}
          onClick={onMoveToModule}
          title={t("requirement_modules.move_to_module")}
        >
          <FolderInput className="size-3.5" />
          移动
        </Button>
      )}
      {onSetScope && (
        <Button
          variant="ghost"
          size="lg"
          disabled={disabled}
          onClick={onSetScope}
          title={t("workspace_product_sets.requirements.bulk_scope")}
        >
          <Layers className="size-3.5" />
          范围
        </Button>
      )}
      {onDelete && (
        <>
          <span className="mx-0.5 h-4 border-l border-subtle" aria-hidden />
          <Button
            variant="ghost"
            size="lg"
            className="text-danger-primary"
            disabled={disabled || effectiveDeleteCount === 0}
            onClick={onDelete}
          >
            <Trash2 className="size-3.5" />
            {t("delete")}
          </Button>
        </>
      )}
    </BulkOperationsBar>
  );
}
