import type { ReactNode } from "react";
import { ChevronRight, ClipboardCheck, Flag, GitBranchPlus, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TProjectStage, TUpdateProjectStagePayload } from "@plane/types";
import { Checkbox } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TProjectStageFlashedCells } from "./bulk/use-project-stage-bulk-edit";
import {
  Empty,
  ProjectStageDateCell,
  ProjectStageDurationCell,
  ProjectStageOwnerCell,
  ProjectStageRatioCell,
} from "./project-stage-cells";
import { ProjectStageDelayedTag } from "./project-stage-delayed-tag";
import type { TProjectStageRow } from "./project-stage-rows";
import { delayedDays } from "./project-stage-rows";
import { ProjectStageStatusCell } from "./project-stage-status-cell";

const I18N = "project_stage";

export type TProjectStageColumn =
  | "code"
  | "owner"
  | "ratio"
  | "start_date"
  | "end_date"
  | "duration_days"
  | "actual_start"
  | "actual_end"
  | "status";

export const PROJECT_STAGE_COLUMNS: TProjectStageColumn[] = [
  "code",
  "owner",
  "ratio",
  "start_date",
  "end_date",
  "duration_days",
  "actual_start",
  "actual_end",
  "status",
];

/** 宽度含格子左右各 12px 内边距（格子之间画竖线，不再用 gap 隔开） */
const COLUMN_WIDTH: Record<TProjectStageColumn, string> = {
  code: "92px",
  owner: "148px",
  ratio: "88px",
  start_date: "116px",
  end_date: "116px",
  duration_days: "88px",
  actual_start: "96px",
  actual_end: "96px",
  status: "124px",
};

/** 同阶段评审 / 工作项表格：每格左边一道竖线，与行底线一起画出格子 */
const CELL_CLASS = "flex h-full min-w-0 items-center border-l border-subtle px-3";

const shortDate = (value: string) => value.slice(5, 10);

/** 行左侧留白里的勾选框：平时藏着，悬停该行或已经有勾选时才出来，不占列宽 */
const RowCheckbox = ({
  checked,
  indeterminate,
  visible,
  hoverGroup,
  title,
  onToggle,
}: {
  checked: boolean;
  indeterminate?: boolean;
  visible: boolean;
  hoverGroup: "header" | "row";
  title: string;
  onToggle: () => void;
}) => (
  <span
    className="absolute inset-y-0 left-1.5 z-[1] grid w-3.5 place-items-center"
    title={title}
    onClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => event.stopPropagation()}
    role="presentation"
  >
    <Checkbox
      className="size-3.5 !outline-none"
      iconClassName="size-3"
      checked={checked}
      indeterminate={indeterminate}
      aria-label={title}
      onChange={onToggle}
      containerClassName={cn(
        "pointer-events-none opacity-0 transition-opacity",
        hoverGroup === "header"
          ? "group-hover/header:pointer-events-auto group-hover/header:opacity-100"
          : "group-hover/row:pointer-events-auto group-hover/row:opacity-100",
        (visible || checked) && "pointer-events-auto opacity-100"
      )}
    />
  </span>
);

export type TProjectStageTableSelection = {
  selectedSet: Set<string>;
  allSelected: boolean;
  someSelected: boolean;
  onToggle: (stageId: string) => void;
  onToggleAll: () => void;
};

export type TProjectStageRowActions = {
  onEdit: (stage: TProjectStage) => void;
  onAddChild: (stage: TProjectStage) => void;
  onDelete: (stage: TProjectStage) => void;
  /** 格子里就地改：负责人 / 占比 / 计划起止 / 周期 / 状态，每次只带改的那个字段 */
  onUpdate: (stage: TProjectStage, payload: TUpdateProjectStagePayload) => void;
};

