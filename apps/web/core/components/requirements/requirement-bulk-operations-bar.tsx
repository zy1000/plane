"use client";

import type { ReactNode } from "react";
import { Check, FolderInput, Trash2, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "@plane/i18n";
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

/** 深色浮条里的一枚动作按钮：图标 + 文字，30px 高 */
const BarButton = ({
  icon: Icon,
  children,
  tone = "default",
  disabled,
  onClick,
}: {
  icon: LucideIcon;
  children: ReactNode;
  tone?: "default" | "danger";
  disabled?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={cn(
      "inline-flex h-[30px] items-center gap-1.5 rounded-md px-[11px] text-13 font-medium transition-colors hover:bg-layer-1/15 disabled:cursor-not-allowed disabled:opacity-40",
      tone === "danger" ? "text-danger-secondary" : "text-inverse"
    )}
  >
    <Icon className="size-[15px] shrink-0" />
    {children}
  </button>
);

/**
 * 需求网格勾选后的批量操作浮条：深色、居中，浮在分页条上方。
 *
 * 需求没有批量改属性，只挂提交评审 / 移动模块 / 删除。
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
    className,
  } = props;
  const { t } = useTranslation();
  const effectiveDeleteCount = deleteCount ?? selectedCount;

  if (selectedCount <= 0) return null;

  return (
    <div className={cn("pointer-events-none absolute inset-x-0 bottom-full z-[20] flex justify-center pb-5", className)}>
      <div className="pointer-events-auto inline-flex items-center gap-1 rounded-xl bg-[var(--neutral-1200)] py-1.5 pr-1.5 pl-3.5 text-inverse shadow-overlay-200">
        <span className="pr-2 text-13 font-semibold whitespace-nowrap" aria-live="polite">
          {t("requirement_grid.data.selected_count", { count: selectedCount })}
        </span>
        <span aria-hidden className="h-[18px] w-px bg-layer-1/25" />
        {onSubmitReview && submitReviewCount > 0 && (
          <BarButton icon={Check} disabled={disabled} onClick={onSubmitReview}>
            {t("requirement_approval.submit_review")}
          </BarButton>
        )}
        {onMoveToModule && (
          <BarButton icon={FolderInput} disabled={disabled} onClick={onMoveToModule}>
            {t("requirement_modules.move_to_module")}
          </BarButton>
        )}
        {onDelete && (
          <BarButton
            icon={Trash2}
            tone="danger"
            disabled={disabled || effectiveDeleteCount === 0}
            onClick={onDelete}
          >
            {t("delete")}
          </BarButton>
        )}
        <button
          type="button"
          onClick={onClearSelection}
          aria-label={t("requirement_grid.data.clear_selection")}
          className="grid h-[30px] place-items-center rounded-md px-2 text-inverse/60 transition-colors hover:bg-layer-1/15 hover:text-inverse"
        >
          <X className="size-[15px]" />
        </button>
      </div>
    </div>
  );
}
