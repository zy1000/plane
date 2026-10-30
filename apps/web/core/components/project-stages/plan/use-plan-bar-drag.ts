import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, SyntheticEvent } from "react";
import type { TProjectStage } from "@plane/types";
import type { TProjectStagePlanCycle, TProjectStagePlanIssue } from "@/services/project-stage.service";
import { fromDay, toDay } from "./plan-scale";

/** 能在时间轴上拖的三类条 */
export type TPlanDragTarget =
  | { kind: "stage"; stage: TProjectStage }
  | { kind: "cycle"; cycle: TProjectStagePlanCycle }
  | { kind: "issue"; issue: TProjectStagePlanIssue };

export type TPlanDragMode = "move" | "start" | "end" | "create";

/**
 * 校验不过的原因：阶段超出父阶段范围 / 阶段有子阶段落在新范围外 /
 * 迭代拉两端后测试移交日期落在范围外（后端要求移交日期必须在起止之间）
 */
export type TPlanDragInvalid =
  | { reason: "out_of_parent"; parentName: string }
  | { reason: "children_out" }
  | { reason: "handoff_out"; date: string };

export type TPlanDragState = {
  key: string;
  mode: TPlanDragMode;
  start: number;
  end: number;
  moved: boolean;
  invalid: TPlanDragInvalid | null;
};

/** 松手提交的日期；迭代整条挪时测试移交日期跟着挪 */
export type TPlanDates = { start: string; end: string; testHandoff?: string };

type TDragSession = {
  target: TPlanDragTarget;
  key: string;
  mode: TPlanDragMode;
  originX: number;
  originStart: number;
  originEnd: number;
  /** create 模式按下那一天 */
  anchorDay: number;
};

/** 小于这个距离算点击，不算拖 */
const MOVE_THRESHOLD_PX = 3;

export const planDragKey = (target: TPlanDragTarget) => {
  switch (target.kind) {
    case "stage":
      return `stage:${target.stage.id}`;
    case "cycle":
      return `cycle:${target.cycle.id}`;
    case "issue":
      return `issue:${target.issue.id}`;
  }
};

/** 条现在的起止；工作项只填了一头时另一头按同一天算 */
const datesOf = (target: TPlanDragTarget): { start: string | null; end: string | null } => {
  switch (target.kind) {
    case "stage":
      return { start: target.stage.start_date, end: target.stage.end_date };
    case "cycle":
      return { start: target.cycle.start_date, end: target.cycle.end_date };
    case "issue":
      return {
        start: target.issue.start_date ?? target.issue.target_date,
        end: target.issue.target_date ?? target.issue.start_date,
      };
  }
};

/** 在未排期的行上只点一下、没拖：阶段按周期放一条，其他放一天 */
const defaultDuration = (target: TPlanDragTarget) =>
  target.kind === "stage" ? Math.max(1, target.stage.duration_days ?? 1) : 1;

const clearBodyStyles = () => {
  document.body.style.removeProperty("user-select");
  document.body.style.removeProperty("cursor");
};

/**
 * 时间轴上条的拖动：整条挪、拉两端、在未排期的行上拖出一条。阶段、迭代、工作项共用。
 *
 * - 松手才提交，提交时开始、结束一起带上：阶段后端 `resolve_schedule` 只收到开始时会按原周期顺延结束，
 *   拉左端就会变成整条平移
 * - 阶段的父子范围、迭代的测试移交日期前端先判一遍（后端也会拦）：不过就标红，松手弹回、不发请求；
 *   迭代整条挪时移交日期跟着挪，所以只有拉两端才判
 * - 提交到数据回来之间，条停在新位置（`pending`），不闪回旧位置
 * - 条本身是链接时，拖完松手的那下 click 要吞掉（`suppressClick`），不然一拖就跳页
 * - 手势被浏览器取消（`pointercancel`，比如触屏变成了原生滚动）和按 Esc 一样：丢掉、不提交
 */
