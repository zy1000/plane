"use client";

import type { ReactNode } from "react";
import { Copy, FolderOpenDot, SlidersHorizontal, Trash2 } from "lucide-react";
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";
import { BulkOperationsBar } from "@/components/common/bulk-operations-bar";

type TProps = {
  selectedCount: number;
  total: number;
  selectingAll: boolean;
  onSelectAll: () => void;
  onClearSelection: () => void;
  isEditPanelOpen: boolean;
  onToggleEditPanel: () => void;
  /** 修改属性面板，浮在「修改属性」按钮上方 */
  editPanel: ReactNode;
  canEdit: boolean;
  canCreate: boolean;
  canDelete: boolean;
  onMove: () => void;
  onCopy: () => void;
  onDelete: () => void;
};

/**
 * 用例列表勾选后的底部操作条：修改属性 / 移动到 / 复制到 / 删除。
 * 调用方须把本组件放进分页行的 relative 容器里。
 */
export function CasesBulkOperationsBar(props: TProps) {
  const {
    selectedCount,
    total,
    selectingAll,
    onSelectAll,
    onClearSelection,
    isEditPanelOpen,
    onToggleEditPanel,
    editPanel,
    canEdit,
    canCreate,
    canDelete,
    onMove,
    onCopy,
    onDelete,
  } = props;

  return (
    <BulkOperationsBar
      selectedCount={selectedCount}
      selectedLabel={`已选 ${selectedCount} 条`}
      onClearSelection={onClearSelection}
    >
      {selectedCount < total && (
        <Button variant="link" size="lg" className="px-1 no-underline" onClick={onSelectAll} loading={selectingAll}>
          选择全部 {total} 条
        </Button>
      )}
      <span className="mx-0.5 h-4 border-l border-subtle" aria-hidden />
      {canEdit && (
        <div className="relative">
          <Button
            variant="ghost"
            size="lg"
            className={cn("text-accent-primary", isEditPanelOpen && "bg-accent-subtle")}
            onClick={onToggleEditPanel}
            aria-expanded={isEditPanelOpen}
          >
            <SlidersHorizontal className="size-3.5" />
            修改属性
          </Button>
          {isEditPanelOpen && <div className="absolute bottom-full left-1/2 mb-4 -translate-x-1/2">{editPanel}</div>}
        </div>
      )}
      <Button variant="ghost" size="lg" disabled={!canEdit} onClick={onMove}>
        <FolderOpenDot className="size-3.5" />
        移动到
      </Button>
      <Button variant="ghost" size="lg" disabled={!canCreate} onClick={onCopy}>
        <Copy className="size-3.5" />
        复制到
      </Button>
      <span className="mx-0.5 h-4 border-l border-subtle" aria-hidden />
      <Button variant="ghost" size="lg" className="text-danger-primary" disabled={!canDelete} onClick={onDelete}>
        <Trash2 className="size-3.5" />
        删除
      </Button>
    </BulkOperationsBar>
  );
}
