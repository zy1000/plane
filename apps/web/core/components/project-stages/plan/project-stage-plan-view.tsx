import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import type { TProjectStage } from "@plane/types";
import { cn, generateWorkItemLink } from "@plane/utils";
import { useProject } from "@/hooks/store/use-project";
import type { TProjectStagePlanData } from "@/services/project-stage.service";
import type { TPlanRange, TPlanScale } from "./plan-scale";
import {
  PLAN_EDGE_PX,
  PLAN_LEFT_WIDTH,
  PLAN_SCALE_DAY_PX,
  buildPlanTicks,
  computePlanRange,
  extendPlanRange,
  toDay,
  unionPlanRange,
} from "./plan-scale";
import type { TPlanBarMenuState } from "./plan-bar-menu";
import { PlanBarMenu } from "./plan-bar-menu";
import type { TPlanOwnerChange } from "./plan-owner-cell";
import type { TPlanLevel, TPlanRow } from "./plan-tree";
import { PLAN_ROW_HEIGHT, buildPlanRows } from "./plan-tree";
import type { TPlanDrag } from "./plan-row-bars";
import { PlanRowBars } from "./plan-row-bars";
import { PLAN_LEFT_COLUMNS, PlanRowName } from "./plan-row-name";
import { PlanToolbar } from "./plan-toolbar";
import type { TPlanDates, TPlanDragTarget } from "./use-plan-bar-drag";
import { usePlanBarDrag } from "./use-plan-bar-drag";
import { usePlanPan } from "./use-plan-pan";

const I18N = "project_stage.plan";

/** 行对应的可拖对象；分组行、「不在迭代中」、「查看全部」没有 */
const rowTarget = (row: TPlanRow): TPlanDragTarget | null => {
  switch (row.kind) {
    case "stage":
      return { kind: "stage", stage: row.stage };
    case "cycle":
      return { kind: "cycle", cycle: row.cycle };
    case "issue":
      return { kind: "issue", issue: row.issue };
    default:
      return null;
  }
};

/**
 * 规划页主体：阶段 › 迭代 › 工作项一棵树，右边时间轴。
 *
 * 一个滚动容器同时管横竖两个方向：表头 sticky 在顶、左栏每格 sticky 在左。
 * 时间轴两头没有尽头：滚到离边不到 `PLAN_EDGE_PX` 就再接几个月，往前接的那段把 scrollLeft 补回去，
 * 画面不跳；按住右键能拖着平移；条上右键出「清除排期」。
 */