export const usePlanBarDrag = ({
  stages,
  rangeStartDay,
  dayPx,
  getTimelineLeft,
  onCommit,
}: {
  stages: TProjectStage[];
  rangeStartDay: number;
  dayPx: number;
  /** 时间轴内容区左边缘在视口里的 x（随横向滚动变化） */
  getTimelineLeft: () => number;
  onCommit: (target: TPlanDragTarget, dates: TPlanDates) => Promise<void>;
}) => {
  const [drag, setDrag] = useState<TPlanDragState | null>(null);
  const [pending, setPending] = useState<Map<string, { start: number; end: number }>>(new Map());
  const sessionRef = useRef<TDragSession | null>(null);
  const dragRef = useRef<TPlanDragState | null>(null);
  dragRef.current = drag;
  const lastDragEndRef = useRef(0);

  const byId = useMemo(() => new Map(stages.map((stage) => [stage.id, stage])), [stages]);
  const childrenOf = useMemo(() => {
    const map = new Map<string, TProjectStage[]>();
    for (const stage of stages) {
      if (!stage.parent_id) continue;
      map.set(stage.parent_id, [...(map.get(stage.parent_id) ?? []), stage]);
    }
    return map;
  }, [stages]);

  const validate = useCallback(
    (target: TPlanDragTarget, mode: TPlanDragMode, start: number, end: number): TPlanDragInvalid | null => {
      if (target.kind === "cycle") {
        const handoff = target.cycle.test_handoff_date;
        if (mode === "move" || !handoff) return null;
        const handoffDay = toDay(handoff);
        return handoffDay < start || handoffDay > end ? { reason: "handoff_out", date: handoff } : null;
      }
      if (target.kind !== "stage") return null;
      const { stage } = target;
      const parent = stage.parent_id ? byId.get(stage.parent_id) : undefined;
      if (parent?.start_date && parent.end_date) {
        if (start < toDay(parent.start_date) || end > toDay(parent.end_date)) {
          return { reason: "out_of_parent", parentName: parent.name };
        }
      }
      for (const child of childrenOf.get(stage.id) ?? []) {
        if (!child.start_date || !child.end_date) continue;
        if (toDay(child.start_date) < start || toDay(child.end_date) > end) return { reason: "children_out" };
      }
      return null;
    },
    [byId, childrenOf]
  );

  const dayAt = useCallback(
    (clientX: number) => rangeStartDay + Math.floor((clientX - getTimelineLeft()) / dayPx),
    [rangeStartDay, dayPx, getTimelineLeft]
  );

  const rangeFor = useCallback(
    (session: TDragSession, clientX: number) => {
      const delta = Math.round((clientX - session.originX) / dayPx);
      switch (session.mode) {
        case "move":
          return { start: session.originStart + delta, end: session.originEnd + delta };
        case "start":
          return { start: Math.min(session.originStart + delta, session.originEnd), end: session.originEnd };
        case "end":
          return { start: session.originStart, end: Math.max(session.originEnd + delta, session.originStart) };
        case "create": {
          const current = dayAt(clientX);
          return { start: Math.min(session.anchorDay, current), end: Math.max(session.anchorDay, current) };
        }
      }
    },
    [dayPx, dayAt]
  );

  /** 丢掉当前手势，不提交 */
  const cancel = useCallback(() => {
    sessionRef.current = null;
    clearBodyStyles();
    setDrag(null);
  }, []);

  const finish = useCallback(async () => {
    const session = sessionRef.current;
    const state = dragRef.current;
    sessionRef.current = null;
    clearBodyStyles();
    if (!session || !state) {
      setDrag(null);
      return;
    }
    let { start, end } = state;
    if (session.mode === "create" && !state.moved) {
      start = session.anchorDay;
      end = start + defaultDuration(session.target) - 1;
    } else if (!state.moved) {
      setDrag(null);
      return;
    }
    lastDragEndRef.current = Date.now();
    const invalid = validate(session.target, session.mode, start, end);
    // 「没变化就不提交」只对已有排期；拖出来的新排期 origin 就是按下那天，1 天的也要提交
    const unchanged = session.mode !== "create" && start === session.originStart && end === session.originEnd;
    setDrag(null);
    if (invalid || unchanged) return;

    const dates: TPlanDates = { start: fromDay(start), end: fromDay(end) };
    if (session.mode === "move" && session.target.kind === "cycle" && session.target.cycle.test_handoff_date) {
      dates.testHandoff = fromDay(toDay(session.target.cycle.test_handoff_date) + (start - session.originStart));
    }

    const { key } = session;
    setPending((current) => new Map(current).set(key, { start, end }));
    try {
      await onCommit(session.target, dates);
    } finally {
      setPending((current) => {
        const next = new Map(current);
        next.delete(key);
        return next;
      });
    }
  }, [onCommit, validate]);

  useEffect(() => {
    if (!drag) return;
    const handleMove = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session) return;
      const moved = Math.abs(event.clientX - session.originX) >= MOVE_THRESHOLD_PX;
      const { start, end } = rangeFor(session, event.clientX);
      setDrag((current) =>
        current
          ? {
              ...current,
              start,
              end,
              moved: current.moved || moved,
              invalid: validate(session.target, session.mode, start, end),
            }
          : current
      );
    };
    const handleUp = () => void finish();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") cancel();
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", handleKey);
    };
    // 只在拖动开始 / 结束时挂卸监听；过程中的状态走 ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(drag), rangeFor, validate, finish, cancel]);

  const begin = useCallback(
    (event: ReactPointerEvent, target: TPlanDragTarget, mode: TPlanDragMode) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const anchorDay = dayAt(event.clientX);
      const dates = datesOf(target);
      const originStart = dates.start ? toDay(dates.start) : anchorDay;
      const originEnd = dates.end ? toDay(dates.end) : anchorDay;
      const key = planDragKey(target);
      sessionRef.current = { target, key, mode, originX: event.clientX, originStart, originEnd, anchorDay };
      document.body.style.userSelect = "none";
      document.body.style.cursor = mode === "move" ? "grabbing" : mode === "create" ? "crosshair" : "ew-resize";
      setDrag({
        key,
        mode,
        start: mode === "create" ? anchorDay : originStart,
        end: mode === "create" ? anchorDay : originEnd,
        moved: false,
        invalid: null,
      });
    },
    [dayAt]
  );

  /** 条现在该画在哪：拖动中 > 刚提交还没回来 > 数据本身；没有日期返回 null */
  const displayRange = useCallback(
    (target: TPlanDragTarget): { start: number; end: number } | null => {
      const key = planDragKey(target);
      if (drag && drag.key === key && (drag.moved || drag.mode === "create")) {
        return { start: drag.start, end: drag.end };
      }
      const override = pending.get(key);
      if (override) return override;
      const dates = datesOf(target);
      if (!dates.start || !dates.end) return null;
      return { start: toDay(dates.start), end: toDay(dates.end) };
    },
    [drag, pending]
  );

  /** 挂在条的 onClick 上：刚拖完松手带出的那下 click 不算点击 */
  const suppressClick = useCallback((event: SyntheticEvent) => {
    if (Date.now() - lastDragEndRef.current < 400) event.preventDefault();
  }, []);

  return { drag, begin, displayRange, suppressClick };
};