const ActionButton = ({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) => (
  <button
    type="button"
    title={title}
    aria-label={title}
    className="grid size-7 place-items-center rounded-md text-tertiary transition-colors hover:bg-layer-transparent-hover hover:text-primary"
    onClick={(event) => {
      event.stopPropagation();
      onClick();
    }}
  >
    {children}
  </button>
);

/**
 * 树形阶段表：名称列带展开箭头 + 里程碑旗标 + 已延期标签，子阶段按深度缩进并画一段树线；
 * 有维护权限时负责人 / 占比 / 计划起止 / 周期 / 状态点格子就地改（同工作项表格），父阶段的占比
 * 是子之和、只读；实际日期跟着状态走、只读；名称与类型走编辑弹窗。行尾悬停出编辑 / 新建子阶段 / 删除。
 */
export const ProjectStageTable = ({
  projectId,
  rows,
  today,
  workloadRemaining,
  canManage,
  expandedIds,
  onToggleExpand,
  selection,
  actions,
  flashedCells,
}: {
  projectId: string;
  rows: TProjectStageRow[];
  /** `YYYY-MM-DD` */
  today: string;
  /** 叶子占比还可分配多少，占比格子校验用 */
  workloadRemaining: number;
  canManage: boolean;
  expandedIds: Set<string>;
  onToggleExpand: (stageId: string) => void;
  /** 不传就没有勾选（没有维护权限） */
  selection?: TProjectStageTableSelection;
  actions?: TProjectStageRowActions;
  flashedCells?: TProjectStageFlashedCells | null;
}) => {
  const { t } = useTranslation();
  const columns = PROJECT_STAGE_COLUMNS;
  const gridTemplateColumns = [
    "minmax(260px, 1fr)",
    ...columns.map((column) => COLUMN_WIDTH[column]),
    actions ? "96px" : "0px",
  ].join(" ");
  const unassigned = t(`${I18N}.table.unassigned`);
  const hasSelection = Boolean(selection && selection.selectedSet.size > 0);
  const onUpdate = canManage ? actions?.onUpdate : undefined;
  // 行是树先序铺的，看得见的行它的父也一定在行里
  const stageById = new Map(rows.map(({ stage }) => [stage.id, stage]));

  const renderCell = (column: TProjectStageColumn, stage: TProjectStage, hasChildren: boolean) => {
    const update = onUpdate ? (payload: TUpdateProjectStagePayload) => onUpdate(stage, payload) : undefined;
    const parent = stage.parent_id ? stageById.get(stage.parent_id) : undefined;
    switch (column) {
      case "code":
        return <span className="font-mono text-12 tabular-nums text-tertiary">{stage.code}</span>;
      case "owner":
        return (
          <ProjectStageOwnerCell
            stage={stage}
            projectId={projectId}
            unassigned={unassigned}
            onChange={update && ((ownerId) => update({ owner_id: ownerId }))}
          />
        );
      case "ratio":
        return (
          <ProjectStageRatioCell
            stage={stage}
            hasChildren={hasChildren}
            workloadRemaining={workloadRemaining}
            onChange={update && ((ratio) => update({ workload_ratio: ratio }))}
          />
        );
      case "start_date":
        // 必填不可清空；有周期时结束会跟着顺延，开始不受当前结束限制（同编辑弹窗）
        return (
          <ProjectStageDateCell
            value={stage.start_date}
            minDate={parent?.start_date}
            maxDate={(stage.duration_days ? null : stage.end_date) ?? parent?.end_date}
            clearable={false}
            onChange={update && ((date) => date && update({ start_date: date }))}
          />
        );
      case "end_date":
        return (
          <ProjectStageDateCell
            value={stage.end_date}
            isLate={stage.is_delayed}
            minDate={stage.start_date ?? parent?.start_date}
            maxDate={parent?.end_date}
            clearable
            onChange={update && ((date) => update({ end_date: date }))}
          />
        );
      case "duration_days":
        return (
          <ProjectStageDurationCell
            stage={stage}
            onChange={update && ((days) => update({ duration_days: days }))}
          />
        );
      case "actual_start":
        return stage.actual_start ? (
          <span className="text-13 tabular-nums text-secondary">{shortDate(stage.actual_start)}</span>
        ) : (
          <Empty />
        );
      case "actual_end":
        return stage.actual_end ? (
          <span className="text-13 tabular-nums text-secondary">{shortDate(stage.actual_end)}</span>
        ) : (
          <Empty />
        );
      case "status":
        return (
          <ProjectStageStatusCell
            status={stage.status}
            onChange={update && ((status) => update({ status }))}
          />
        );
    }
  };

  return (
    <div className="min-w-fit">
      <div
        className="group/header sticky top-0 z-[2] grid h-9 items-center border-b border-subtle bg-layer-1 text-12 text-tertiary"
        style={{ gridTemplateColumns }}
      >
        {selection && (
          <RowCheckbox
            checked={selection.allSelected}
            indeterminate={selection.someSelected}
            visible={hasSelection}
            hoverGroup="header"
            title={t(`${I18N}.bulk.select_all`)}
            onToggle={selection.onToggleAll}
          />
        )}
        <span className="flex h-full min-w-0 items-center pr-3 pl-6">{t(`${I18N}.table.name`)}</span>
        {columns.map((column) => (
          <span key={column} className={CELL_CLASS}>
            <span className="truncate">{t(`${I18N}.table.${column}`)}</span>
          </span>
        ))}
        {actions ? <span className={CELL_CLASS} /> : <span />}
      </div>

      {rows.map(({ stage, depth, hasChildren, isExpanded }) => {
        const flashed = flashedCells?.ids.has(stage.id) ? flashedCells.columns : null;
        const selected = selection?.selectedSet.has(stage.id) ?? false;
        return (
          <div
            key={stage.id}
            className={cn(
              "group/row relative grid h-11 items-center border-b border-subtle transition-colors",
              selected ? "bg-accent-subtle" : "hover:bg-layer-1"
            )}
            style={{ gridTemplateColumns }}
          >
            {selection && (
              <RowCheckbox
                checked={selected}
                visible={hasSelection}
                hoverGroup="row"
                title={t(`${I18N}.bulk.select_row`)}
                onToggle={() => selection.onToggle(stage.id)}
              />
            )}
            <span
              className="relative flex h-full min-w-0 items-center gap-1.5 pr-3"
              style={{ paddingLeft: 24 + depth * 20 }}
            >
              {depth > 0 && (
                <span
                  className="absolute top-0 h-1/2 w-3 rounded-bl-md border-b border-l border-subtle"
                  style={{ left: 24 + depth * 20 - 12 }}
                  aria-hidden
                />
              )}
              {hasChildren ? (
                <button
                  type="button"
                  className="grid size-5 shrink-0 place-items-center rounded text-tertiary hover:bg-layer-transparent-hover hover:text-primary"
                  aria-expanded={isExpanded}
                  aria-label={t(isExpanded ? `${I18N}.table.collapse` : `${I18N}.table.expand`)}
                  onClick={() => onToggleExpand(stage.id)}
                >
                  <ChevronRight className={cn("size-3.5 transition-transform", isExpanded && "rotate-90")} />
                </button>
              ) : (
                <span className="size-5 shrink-0" aria-hidden />
              )}
              <span
                className={cn("truncate text-13", depth === 0 ? "font-medium text-primary" : "text-primary")}
                title={stage.name}
              >
                {stage.name}
              </span>
              {stage.is_milestone && (
                <span
                  className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-layer-3 px-1.5 text-11 font-medium text-secondary"
                  title={t(`${I18N}.milestone`)}
                >
                  <Flag className="size-3" />
                  {t(`${I18N}.milestone`)}
                </span>
              )}
              {stage.is_delayed && stage.end_date && (
                <ProjectStageDelayedTag days={delayedDays(stage.end_date, today)} />
              )}
              {hasChildren && (
                <span className="shrink-0 text-11 text-placeholder">
                  {t(`${I18N}.table.children`, { count: stage.children_count })}
                </span>
              )}
              {stage.review_count > 0 && (
                <span
                  className="inline-flex h-5 shrink-0 items-center gap-1 rounded-full bg-layer-3 px-1.5 text-11 font-medium text-tertiary"
                  title={t(`${I18N}.table.review_count_hint`)}
                >
                  <ClipboardCheck className="size-3" />
                  {t(`${I18N}.table.review_count`, { count: stage.review_count })}
                </span>
              )}
            </span>
            {columns.map((column) => (
              <span
                key={column}
                className={cn(CELL_CLASS, "transition-colors duration-700", flashed?.has(column) && "bg-success-subtle")}
              >
                {renderCell(column, stage, hasChildren)}
              </span>
            ))}
            {actions ? (
              <span className="flex h-full items-center justify-end border-l border-subtle px-2">
                <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
                  <ActionButton title={t(`${I18N}.table.edit`)} onClick={() => actions.onEdit(stage)}>
                    <Pencil className="size-3.5" />
                  </ActionButton>
                  <ActionButton title={t(`${I18N}.table.add_child`)} onClick={() => actions.onAddChild(stage)}>
                    <GitBranchPlus className="size-3.5" />
                  </ActionButton>
                  <ActionButton title={t(`${I18N}.table.delete`)} onClick={() => actions.onDelete(stage)}>
                    <Trash2 className="size-3.5" />
                  </ActionButton>
                </span>
              </span>
            ) : (
              <span />
            )}
          </div>
        );
      })}
    </div>
  );
};
