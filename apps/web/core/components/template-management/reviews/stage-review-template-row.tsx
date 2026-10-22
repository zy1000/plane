import { ChevronRight, GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/propel/tooltip";
import type { TStageReviewTemplate } from "@plane/types";
import { STAGE_REVIEW_ROOT_KINDS } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
import { cn } from "@plane/utils";
import { REVIEW_ROW_GRID } from "./stage-review-grid";
import { StageReviewKindBadge } from "./stage-review-kind-badge";

type Props = {
  template: TStageReviewTemplate;
  /** 有子活动的顶层节点才渲染展开箭头 */
  childCount: number;
  isExpanded: boolean;
  isChild: boolean;
  canEdit: boolean;
  canDrag: boolean;
  onToggleExpand: () => void;
  onEdit: (template: TStageReviewTemplate) => void;
  /** 只有根评审能加子活动；活动下面不能再挂 */
  onAddChild: (template: TStageReviewTemplate) => void;
  onDelete: (template: TStageReviewTemplate) => void;
  onToggleActive: (template: TStageReviewTemplate) => void;
};

const I18N = "workspace_templates.reviews";
const ICON_BUTTON =
  "grid size-7 place-items-center rounded text-tertiary transition-colors hover:bg-layer-2 hover:text-primary";

export function StageReviewTemplateRow(props: Props) {
  const {
    template,
    childCount,
    isExpanded,
    isChild,
    canEdit,
    canDrag,
    onToggleExpand,
    onEdit,
    onAddChild,
    onDelete,
    onToggleActive,
  } = props;
  const { t } = useTranslation();
  const isRoot = STAGE_REVIEW_ROOT_KINDS.includes(template.kind);

  return (
    <div
      className={cn(
        "group border-b border-subtle text-13 transition-colors last:border-b-0 hover:bg-layer-1-hover",
        REVIEW_ROW_GRID,
        "min-h-[54px] py-1.5",
        !template.is_active && "opacity-55"
      )}
    >
      {/* 拖柄 + 展开钮独占行首一格，编号列才能在所有行上竖向对齐 */}
      <span className="flex items-center gap-1">
        {canDrag ? (
          <span
            data-sortable-drag-handle
            className="shrink-0 cursor-grab text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
          >
            <GripVertical className="size-3.5" />
          </span>
        ) : (
          <span className="size-3.5 shrink-0" />
        )}
        {childCount > 0 ? (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={isExpanded}
            aria-label={t(isExpanded ? "collapse" : "expand")}
            className="grid size-4 shrink-0 place-items-center rounded text-tertiary hover:bg-layer-2 hover:text-primary"
          >
            <ChevronRight className={cn("size-3 transition-transform", isExpanded && "rotate-90")} />
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}
      </span>

      <span
        className={cn("truncate font-mono text-13 tabular-nums", isRoot ? "font-medium text-primary" : "text-secondary")}
        title={template.standard_code}
      >
        {template.standard_code || "—"}
      </span>

      <span className="flex min-w-0 items-center gap-1">
        {/* 子节点用一段连接线表达从属，不靠纯缩进 */}
        {isChild && <span className="mr-1 h-px w-3 shrink-0 bg-strong" />}
        <span className="min-w-0 flex-1">
          <span
            className={cn("block truncate", isRoot ? "font-semibold text-primary" : "font-medium text-primary")}
            title={template.title}
          >
            {template.title}
          </span>
          {/* 三个角色收到名称下面一行；根评审的审核者本来就是「无」 */}
          <span className="mt-0.5 block truncate text-12 text-tertiary">
            发起 <b className="mr-2.5 font-medium text-secondary">{template.initiator_role || "—"}</b>
            主导 <b className="mr-2.5 font-medium text-secondary">{template.leader_role || "—"}</b>
            审核 <b className="font-medium text-secondary">{template.auditor_role || t(`${I18N}.no_auditor`)}</b>
          </span>
        </span>
      </span>

      <span>
        <StageReviewKindBadge kind={template.kind} />
      </span>

      <span>
        <Tooltip tooltipContent={t(`${I18N}.${template.is_active ? "disable" : "enable"}`)}>
          <span className="inline-flex">
            <ToggleSwitch
              value={template.is_active}
              onChange={() => onToggleActive(template)}
              disabled={!canEdit}
              size="sm"
            />
          </span>
        </Tooltip>
      </span>

      <span className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {canEdit && (
          <>
            {isRoot && (
              <button
                type="button"
                onClick={() => onAddChild(template)}
                className={ICON_BUTTON}
                aria-label={t(`${I18N}.add_child`)}
                title={t(`${I18N}.add_child`)}
              >
                <Plus className="size-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onEdit(template)}
              className={ICON_BUTTON}
              aria-label={t("edit")}
              title={t("edit")}
            >
              <Pencil className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(template)}
              className={cn(ICON_BUTTON, "hover:bg-danger-subtle hover:text-danger-primary")}
              aria-label={t("delete")}
              title={t("delete")}
            >
              <Trash2 className="size-3.5" />
            </button>
          </>
        )}
      </span>
    </div>
  );
}
