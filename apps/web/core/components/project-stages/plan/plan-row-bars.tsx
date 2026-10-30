import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode, SyntheticEvent } from "react";
import Link from "next/link";
import { STATE_GROUPS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TProjectStage } from "@plane/types";
import { EProjectStageStatus } from "@plane/types";
import { cn } from "@plane/utils";
import { formatRange, formatShortDate, fromDay, spanDays, toDay } from "./plan-scale";
import type { TPlanRow } from "./plan-tree";
import type { TPlanDragMode, TPlanDragState, TPlanDragTarget } from "./use-plan-bar-drag";
import { planDragKey } from "./use-plan-bar-drag";

const I18N = "project_stage.plan";

/** 迭代用紫色系（label-purple 变量，跟着明暗主题走），和阶段的状态色、工作项的状态色都错开 */
export const PLAN_CYCLE_COLORS = {
  track: "var(--label-purple-bg)",
  fill: "var(--label-purple-focus)",
  border: "var(--label-purple-border)",
  text: "var(--label-purple-text)",
  icon: "var(--label-purple-icon)",
};

const STAGE_BAR_CLASS: Record<EProjectStageStatus, string> = {
  [EProjectStageStatus.COMPLETED]: "border-transparent bg-success-primary text-on-color",
  [EProjectStageStatus.IN_PROGRESS]: "border-transparent bg-accent-primary text-on-color",
  [EProjectStageStatus.PAUSED]: "border-subtle bg-warning-subtle text-warning-primary",
  [EProjectStageStatus.NOT_STARTED]: "border-strong bg-layer-3 text-secondary",
};

/** 条窄过这个宽度就不给两端拉手，只能整条挪（不然拉手把条全盖住） */
const MIN_RESIZABLE_WIDTH = 24;

export type TPlanBarGeometry = {
  rangeStartDay: number;
  dayPx: number;
  todayDay: number;
};

export type TPlanDrag = {
  canEdit: Record<TPlanDragTarget["kind"], boolean>;
  drag: TPlanDragState | null;
  begin: (event: ReactPointerEvent, target: TPlanDragTarget, mode: TPlanDragMode) => void;
  displayRange: (target: TPlanDragTarget) => { start: number; end: number } | null;
  suppressClick: (event: SyntheticEvent) => void;
  /** 条上右键：阶段 / 工作项出「清除排期」菜单 */
  openMenu: (event: ReactMouseEvent, target: TPlanDragTarget) => void;
};

const Unscheduled = ({ left, small }: { left: number; small?: boolean }) => {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "pointer-events-none absolute z-[2] flex items-center rounded-md border border-dashed border-strong bg-surface-1 px-2.5 text-12 whitespace-nowrap text-tertiary",
        small ? "top-[7px] h-[18px]" : "top-[9px] h-[22px]"
      )}
      style={{ left }}
    >
      {t(`${I18N}.unscheduled`)}
    </span>
  );
};

/** 未排期的行：能编辑时整行是拖出热区 */
const CreateZone = ({
  editable,
  target,
  begin,
  children,
}: {
  editable: boolean;
  target: TPlanDragTarget;
  begin: TPlanDrag["begin"];
  children: ReactNode;
}) => (
  <div
    className={cn("absolute inset-0", editable && "cursor-crosshair")}
    onPointerDown={editable ? (event) => begin(event, target, "create") : undefined}
  >
    {children}
  </div>
);

/** 两端拉手：hover 条时才露出来 */
const Handles = ({
  show,
  target,
  begin,
}: {
  show: boolean;
  target: TPlanDragTarget;
  begin: TPlanDrag["begin"];
}) => {
  if (!show) return null;
  const handle = (mode: TPlanDragMode, side: "left" | "right") => (
    <span
      aria-hidden="true"
      onPointerDown={(event) => begin(event, target, mode)}
      className={cn(
        "absolute inset-y-0 z-[1] flex w-2 cursor-ew-resize items-center justify-center",
        side === "left" ? "left-0" : "right-0"
      )}
    >
      <span className="h-2.5 w-[3px] rounded-full bg-current opacity-0 transition-opacity group-hover/bar:opacity-60" />
    </span>
  );
  return (
    <>
      {handle("start", "left")}
      {handle("end", "right")}
    </>
  );
};

