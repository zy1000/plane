import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TStageType } from "@plane/types";
import { STAGE_TYPE_ROW_GRID } from "./stage-types-grid";

const I18N = "workspace_settings.settings.stage_types";
const ICON_BUTTON =
  "grid size-7 place-items-center rounded text-tertiary transition-colors hover:bg-layer-2 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-tertiary";

type Props = {
  stageType: TStageType;
  canEdit: boolean;
  canDrag: boolean;
  onEdit: (stageType: TStageType) => void;
  onDelete: (stageType: TStageType) => void;
};

export function StageTypeRow({ stageType, canEdit, canDrag, onEdit, onDelete }: Props) {
  const { t } = useTranslation();
  const isSystem = stageType.is_system;

  return (
    <div
      className={cn(
        STAGE_TYPE_ROW_GRID,
        "group h-11 border-b border-subtle text-13 transition-colors last:border-b-0 hover:bg-layer-1-hover"
      )}
    >
      <span className="flex justify-center">
        {canDrag && (
          <GripVertical
            data-sortable-drag-handle
            className="size-3.5 cursor-grab text-placeholder opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-100"
            aria-label={t(`${I18N}.table.drag_hint`)}
          />
        )}
      </span>
      <span className="truncate font-mono text-13 tabular-nums text-secondary">{stageType.code}</span>
      <span className="truncate font-medium text-primary">{stageType.name}</span>
      <span className={cn("truncate", stageType.description ? "text-secondary" : "text-placeholder")}>
        {stageType.description || "—"}
      </span>
      <span>
        <span
          className={cn(
            "inline-flex h-5 items-center rounded px-2 text-11 font-medium",
            isSystem
              ? "border border-subtle bg-surface-2 text-secondary"
              : "border border-accent-primary/30 bg-accent-primary/10 text-accent-primary"
          )}
        >
          {t(isSystem ? `${I18N}.table.preset` : `${I18N}.table.custom`)}
        </span>
      </span>
      <span className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <Tooltip tooltipContent={t(`${I18N}.table.edit`)} position="top">
          <button type="button" className={ICON_BUTTON} disabled={!canEdit} onClick={() => onEdit(stageType)}>
            <Pencil className="size-3.5" strokeWidth={2} />
          </button>
        </Tooltip>
        <Tooltip
          tooltipContent={t(isSystem ? `${I18N}.table.delete_preset_blocked` : `${I18N}.table.delete`)}
          position="top"
        >
          <button
            type="button"
            className={cn(ICON_BUTTON, "hover:bg-danger-subtle hover:text-danger-primary")}
            disabled={!canEdit || isSystem}
            onClick={() => onDelete(stageType)}
          >
            <Trash2 className="size-3.5" strokeWidth={2} />
          </button>
        </Tooltip>
      </span>
    </div>
  );
}
