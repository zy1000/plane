import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TDevModeStage } from "@plane/types";
import { cn } from "@plane/utils";
import { MoreMenu } from "@/components/project-issue-types/root";
import { DEV_MODE_I18N, DEV_MODE_STAGE_ROW_GRID } from "./dev-modes-grid";

const formatRatio = (value: string | null) => {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  if (Number.isNaN(parsed)) return null;
  // 12.00 -> 12%，12.50 -> 12.5%
  return `${parsed.toString()}%`;
};

/**
 * 阶段表的一行（方案 A）：序号圆点 · 名称 + 编码 · 评审节点覆盖条 · 占比 · 周期 · 更多。
 * 阶段名与类型名不同时（如「O-10阶段」用的是「O阶段」类型）在名称后补一句类型。
 */
export function DevModeStageRow({
  stage,
  index,
  totalNodes,
  isActive,
  canEdit,
  canDrag,
  onOpen,
  onEdit,
  onDelete,
}: {
  stage: TDevModeStage;
  /** 展示用的序号，从 1 开始 */
  index: number;
  /** 该阶段类型下可勾的节点数；评审模板还没回来时 undefined */
  totalNodes: number | undefined;
  isActive: boolean;
  canEdit: boolean;
  canDrag: boolean;
  onOpen: (stage: TDevModeStage) => void;
  onEdit: (stage: TDevModeStage) => void;
  onDelete: (stage: TDevModeStage) => void;
}) {
  const { t } = useTranslation();
  const ratio = formatRatio(stage.workload_ratio);
  const typeName = stage.stage_type_detail?.name;
  const coverage = totalNodes ? Math.min(100, Math.round((stage.template_count / totalNodes) * 100)) : 0;

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
        "group h-[50px] cursor-pointer border-b border-subtle text-14 transition-colors last:border-b-0",
        isActive ? "bg-accent-subtle" : "hover:bg-layer-transparent-hover"
      )}
    >
      <span className="flex justify-center">
        {canDrag && (
          <GripVertical
            data-sortable-drag-handle
            className="size-3.5 cursor-grab text-placeholder opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-100"
            aria-label={t(`${DEV_MODE_I18N}.table.drag_hint`)}
            onClick={(event) => event.stopPropagation()}
          />
        )}
      </span>

      <span
        className={cn(
          "grid size-6 place-items-center rounded-full text-12 font-semibold tabular-nums",
          isActive ? "bg-accent-primary text-on-color" : "bg-layer-1 text-secondary"
        )}
      >
        {index}
      </span>

      <span className="flex min-w-0 items-center gap-2.5">
        <span className={cn("truncate text-primary", isActive ? "font-semibold" : "font-medium")}>{stage.name}</span>
        <span className="shrink-0 font-mono text-12 text-tertiary">{stage.code}</span>
        {typeName && typeName !== stage.name && (
          <span className="shrink-0 truncate text-12 text-tertiary">类型 {typeName}</span>
        )}
      </span>

      <span className="flex items-center gap-2 text-13 tabular-nums text-secondary">
        <span className="h-1 w-12 shrink-0 overflow-hidden rounded-full bg-layer-3">
          <span className="block h-full rounded-full bg-accent-primary" style={{ width: `${coverage}%` }} />
        </span>
        <span className={cn(totalNodes !== undefined && stage.template_count < totalNodes && "text-warning-primary")}>
          {stage.template_count}
          {totalNodes !== undefined && ` / ${totalNodes}`}
        </span>
      </span>

      <span className={cn("text-right tabular-nums", ratio ? "text-secondary" : "text-placeholder")}>{ratio ?? "—"}</span>
      <span className={cn("text-right tabular-nums", stage.standard_days !== null ? "text-secondary" : "text-placeholder")}>
        {stage.standard_days !== null ? t(`${DEV_MODE_I18N}.table.days`, { count: stage.standard_days }) : "—"}
      </span>

      <span
        className="flex justify-end opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {canEdit && (
          <MoreMenu
            title="阶段操作"
            items={[
              { label: t(`${DEV_MODE_I18N}.table.edit`), icon: <Pencil className="size-3.5" />, onClick: () => onEdit(stage) },
              {
                label: t(`${DEV_MODE_I18N}.table.delete`),
                icon: <Trash2 className="size-3.5" />,
                tone: "danger",
                onClick: () => onDelete(stage),
              },
            ]}
          />
        )}
      </span>
    </div>
  );
}