/** 拖动时条上方的日期 / 报错提示 */
const DragHint = ({ drag, left, width }: { drag: TPlanDragState; left: number; width: number }) => {
  const { t } = useTranslation();
  const text = drag.invalid
    ? drag.invalid.reason === "out_of_parent"
      ? t(`${I18N}.out_of_parent`, { name: drag.invalid.parentName })
      : drag.invalid.reason === "handoff_out"
        ? t(`${I18N}.handoff_out`, { date: formatShortDate(drag.invalid.date) })
        : t(`${I18N}.children_out`)
    : `${formatRange(fromDay(drag.start), fromDay(drag.end))} · ${t(`${I18N}.days`, { count: drag.end - drag.start + 1 })}`;
  return (
    <span
      className={cn(
        "pointer-events-none absolute -top-5 z-[5] -translate-x-1/2 rounded-md px-2.5 py-1 text-12 font-medium whitespace-nowrap shadow-raised-200",
        drag.invalid ? "bg-danger-primary text-on-color" : ""
      )}
      style={{
        left: left + width / 2,
        ...(drag.invalid ? {} : { background: "var(--txt-primary)", color: "var(--bg-surface-1)" }),
      }}
    >
      {text}
    </span>
  );
};

/** 拖动中原位置留一个虚线框 */
const OriginGhost = ({ left, width, className }: { left: number; width: number; className: string }) => (
  <span
    className={cn("pointer-events-none absolute z-[2] border-[1.5px] border-dashed border-strong", className)}
    style={{ left, width }}
  />
);

/** 一条正在拖的状态：本条的 drag、是否要显示提示、原位置 */
const useBarDrag = (target: TPlanDragTarget, geometry: TPlanBarGeometry, planDrag: TPlanDrag) => {
  const key = planDragKey(target);
  const range = planDrag.displayRange(target);
  const dragging = planDrag.drag?.key === key ? planDrag.drag : null;
  const showHint = Boolean(dragging && (dragging.moved || dragging.mode === "create"));
  const editable = planDrag.canEdit[target.kind];
  let origin: { left: number; width: number } | null = null;
  if (dragging?.moved && dragging.mode !== "create") {
    const dates =
      target.kind === "stage"
        ? { start: target.stage.start_date, end: target.stage.end_date }
        : target.kind === "cycle"
          ? { start: target.cycle.start_date, end: target.cycle.end_date }
          : {
              start: target.issue.start_date ?? target.issue.target_date,
              end: target.issue.target_date ?? target.issue.start_date,
            };
    if (dates.start && dates.end) {
      origin = {
        left: (toDay(dates.start) - geometry.rangeStartDay) * geometry.dayPx,
        width: spanDays(dates.start, dates.end) * geometry.dayPx,
      };
    }
  }
  return { range, dragging, showHint, editable, origin };
};

