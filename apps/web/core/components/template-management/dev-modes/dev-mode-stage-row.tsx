import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TDevModeStage } from "@plane/types";
import { Checkbox, Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";
import { DEV_MODE_I18N, DEV_MODE_ICON_BUTTON, DEV_MODE_STAGE_ROW_GRID } from "./dev-modes-grid";

const formatRatio = (value: string | null) => {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return null;
  // 12.00 -> 12%，12.50 -> 12.5%
  return `${parsed.toString()}%`;
};

export function DevModeStageRow({
  stage,
  index,
  isActive,
  isSelected,
  canEdit,
  canDrag,
  onOpen,
  onToggleSelect,
  onEdit,
  onDelete,
}: {
  stage: TDevModeStage;
  /** 展示用的行号，从 1 开始 */
  index: number;
  isActive: boolean;
  isSelected: boolean;
  canEdit: boolean;
  canDrag: boolean;
  onOpen: (stage: TDevModeStage) => void;
  onToggleSelect: (stageId: string, checked: boolean) => void;
  onEdit: (stage: TDevModeStage) => void;
  onDelete: (stage: TDevModeStage) => void;
}) {
  const { t } = useTranslation();
  const ratio = formatRatio(stage.workload_ratio);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(stage)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(stage);
        }
      }}
      className={cn(
        DEV_MODE_STAGE_ROW_GRID,
        "group relative h-11 cursor-pointer border-b border-subtle text-13 transition-colors last:border-b-0",
        isActive
          ? "bg-accent-subtle before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-accent-primary before:content-['']"
          : "hover:bg-layer-1-hover"
      )}
    >
      <span onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <Checkbox
          disabled={!canEdit}
          checked={isSelected}
          onChange={(event) => onToggleSelect(stage.id, event.target.checked)}
        />
      </span>

      <span className="flex justify-center">
        {canDrag && (
          <GripVertical
            data-sortable-drag-handle
            className={cn(
              "size-3.5 cursor-grab text-placeholder transition-opacity active:cursor-grabbing",
              isActive || isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
            aria-label={t(`${DEV_MODE_I18N}.table.drag_hint`)}
            onClick={(event) => event.stopPropagation()}
          />
        )}
      </span>

      <span className="tabular-nums text-12 text-tertiary">{index}</span>

      <span className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium text-primary">{stage.name}</span>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-px text-11 font-medium",
            isActive ? "bg-accent-primary/10 text-accent-primary" : "bg-layer-1 text-tertiary"
          )}
        >
          {t(`${DEV_MODE_I18N}.table.node_count`, { count: stage.template_count })}
        </span>
      </span>

      <span className="truncate font-mono text-12 tabular-nums text-secondary">{stage.code}</span>
      <span className="truncate text-secondary">{stage.stage_type_detail?.name ?? "—"}</span>

      <span className={cn("text-right tabular-nums", ratio ? "text-secondary" : "text-placeholder")}>
        {ratio ?? "—"}
      </span>
      <span
        className={cn("text-right tabular-nums", stage.standard_days !== null ? "text-secondary" : "text-placeholder")}
      >
        {stage.standard_days !== null
          ? t(`${DEV_MODE_I18N}.table.days`, { count: stage.standard_days })
          : "—"}
      </span>

      <span
        className={cn(
          "flex items-center justify-end gap-0.5 transition-opacity focus-within:opacity-100",
          isActive || isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <Tooltip tooltipContent={t(`${DEV_MODE_I18N}.table.edit`)} position="top">
          <button type="button" className={DEV_MODE_ICON_BUTTON} disabled={!canEdit} onClick={() => onEdit(stage)}>
            <Pencil className="size-3.5" strokeWidth={2} />
          </button>
        </Tooltip>
        <Tooltip tooltipContent={t(`${DEV_MODE_I18N}.table.delete`)} position="top">
          <button
            type="button"
            className={cn(DEV_MODE_ICON_BUTTON, "hover:bg-danger-subtle hover:text-danger-primary")}
            disabled={!canEdit}
            onClick={() => onDelete(stage)}
          >
            <Trash2 className="size-3.5" strokeWidth={2} />
          </button>
        </Tooltip>
      </span>
    </div>
  );
}
