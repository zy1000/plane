import type { ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";
import { BulkOperationsBar } from "@/components/common/bulk-operations-bar";

/**
 * 阶段评审列表勾选后的底部操作条。评审只由裁剪表生成、状态只能本人推进，所以这里只有
 * 「修改属性」一个动作。调用方须把本组件放进 relative 容器里（见 `BulkOperationsBar`）。
 */
export const StageReviewBulkBar = ({
  selectedCount,
  onClearSelection,
  isEditPanelOpen,
  onToggleEditPanel,
  editPanel,
}: {
  selectedCount: number;
  onClearSelection: () => void;
  isEditPanelOpen: boolean;
  onToggleEditPanel: () => void;
  /** 修改属性面板，浮在按钮上方 */
  editPanel: ReactNode;
}) => {
  const { t } = useTranslation();
  return (
    <BulkOperationsBar
      selectedCount={selectedCount}
      selectedLabel={t("stage_review.bulk.selected_count", { count: selectedCount })}
      onClearSelection={onClearSelection}
    >
      <div className="relative">
        <Button
          variant="ghost"
          size="lg"
          className={cn("text-accent-primary", isEditPanelOpen && "bg-accent-subtle")}
          onClick={onToggleEditPanel}
          aria-expanded={isEditPanelOpen}
        >
          <SlidersHorizontal className="size-3.5" />
          {t("stage_review.bulk.edit_properties")}
        </Button>
        {isEditPanelOpen && <div className="absolute bottom-full left-1/2 mb-4 -translate-x-1/2">{editPanel}</div>}
      </div>
    </BulkOperationsBar>
  );
};