const StageBars = ({
  stage,
  hasChildStages,
  geometry,
  planDrag,
}: {
  stage: TProjectStage;
  hasChildStages: boolean;
  geometry: TPlanBarGeometry;
  planDrag: TPlanDrag;
}) => {
  const { rangeStartDay, dayPx, todayDay } = geometry;
  const target: TPlanDragTarget = { kind: "stage", stage };
  const { range, dragging, showHint, editable, origin } = useBarDrag(target, geometry, planDrag);
  const { begin, openMenu } = planDrag;

  if (!range) {
    return (
      <CreateZone editable={editable} target={target} begin={begin}>
        <Unscheduled left={(todayDay - rangeStartDay + 2) * dayPx} />
      </CreateZone>
    );
  }

  const left = (range.start - rangeStartDay) * dayPx;
  const width = (range.end - range.start + 1) * dayPx;
  const endX = left + width;
  const isDelayed = stage.is_delayed && stage.status !== EProjectStageStatus.COMPLETED && !dragging && todayDay > range.end;
  const handles = <Handles show={editable && width >= MIN_RESIZABLE_WIDTH} target={target} begin={begin} />;

  return (
    <>
      {origin && <OriginGhost {...origin} className="top-2 h-6 rounded-md" />}
      {isDelayed && (
        <span
          className="pointer-events-none absolute top-2 z-[2] h-6 rounded-r-md border border-l-0 border-danger-subtle bg-danger-subtle"
          style={{
            left: endX,
            width: (todayDay - range.end) * dayPx,
            backgroundImage: "repeating-linear-gradient(135deg, transparent 0 3px, rgba(231, 0, 11, 0.14) 3px 6px)",
          }}
        />
      )}
      {hasChildStages ? (
        // 父阶段：两端带小三角的汇总条，热区仍是整条高度
        <div
          data-plan-bar
          className={cn("group/bar absolute top-2 z-[2] h-6 text-secondary", editable && "cursor-grab")}
          style={{ left, width }}
          onPointerDown={editable ? (event) => begin(event, target, "move") : undefined}
          onContextMenu={editable ? (event) => openMenu(event, target) : undefined}
        >
          <span
            className="absolute inset-x-0 top-1.5 h-2 rounded-t-[2px]"
            style={{ background: dragging?.invalid ? "var(--bg-danger-primary)" : "var(--txt-secondary)" }}
          />
          <span
            className="absolute top-3.5 left-0 h-2 w-[9px]"
            style={{ background: "var(--txt-secondary)", clipPath: "polygon(0 0, 100% 0, 0 100%)" }}
          />
          <span
            className="absolute top-3.5 right-0 h-2 w-[9px]"
            style={{ background: "var(--txt-secondary)", clipPath: "polygon(0 0, 100% 0, 100% 100%)" }}
          />
          {handles}
        </div>
      ) : (
        <div
          data-plan-bar
          className={cn(
            "group/bar absolute top-2 z-[2] flex h-6 items-center overflow-hidden border px-2 text-12 font-semibold whitespace-nowrap shadow-raised-100",
            isDelayed ? "rounded-l-md" : "rounded-md",
            dragging?.mode === "create"
              ? "border-dashed border-accent-strong bg-accent-subtle text-accent-primary"
              : STAGE_BAR_CLASS[stage.status] ?? STAGE_BAR_CLASS[EProjectStageStatus.NOT_STARTED],
            editable && (dragging?.mode === "move" ? "cursor-grabbing" : "cursor-grab")
          )}
          style={{
            left,
            width,
            ...(dragging?.invalid
              ? { borderColor: "var(--bg-danger-primary)", background: "var(--bg-danger-subtle)", color: "var(--txt-danger-primary)" }
              : {}),
          }}
          onPointerDown={editable ? (event) => begin(event, target, "move") : undefined}
          onContextMenu={editable ? (event) => openMenu(event, target) : undefined}
        >
          {width >= 56 && <span className="pointer-events-none truncate">{stage.name}</span>}
          {handles}
        </div>
      )}
      {stage.is_milestone && (
        <span
          className="pointer-events-none absolute top-[13px] z-[3] size-3.5 rotate-45 rounded-[2px] border-2"
          style={{ left: endX - 7, background: "var(--txt-primary)", borderColor: "var(--bg-layer-1)" }}
        />
      )}
      {showHint && dragging && <DragHint drag={dragging} left={left} width={width} />}
    </>
  );
};

/** 迭代：胶囊 + 进度填充 + 百分比；热区比胶囊高一圈，好按 */
const CycleBars = ({
  row,
  geometry,
  planDrag,
  href,
}: {
  row: Extract<TPlanRow, { kind: "cycle" }>;
  geometry: TPlanBarGeometry;
  planDrag: TPlanDrag;
  href: string;
}) => {
  const { cycle } = row;
  const { rangeStartDay, dayPx, todayDay } = geometry;
  const target: TPlanDragTarget = { kind: "cycle", cycle };
  const { range, dragging, showHint, editable, origin } = useBarDrag(target, geometry, planDrag);
  const { begin, suppressClick } = planDrag;

  if (!range) {
    return (
      <CreateZone editable={editable} target={target} begin={begin}>
        <Unscheduled left={(todayDay - rangeStartDay + 2) * dayPx} />
      </CreateZone>
    );
  }

  const left = (range.start - rangeStartDay) * dayPx;
  const width = (range.end - range.start + 1) * dayPx;
  const creating = dragging?.mode === "create";

  return (
    <>
      {origin && <OriginGhost {...origin} className="top-[11px] h-3.5 rounded-full" />}
      <div
        data-plan-bar
        className={cn(
          "group/bar absolute top-2 z-[2] h-5",
          editable && (dragging?.mode === "move" ? "cursor-grabbing" : "cursor-grab")
        )}
        style={{ left, width }}
        onPointerDown={editable ? (event) => begin(event, target, "move") : undefined}
      >
        <Link
          href={href}
          draggable={false}
          onClick={suppressClick}
          title={`${cycle.name} · ${formatRange(fromDay(range.start), fromDay(range.end))}`}
          className={cn(
            "absolute inset-x-0 top-[3px] block h-3.5 overflow-hidden rounded-full border-[1.5px]",
            creating && "border-dashed"
          )}
          style={{ background: PLAN_CYCLE_COLORS.track, borderColor: creating ? PLAN_CYCLE_COLORS.fill : PLAN_CYCLE_COLORS.border }}
        >
          <span className="block h-full" style={{ width: `${row.progress}%`, background: PLAN_CYCLE_COLORS.fill }} />
        </Link>
        <Handles show={editable && width >= MIN_RESIZABLE_WIDTH} target={target} begin={begin} />
      </div>
      <span
        className="pointer-events-none absolute top-[9px] z-[2] flex h-[18px] items-center text-11 font-semibold tabular-nums"
        style={{ left: left + width + 7, color: PLAN_CYCLE_COLORS.text }}
      >
        {row.progress}%
      </span>
      {showHint && dragging && <DragHint drag={dragging} left={left} width={width} />}
    </>
  );
};