export const ProjectStagePlanView = observer(function ProjectStagePlanView({
  workspaceSlug,
  projectId,
  stages,
  data,
  search,
  canEdit,
  today,
  onEditStage,
  onCommitDates,
  onChangeOwner,
  onClearDates,
}: {
  workspaceSlug: string;
  projectId: string;
  stages: TProjectStage[];
  data: TProjectStagePlanData;
  search: string;
  canEdit: TPlanDrag["canEdit"];
  today: string;
  onEditStage: (stage: TProjectStage) => void;
  onCommitDates: (target: TPlanDragTarget, dates: TPlanDates) => Promise<void>;
  onChangeOwner: (change: TPlanOwnerChange) => void;
  onClearDates: (target: TPlanDragTarget) => void;
}) {
  const { t } = useTranslation();
  const { getProjectById } = useProject();
  const projectIdentifier = getProjectById(projectId)?.identifier ?? "";

  const [level, setLevel] = useState<TPlanLevel>("issue");
  const [scale, setScale] = useState<TPlanScale>("month");
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState<Set<string>>(new Set());

  const rows = useMemo(
    () =>
      buildPlanRows({
        stages,
        cycles: data.cycles,
        issues: data.issues,
        level,
        toggled,
        showAll,
        keyword: search,
        projectIdentifier,
      }),
    [stages, data, level, toggled, showAll, search, projectIdentifier]
  );

  // 数据撑出来的范围；实际画的范围（range）只会比它大：滚出来的部分不缩回去
  const dataRange = useMemo(
    () =>
      computePlanRange(
        [
          ...stages.flatMap((stage) => [stage.start_date, stage.end_date]),
          ...data.cycles.flatMap((cycle) => [cycle.start_date, cycle.end_date]),
          ...data.issues.flatMap((issue) => [issue.start_date, issue.target_date]),
        ],
        today
      ),
    [stages, data, today]
  );
  const [range, setRange] = useState<TPlanRange>(dataRange);
  useEffect(() => {
    setRange((current) => {
      const next = unionPlanRange(current, dataRange);
      return next.startDay === current.startDay && next.endDay === current.endDay ? current : next;
    });
  }, [dataRange]);

  const dayPx = PLAN_SCALE_DAY_PX[scale];
  const ticks = useMemo(() => buildPlanTicks(range, scale), [range, scale]);
  const timelineWidth = range.days * dayPx;
  const todayDay = toDay(today);
  const todayX = (todayDay - range.startDay + 0.5) * dayPx;
  const geometry = useMemo(
    () => ({ rangeStartDay: range.startDay, dayPx, todayDay }),
    [range.startDay, dayPx, todayDay]
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const { onPointerDown: beginPan, onContextMenu: suppressContextMenu } = usePlanPan(scrollRef);
  const [menu, setMenu] = useState<TPlanBarMenuState | null>(null);
  const openMenu = useCallback((event: ReactMouseEvent, target: TPlanDragTarget) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, target });
  }, []);
  const closeMenu = useCallback(() => setMenu(null), []);

  // 离两头不到缓冲就再接：onScroll 里查，范围 / 刻度变了之后也查一遍（右边不够宽会连着接到够为止）
  const ensureBuffer = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    const before = element.scrollLeft < PLAN_EDGE_PX;
    const after = element.scrollLeft + element.clientWidth > element.scrollWidth - PLAN_EDGE_PX;
    if (!before && !after) return;
    setRange((current) => {
      let next = current;
      if (before) next = extendPlanRange(next, "before", dayPx);
      if (after) next = extendPlanRange(next, "after", dayPx);
      return next;
    });
  }, [dayPx]);
  // 往前接了几个月，scrollLeft 补上同样的宽度，画面停在原地
  const prevStartDayRef = useRef(range.startDay);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    const delta = (prevStartDayRef.current - range.startDay) * dayPx;
    prevStartDayRef.current = range.startDay;
    if (element && delta > 0) element.scrollLeft += delta;
    ensureBuffer();
  }, [range, dayPx, ensureBuffer]);

  const getTimelineLeft = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return 0;
    return element.getBoundingClientRect().left + PLAN_LEFT_WIDTH - element.scrollLeft;
  }, []);
  const { drag, begin, displayRange, suppressClick } = usePlanBarDrag({
    stages,
    rangeStartDay: range.startDay,
    dayPx,
    getTimelineLeft,
    onCommit: onCommitDates,
  });
  const canEditStable = useMemo(
    () => ({ stage: canEdit.stage, cycle: canEdit.cycle, issue: canEdit.issue }),
    [canEdit.stage, canEdit.cycle, canEdit.issue]
  );
  const planDrag = useMemo<TPlanDrag>(
    () => ({ canEdit: canEditStable, drag, begin, displayRange, suppressClick, openMenu }),
    [canEditStable, drag, begin, displayRange, suppressClick, openMenu]
  );

  const scrollToToday = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollLeft = Math.max(0, todayX - (element.clientWidth - PLAN_LEFT_WIDTH) / 3);
  }, [todayX]);
  // 进视图、换刻度时把今天放到可视区左侧三分之一处
  useLayoutEffect(() => {
    scrollToToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale]);

  const stagesById = useMemo(() => new Map(stages.map((stage) => [stage.id, stage])), [stages]);
  const counts = useMemo(
    () => ({
      stages: stages.length,
      cycles: data.cycles.length,
      issues: data.issues.length,
      milestones: stages.filter((stage) => stage.is_milestone).length,
      delayed: stages.filter((stage) => stage.is_delayed).length,
    }),
    [stages, data]
  );

  const cycleHref = useCallback(
    (cycleId: string) => `/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}`,
    [workspaceSlug, projectId]
  );
  const issueHref = useCallback(
    (sequenceId: number, issueId: string) =>
      generateWorkItemLink({ workspaceSlug, projectId, issueId, projectIdentifier, sequenceId }),
    [workspaceSlug, projectId, projectIdentifier]
  );

  const toggle = useCallback((rowId: string) => {
    setToggled((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }, []);
  const expandAll = useCallback((nodeId: string) => setShowAll((current) => new Set(current).add(nodeId)), []);
  const changeLevel = (next: TPlanLevel) => {
    setLevel(next);
    setToggled(new Set());
  };

  const topLabel = (tick: (typeof ticks.top)[number], index: number) =>
    scale === "quarter"
      ? t(`${I18N}.quarter`, { year: tick.year, quarter: Math.ceil(tick.month / 3) })
      : index === 0 || tick.month === 1
        ? t(`${I18N}.year_month`, { year: tick.year, month: tick.month })
        : t(`${I18N}.month`, { month: tick.month });
  const bottomLabel = (tick: (typeof ticks.bottom)[number]) =>
    scale === "quarter" ? t(`${I18N}.month`, { month: tick.month }) : String(tick.day);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PlanToolbar
        counts={counts}
        level={level}
        onLevelChange={changeLevel}
        scale={scale}
        onScaleChange={setScale}
        onToday={scrollToToday}
      />
      <div ref={scrollRef} onScroll={ensureBuffer} className="relative min-h-0 flex-1 overflow-auto">
        <div className="relative min-h-full" style={{ width: PLAN_LEFT_WIDTH + timelineWidth }}>
          {/* 表头 */}
          <div className="sticky top-0 z-[6] flex h-14 border-b border-subtle bg-surface-1">
            <div
              className="sticky left-0 z-[7] flex shrink-0 items-end border-r border-subtle bg-surface-1 pb-2.5 text-12 text-tertiary"
              style={{ width: PLAN_LEFT_WIDTH }}
            >
              <span className="flex-1 pl-[41px]">{t(`${I18N}.columns.name`)}</span>
              <span className="text-center" style={{ width: PLAN_LEFT_COLUMNS.owner }}>
                {t(`${I18N}.columns.owner`)}
              </span>
              <span className="pl-2" style={{ width: PLAN_LEFT_COLUMNS.plan }}>
                {t(`${I18N}.columns.plan`)}
              </span>
              <span className="pr-5 text-right" style={{ width: PLAN_LEFT_COLUMNS.duration }}>
                {t(`${I18N}.columns.duration`)}
              </span>
            </div>
            <div
              className="relative shrink-0 overflow-hidden"
              style={{ width: timelineWidth }}
              onPointerDown={beginPan}
              onContextMenu={suppressContextMenu}
            >
              {ticks.top.map((tick, index) => (
                <div
                  key={tick.key}
                  className="absolute top-0 flex h-7 items-center overflow-hidden border-b border-l border-subtle px-2.5 text-12 font-semibold whitespace-nowrap text-secondary"
                  style={{ left: tick.left, width: tick.width }}
                >
                  {topLabel(tick, index)}
                </div>
              ))}
              {ticks.bottom.map((tick) => (
                <div
                  key={tick.key}
                  className="absolute top-7 flex h-7 items-center overflow-hidden border-l border-subtle pl-1.5 text-11 whitespace-nowrap text-tertiary tabular-nums"
                  style={{ left: tick.left, width: tick.width }}
                >
                  {bottomLabel(tick)}
                </div>
              ))}
              <span
                className="absolute top-1 flex h-5 -translate-x-full items-center rounded-[5px] bg-accent-primary px-2 text-11 font-semibold text-on-color"
                style={{ left: todayX + 1 }}
              >
                {t(`${I18N}.today`)}
              </span>
            </div>
          </div>

          {/* 网格线：细线每格一条，粗线按月（季刻度按季） */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-14 bottom-0 z-[1]"
            style={{ left: PLAN_LEFT_WIDTH, width: timelineWidth }}
          >
            {ticks.minorLines.map((tick) => (
              <span
                key={tick.key}
                className="absolute inset-y-0 w-px opacity-50"
                style={{ left: tick.left, background: "var(--border-subtle)" }}
              />
            ))}
            {ticks.majorLines.map((tick) => (
              <span
                key={tick.key}
                className="absolute inset-y-0 w-px"
                style={{ left: tick.left, background: "var(--border-subtle)" }}
              />
            ))}
          </div>

          {rows.length === 0 ? (
            <div
              className="sticky left-0 grid h-40 place-items-center text-13 text-tertiary"
              style={{ width: scrollRef.current?.clientWidth ?? "100%" }}
            >
              {t(`${I18N}.empty`)}
            </div>
          ) : (
            rows.map((row) => {
              const target = rowTarget(row);
              return (
                <div
                  key={row.id}
                  className={cn(
                    "flex border-b border-subtle",
                    (row.kind === "stage" || row.kind === "group") && "bg-layer-1"
                  )}
                  style={{ height: PLAN_ROW_HEIGHT[row.kind] }}
                >
                  <PlanRowName
                    row={row}
                    stagesById={stagesById}
                    range={target ? displayRange(target) : null}
                    today={today}
                    canEdit={canEditStable}
                    projectId={projectId}
                    projectIdentifier={projectIdentifier}
                    cycleHref={cycleHref}
                    issueHref={issueHref}
                    onToggle={toggle}
                    onShowAll={expandAll}
                    onEditStage={onEditStage}
                    onChangeOwner={onChangeOwner}
                  />
                  <div
                    className="relative shrink-0"
                    style={{ width: timelineWidth }}
                    onPointerDown={beginPan}
                    onContextMenu={suppressContextMenu}
                  >
                    <PlanRowBars
                      row={row}
                      geometry={geometry}
                      planDrag={planDrag}
                      cycleHref={cycleHref}
                      issueHref={issueHref}
                    />
                  </div>
                </div>
              );
            })
          )}

          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 z-[3] w-0.5 bg-accent-primary opacity-80"
            style={{ left: PLAN_LEFT_WIDTH + todayX - 1 }}
          />
        </div>
      </div>
      <PlanBarMenu menu={menu} onClose={closeMenu} onClearDates={onClearDates} />
    </div>
  );
});
