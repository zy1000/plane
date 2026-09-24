import type { ReactNode } from "react";
import { SlidersHorizontal, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";
import { BulkOperationsBar } from "@/components/common/bulk-operations-bar";

const I18N = "project_stage.bulk";

/**
 * 阶段列表勾选后的底部操作条：修改属性（负责人 / 计划日期）+ 删除。
 * 调用方须把本组件放进 relative 容器里（见 `BulkOperationsBar`）。
 */
export const ProjectStageBulkBar = ({
  selectedCount,
  onClearSelection,
  isEditPanelOpen,
  onToggleEditPanel,
  onDelete,
  editPanel,
}: {
  selectedCount: number;
  onClearSelection: () => void;
  isEditPanelOpen: boolean;
  onToggleEditPanel: () => void;
  onDelete: () => void;
  editPanel: ReactNode;
}) => {
  const { t } = useTranslation();
  return (
    <BulkOperationsBar
      selectedCount={selectedCount}
      selectedLabel={t(`${I18N}.selected_count`, { count: selectedCount })}
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
          {t(`${I18N}.edit_properties`)}
        </Button>
        {isEditPanelOpen && <div className="absolute bottom-full left-1/2 mb-4 -translate-x-1/2">{editPanel}</div>}
      </div>
      <Button variant="ghost" size="lg" className="text-danger-primary" onClick={onDelete}>
        <Trash2 className="size-3.5" />
        {t(`${I18N}.delete`)}
      </Button>
    </BulkOperationsBar>
  );
};