/** 工作项：细线条（状态色）；在迭代下面时先铺迭代窗口底色 */
const IssueBars = ({
  row,
  geometry,
  planDrag,
  href,
}: {
  row: Extract<TPlanRow, { kind: "issue" }>;
  geometry: TPlanBarGeometry;
  planDrag: TPlanDrag;
  href: string;
}) => {
  const { issue, window } = row;
  const { rangeStartDay, dayPx, todayDay } = geometry;
  const target: TPlanDragTarget = { kind: "issue", issue };
  const { range, dragging, showHint, editable, origin } = useBarDrag(target, geometry, planDrag);
  const { begin, suppressClick, openMenu } = planDrag;
  const color = STATE_GROUPS[issue.state_group]?.color ?? STATE_GROUPS.unstarted.color;

  const windowShade = window && (
    <span
      className="pointer-events-none absolute inset-y-0 z-[1] border-x"
      style={{
        left: (toDay(window.start) - rangeStartDay) * dayPx,
        width: spanDays(window.start, window.end) * dayPx,
        background: PLAN_CYCLE_COLORS.track,
        borderColor: PLAN_CYCLE_COLORS.fill,
        opacity: 0.75,
      }}
    />
  );

  if (!range) {
    return (
      <>
        {windowShade}
        <CreateZone editable={editable} target={target} begin={begin}>
          <Unscheduled left={(todayDay - rangeStartDay + 2) * dayPx} small />
        </CreateZone>
      </>
    );
  }

  const left = (range.start - rangeStartDay) * dayPx;
  const width = Math.max((range.end - range.start + 1) * dayPx, 6);

  return (
    <>
      {windowShade}
      {origin && <OriginGhost {...origin} className="top-[11px] h-2.5 rounded-full" />}
      <div
        data-plan-bar
        className={cn(
          "group/bar absolute top-1.5 z-[2] h-5",
          editable && (dragging?.mode === "move" ? "cursor-grabbing" : "cursor-grab")
        )}
        style={{ left, width }}
        onPointerDown={editable ? (event) => begin(event, target, "move") : undefined}
        onContextMenu={editable ? (event) => openMenu(event, target) : undefined}
      >
        <Link
          href={href}
          draggable={false}
          onClick={suppressClick}
          title={`${issue.name} · ${formatRange(fromDay(range.start), fromDay(range.end))}`}
          className={cn("absolute inset-x-0 top-1.5 block h-2 rounded-full", dragging?.mode === "create" && "opacity-60")}
          style={{ background: color }}
        />
        <Handles show={editable && width >= MIN_RESIZABLE_WIDTH} target={target} begin={begin} />
      </div>
      {showHint && dragging && <DragHint drag={dragging} left={left} width={width} />}
    </>
  );
};

/** 一行的时间轴内容（不含网格线，网格线由外层整块画） */
export const PlanRowBars = ({
  row,
  geometry,
  planDrag,
  cycleHref,
  issueHref,
}: {
  row: TPlanRow;
  geometry: TPlanBarGeometry;
  planDrag: TPlanDrag;
  cycleHref: (cycleId: string) => string;
  issueHref: (sequenceId: number, issueId: string) => string;
}) => {
  switch (row.kind) {
    case "stage":
      return <StageBars stage={row.stage} hasChildStages={row.hasChildStages} geometry={geometry} planDrag={planDrag} />;
    case "cycle":
      return <CycleBars row={row} geometry={geometry} planDrag={planDrag} href={cycleHref(row.cycle.id)} />;
    case "issue":
      return (
        <IssueBars
          row={row}
          geometry={geometry}
          planDrag={planDrag}
          href={issueHref(row.issue.sequence_id, row.issue.id)}
        />
      );
    default:
      return null;
  }
};
