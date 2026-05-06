/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { message, Modal } from "antd";
import { Beaker, ClipboardCheck, FolderOpen, Layers, Plus, Trash2 } from "lucide-react";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { cn } from "@plane/utils";
import {
  CATEGORY_PANEL_KIND,
  TIMESHEET_CATEGORY_KEY,
  type TTimesheetPanelKind,
} from "@/constants/timesheet-category";
import { calcWorkMinutes, getOverlappingBreaks } from "@/helpers/timesheet-break.helper";
import { useProject } from "@/hooks/store/use-project";
import type { TTimeSheet, TTimeSheetCreatePayload } from "@/services/issue/timesheet.service";
import { formatDateKey, isDateEditable, type TTimesheetRow } from "@/hooks/store/use-timesheet-page";
import type { useTimesheetPage } from "@/hooks/store/use-timesheet-page";
import { TimesheetRowAddModal } from "./timesheet-row-add-modal";
import { WorkItemTypeIcon } from "@/components/issues/work-item-type-icon";

const WEEK_DAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const HOUR_HEIGHT = 60; // px per hour
const TOTAL_HEIGHT = 24 * HOUR_HEIGHT;
const CONTENT_PADDING_TOP = 8; // 顶部留白，确保 00:00 标签可见
const SCROLLABLE_HEIGHT = TOTAL_HEIGHT + CONTENT_PADDING_TOP;
const HOURS = Array.from({ length: 25 }, (_, i) => i); // 0..24
const TIME_AXIS_WIDTH = 56; // px
const SNAP_MINUTES = 30;
const MIN_DURATION_MINUTES = 30;
const MAX_END_MINUTES = 24 * 60; // 24:00，后端通过 EndTimeField 转换存储
const SCROLL_EDGE_ZONE = 50; // 距滚动容器边缘多少 px 内触发自动滚动
const SCROLL_SPEED = 10; // 自动滚动最大速度（px/帧）

function parseTimeToMinutes(timeStr: string): number {
  const parts = timeStr.split(":");
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function formatHours(hours: number): string {
  if (hours === 0) return "0h";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function formatDayHeader(date: Date): { dayLabel: string; dateLabel: string } {
  const day = WEEK_DAY_LABELS[date.getDay() === 0 ? 6 : date.getDay() - 1];
  const dateLabel = formatDateKey(date).replace(/-/g, "/");
  return { dayLabel: day, dateLabel };
}

function minutesToTimeStr(totalMins: number): string {
  const clamped = Math.max(0, Math.min(totalMins, 24 * 60));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function snapToInterval(mins: number): number {
  return Math.round(mins / SNAP_MINUTES) * SNAP_MINUTES;
}

function pxToMinutes(px: number): number {
  return (px / HOUR_HEIGHT) * 60;
}

function minutesToPx(mins: number): number {
  return (mins / 60) * HOUR_HEIGHT;
}

function hasTimeOverlap(
  timesheets: TTimeSheet[],
  targetDate: string,
  startMins: number,
  endMins: number,
  excludeId: string
): boolean {
  return timesheets.some((t) => {
    if (t.id === excludeId || t.date !== targetDate) return false;
    const tStart = parseTimeToMinutes(t.start_time);
    const tEnd = parseTimeToMinutes(t.end_time);
    return startMins < tEnd && endMins > tStart;
  });
}

type TTimesheetBlock = TTimeSheet & {
  topPx: number;
  heightPx: number;
  kindLabel: string;
  label: string;
  projectName: string;
  blockType: TTimesheetBlockType;
  categoryKey: string;
};

type TTimesheetBlockType = TTimesheetPanelKind;

function getBlockType(timesheet: TTimeSheet): TTimesheetBlockType {
  const key = timesheet.category_detail?.key;
  if (key && CATEGORY_PANEL_KIND[key]) return CATEGORY_PANEL_KIND[key];
  if (timesheet.issue_detail) return "issue";
  if (timesheet.test_case_detail) return "test_case";
  return "project";
}

/**
 * 时间轴工时块的左边框/底色。
 *
 * - issue / test_case 沿用旧配色；
 * - 对于 project 面板，按类别 key 再区分：
 *   - PROJECT 走默认「成功色」，表示项目工时；
 *   - SAMPLE 单独走紫色，便于与项目工时肉眼区分；
 *   - 未来新增的 project 面板类别默认回落到灰色。
 */
function getBlockStyleClasses(block: TTimesheetBlock): string {
  if (block.blockType === "issue") {
    // 工作项工时拆分后按子类别着色；未识别的子类别回落到通用强调色
    switch (block.categoryKey) {
      case TIMESHEET_CATEGORY_KEY.REQUIREMENT:
        return "border-l-sky-500 bg-sky-500/[0.05]";
      case TIMESHEET_CATEGORY_KEY.TASK:
        return "border-l-teal-500 bg-teal-500/[0.05]";
      case TIMESHEET_CATEGORY_KEY.BUG:
        return "border-l-red-500 bg-red-500/[0.05]";
      default:
        return "border-l-accent-primary bg-accent-primary/[0.04]";
    }
  }
  if (block.blockType === "test_case") return "border-l-warning-primary bg-warning-primary/[0.04]";
  if (block.categoryKey === TIMESHEET_CATEGORY_KEY.SAMPLE) {
    return "border-l-purple-500 bg-purple-500/[0.04]";
  }
  if (block.categoryKey === TIMESHEET_CATEGORY_KEY.PROJECT) {
    return "border-l-success-primary bg-success-primary/[0.04]";
  }
  return "border-l-tertiary bg-layer-1/60";
}

function buildBlocks(
  timesheets: TTimeSheet[],
  getProjectById?: (id: string) => any
): TTimesheetBlock[] {
  return timesheets.map((t) => {
    const startMins = parseTimeToMinutes(t.start_time);
    const endMins = parseTimeToMinutes(t.end_time);
    const durationMins = Math.max(endMins - startMins, 15);
    const topPx = (startMins / 60) * HOUR_HEIGHT;
    const heightPx = Math.max((durationMins / 60) * HOUR_HEIGHT, 20);

    const project = getProjectById?.(String(t.project));
    const projectName = project?.name ?? "";
    const blockType = getBlockType(t);
    const categoryKey = t.category_detail?.key ?? TIMESHEET_CATEGORY_KEY.PROJECT;
    const categoryName = t.category_detail?.name;

    let kindLabel = categoryName ?? "项目";
    let label = projectName?.trim() ? projectName : categoryName ?? "项目工时";

    if (blockType === "issue" && t.issue_detail) {
      kindLabel = categoryName ?? "工作项工时";
      label = t.issue_detail.name;
    } else if (blockType === "test_case" && t.test_case_detail) {
      kindLabel = categoryName ?? "测试工时";
      label = t.test_case_detail.name;
    } else if (blockType === "project") {
      kindLabel = categoryName ?? "项目工时";
    }

    return { ...t, topPx, heightPx, kindLabel, label, projectName, blockType, categoryKey };
  });
}

function renderIssueTypeIcon(typeName: string | null | undefined, size = 3) {
  const sizeClass = size === 3 ? "h-3 w-3" : "h-3.5 w-3.5";
  const wrapClass = size === 3 ? "h-4 w-4" : "h-5 w-5";
  return <WorkItemTypeIcon typeName={typeName} className={wrapClass} iconClassName={sizeClass} />;
}

function renderBlockIcon(
  block: TTimesheetBlock,
  getProjectById: (id: string) => any,
  size = 3
) {
  const sizeClass = size === 3 ? "h-3 w-3" : "h-3.5 w-3.5";
  const wrapClass = size === 3 ? "h-4 w-4" : "h-5 w-5";

  if (block.blockType === "issue") {
    return renderIssueTypeIcon(block.issue_detail?.type_name, size);
  }

  if (block.blockType === "test_case") {
    return (
      <span
        className={`inline-flex ${wrapClass} shrink-0 items-center justify-center rounded`}
        style={{ backgroundColor: "#fffbeb", color: "#f59e0b" }}
      >
        <ClipboardCheck className={sizeClass} />
      </span>
    );
  }

  // project 面板：送样工时用独立图标，其余（项目工时 / 其他未来 project 类别）走项目 logo / 文件夹。
  if (block.categoryKey === TIMESHEET_CATEGORY_KEY.SAMPLE) {
    return (
      <span
        className={`inline-flex ${wrapClass} shrink-0 items-center justify-center rounded`}
        style={{ backgroundColor: "#faf5ff", color: "#a855f7" }}
      >
        <Beaker className={sizeClass} />
      </span>
    );
  }

  const project = getProjectById(String(block.project));
  if (project?.logo_props?.in_use) {
    return (
      <span className={`inline-flex ${wrapClass} shrink-0 items-center justify-center`}>
        <Logo logo={project.logo_props} size={size === 3 ? 12 : 14} />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex ${wrapClass} shrink-0 items-center justify-center rounded`}
      style={{ backgroundColor: "#eff6ff", color: "#3b82f6" }}
    >
      <FolderOpen className={sizeClass} />
    </span>
  );
}

/**
 * 渲染工时块内部与休息时段（午休 / 晚饭）相交的灰色"休息"覆盖。
 *
 * - 仅当工时块本身覆盖到休息段时才会渲染（即"如果有时间块才显示休息块"）。
 * - 位置基于块自身坐标系计算；父容器 `overflow-hidden` 自动负责越界裁切。
 * - `pointer-events: none` 避免干扰块的点击 / 拖拽。
 */
function BlockBreakOverlay({ startTime, endTime }: { startTime: string; endTime: string }) {
  const startMins = parseTimeToMinutes(startTime);
  const endMins = parseTimeToMinutes(endTime);
  const overlaps = getOverlappingBreaks(startMins, endMins);
  if (overlaps.length === 0) return null;
  return (
    <>
      {overlaps.map((ov) => {
        const top = ((ov.start - startMins) / 60) * HOUR_HEIGHT;
        const height = ((ov.end - ov.start) / 60) * HOUR_HEIGHT;
        return (
          <div
            key={`${ov.start}-${ov.end}`}
            className="absolute inset-x-0 z-[5] flex items-center justify-center border-y border-tertiary/25 bg-zinc-300/75 dark:bg-zinc-700/75 pointer-events-none select-none"
            style={{ top, height }}
          >
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Timeline block drag hook
// ---------------------------------------------------------------------------

type TDragInfo = {
  blockId: string;
  type: "resize-top" | "resize-bottom" | "move";
  block: TTimesheetBlock;
  startMouseY: number;
  startScrollTop: number;
  originalDate: string;
  originalStartMins: number;
  originalEndMins: number;
};

type TDragPreview = {
  blockId: string;
  block: TTimesheetBlock;
  topPx: number;
  heightPx: number;
  date: string;
  startTime: string;
  endTime: string;
};

function useTimelineBlockDrag({
  timesheets,
  updateTimesheet,
  scrollContainerRef,
}: {
  timesheets: TTimeSheet[];
  updateTimesheet: (id: string, data: Partial<TTimeSheetCreatePayload>) => Promise<TTimeSheet | undefined>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [dragPreview, setDragPreview] = useState<TDragPreview | null>(null);
  const dragRef = useRef<TDragInfo | null>(null);
  const previewRef = useRef<TDragPreview | null>(null);
  const loopIdRef = useRef(0);
  const cleanupRef = useRef<(() => void) | null>(null);
  const dayColumnRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragEndTimeRef = useRef(0);

  const timesheetsRef = useRef(timesheets);
  timesheetsRef.current = timesheets;
  const updateRef = useRef(updateTimesheet);
  updateRef.current = updateTimesheet;

  useEffect(() => () => { cleanupRef.current?.(); }, []);

  const startDrag = useCallback((
    e: React.MouseEvent,
    block: TTimesheetBlock,
    type: TDragInfo["type"],
    date: string
  ) => {
    e.preventDefault();
    e.stopPropagation();

    const startMins = parseTimeToMinutes(block.start_time);
    const endMins = parseTimeToMinutes(block.end_time);

    dragRef.current = {
      blockId: block.id,
      type,
      block,
      startMouseY: e.clientY,
      startScrollTop: scrollContainerRef.current?.scrollTop ?? 0,
      originalDate: date,
      originalStartMins: startMins,
      originalEndMins: endMins,
    };

    const initial: TDragPreview = {
      blockId: block.id,
      block,
      topPx: block.topPx,
      heightPx: block.heightPx,
      date,
      startTime: block.start_time.slice(0, 5),
      endTime: block.end_time.slice(0, 5),
    };
    previewRef.current = initial;
    setDragPreview(initial);

    const cursorValue = type === "move" ? "grabbing" : "ns-resize";
    const dragCursorStyle = document.createElement("style");
    dragCursorStyle.setAttribute("data-timeline-drag", "true");
    dragCursorStyle.textContent = `* { cursor: ${cursorValue} !important; }`;
    document.head.appendChild(dragCursorStyle);
    document.body.style.userSelect = "none";

    let lastClientX = e.clientX;
    let lastClientY = e.clientY;

    const computePreview = () => {
      const drag = dragRef.current;
      if (!drag) return;

      const scrollDelta = (scrollContainerRef.current?.scrollTop ?? 0) - drag.startScrollTop;
      const deltaY = lastClientY - drag.startMouseY + scrollDelta;
      const deltaMins = pxToMinutes(deltaY);
      let preview: TDragPreview;

      if (drag.type === "resize-top") {
        const raw = snapToInterval(drag.originalStartMins + deltaMins);
        const start = Math.max(0, Math.min(raw, drag.originalEndMins - MIN_DURATION_MINUTES));
        preview = {
          blockId: drag.blockId,
          block: drag.block,
          topPx: minutesToPx(start),
          heightPx: minutesToPx(drag.originalEndMins - start),
          date: drag.originalDate,
          startTime: minutesToTimeStr(start),
          endTime: minutesToTimeStr(drag.originalEndMins),
        };
      } else if (drag.type === "resize-bottom") {
        const raw = snapToInterval(drag.originalEndMins + deltaMins);
        const end = Math.min(MAX_END_MINUTES, Math.max(raw, drag.originalStartMins + MIN_DURATION_MINUTES));
        preview = {
          blockId: drag.blockId,
          block: drag.block,
          topPx: minutesToPx(drag.originalStartMins),
          heightPx: minutesToPx(end - drag.originalStartMins),
          date: drag.originalDate,
          startTime: minutesToTimeStr(drag.originalStartMins),
          endTime: minutesToTimeStr(end),
        };
      } else {
        const dur = drag.originalEndMins - drag.originalStartMins;
        const rawStart = snapToInterval(drag.originalStartMins + deltaMins);
        const start = Math.max(0, Math.min(rawStart, MAX_END_MINUTES - dur));
        const end = start + dur;

        let targetDate = drag.originalDate;
        for (const [colDate, el] of dayColumnRefs.current.entries()) {
          const rect = el.getBoundingClientRect();
          if (lastClientX >= rect.left && lastClientX < rect.right) {
            targetDate = colDate;
            break;
          }
        }

        preview = {
          blockId: drag.blockId,
          block: drag.block,
          topPx: minutesToPx(start),
          heightPx: minutesToPx(dur),
          date: targetDate,
          startTime: minutesToTimeStr(start),
          endTime: minutesToTimeStr(end),
        };
      }

      const prev = previewRef.current;
      if (
        prev &&
        prev.topPx === preview.topPx &&
        prev.heightPx === preview.heightPx &&
        prev.date === preview.date &&
        prev.startTime === preview.startTime &&
        prev.endTime === preview.endTime
      ) return;

      previewRef.current = preview;
      setDragPreview(preview);
    };

    const tick = () => {
      if (!dragRef.current) return;

      const container = scrollContainerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        const distTop = lastClientY - rect.top;
        const distBottom = rect.bottom - lastClientY;
        if (distTop > 0 && distTop < SCROLL_EDGE_ZONE) {
          container.scrollTop -= Math.ceil(SCROLL_SPEED * (1 - distTop / SCROLL_EDGE_ZONE));
        } else if (distBottom > 0 && distBottom < SCROLL_EDGE_ZONE) {
          container.scrollTop += Math.ceil(SCROLL_SPEED * (1 - distBottom / SCROLL_EDGE_ZONE));
        }
      }

      computePreview();
      loopIdRef.current = requestAnimationFrame(tick);
    };
    loopIdRef.current = requestAnimationFrame(tick);

    const onMove = (ev: MouseEvent) => {
      lastClientX = ev.clientX;
      lastClientY = ev.clientY;
    };

    const onUp = async () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      cancelAnimationFrame(loopIdRef.current);
      cleanupRef.current = null;
      document.head.querySelector("style[data-timeline-drag]")?.remove();
      document.body.style.userSelect = "";
      dragEndTimeRef.current = Date.now();

      const drag = dragRef.current;
      const preview = previewRef.current;
      dragRef.current = null;
      previewRef.current = null;

      if (!drag || !preview) {
        setDragPreview(null);
        return;
      }

      const origStart = minutesToTimeStr(drag.originalStartMins);
      const origEnd = minutesToTimeStr(drag.originalEndMins);
      if (
        preview.startTime === origStart &&
        preview.endTime === origEnd &&
        preview.date === drag.originalDate
      ) {
        setDragPreview(null);
        return;
      }

      if (!isDateEditable(preview.date)) {
        message.warning("目标日期已超出可填报范围，操作已取消");
        setDragPreview(null);
        return;
      }

      const newStart = parseTimeToMinutes(preview.startTime);
      const newEnd = parseTimeToMinutes(preview.endTime);
      if (hasTimeOverlap(timesheetsRef.current, preview.date, newStart, newEnd, drag.blockId)) {
        message.warning("该时间段与已有工时记录冲突，操作已取消");
        setDragPreview(null);
        return;
      }

      const workMinutes = calcWorkMinutes(newStart, newEnd);
      if (workMinutes <= 0) {
        message.warning("该时间段全部为休息时间，无法登记工时");
        setDragPreview(null);
        return;
      }
      const hours = String(Math.round((workMinutes / 60) * 100) / 100);
      try {
        await updateRef.current(drag.blockId, {
          date: preview.date,
          start_time: preview.startTime + ":00",
          end_time: preview.endTime + ":00",
          hours,
        });
      } catch (err: any) {
        message.error(err?.detail || err?.error || "更新工时失败");
      } finally {
        setDragPreview(null);
      }
    };

    cleanupRef.current = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      cancelAnimationFrame(loopIdRef.current);
      document.head.querySelector("style[data-timeline-drag]")?.remove();
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  return { dragPreview, startDrag, dayColumnRefs, dragEndTimeRef };
}

// ---------------------------------------------------------------------------
// Timeline view component
// ---------------------------------------------------------------------------

type TTimesheetTimelineViewProps = {
  timesheetPage: ReturnType<typeof useTimesheetPage>;
  workspaceSlug: string;
};

export const TimesheetTimelineView = observer(function TimesheetTimelineView({
  timesheetPage,
  workspaceSlug,
}: TTimesheetTimelineViewProps) {
  const { getProjectById } = useProject();
  const { timesheets, weekDays, getDayTotalHours, updateTimesheet, deleteTimesheet, createTimesheet, addRow } = timesheetPage;

  const today = formatDateKey(new Date());

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { dragPreview, startDrag, dayColumnRefs, dragEndTimeRef } = useTimelineBlockDrag({
    timesheets,
    updateTimesheet,
    scrollContainerRef,
  });

  const [hoverSlot, setHoverSlot] = useState<{ date: string; topPx: number; timeLabel: string } | null>(null);

  useEffect(() => {
    if (dragPreview) setHoverSlot(null);
  }, [dragPreview]);

  const handleColumnMouseMove = (e: React.MouseEvent, dateKey: string) => {
    if (dragPreview) return;
    if (!isDateEditable(dateKey)) { setHoverSlot(null); return; }
    const columnEl = dayColumnRefs.current.get(dateKey);
    if (!columnEl) return;
    const rect = columnEl.getBoundingClientRect();
    const relY = e.clientY - rect.top - CONTENT_PADDING_TOP;
    if (relY < 0) { setHoverSlot(null); return; }
    const mouseMins = pxToMinutes(relY);
    const blocks = blocksByDay.get(dateKey);
    const centerMins = snapToInterval(mouseMins);
    const startMins = Math.max(0, Math.min(centerMins - 30, MAX_END_MINUTES - 60));
    const endMins = Math.min(startMins + 60, MAX_END_MINUTES);
    if (blocks?.some((b) => {
      const bStart = parseTimeToMinutes(b.start_time);
      const bEnd = parseTimeToMinutes(b.end_time);
      return startMins < bEnd && endMins > bStart;
    })) { setHoverSlot(null); return; }
    const topPx = minutesToPx(startMins);
    const timeLabel = `${minutesToTimeStr(startMins)} – ${minutesToTimeStr(endMins)}`;
    setHoverSlot((prev) => {
      if (prev && prev.date === dateKey && prev.topPx === topPx) return prev;
      return { date: dateKey, topPx, timeLabel };
    });
  };

  const handleColumnMouseLeave = () => setHoverSlot(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const pendingCreateRef = useRef<{ date: string; startTime: string; endTime: string } | null>(null);

  const handleColumnClick = (e: React.MouseEvent, dateKey: string) => {
    if (Date.now() - dragEndTimeRef.current < 300) return;
    if (!isDateEditable(dateKey)) {
      message.warning("该日期已超出可填报范围");
      return;
    }
    const columnEl = dayColumnRefs.current.get(dateKey);
    if (!columnEl) return;
    const rect = columnEl.getBoundingClientRect();
    const relY = e.clientY - rect.top - CONTENT_PADDING_TOP;
    if (relY < 0) return;
    const centerMins = snapToInterval(pxToMinutes(relY));
    const startMins = Math.max(0, Math.min(centerMins - 30, MAX_END_MINUTES - 60));
    const endMins = Math.min(startMins + 60, MAX_END_MINUTES);
    pendingCreateRef.current = {
      date: dateKey,
      startTime: minutesToTimeStr(startMins) + ":00",
      endTime: minutesToTimeStr(endMins) + ":00",
    };
    setAddModalOpen(true);
  };

  const handleAddFromTimeline = (row: TTimesheetRow) => {
    addRow(row);
    const pc = pendingCreateRef.current;
    if (!pc) return;
    const startMins = parseTimeToMinutes(pc.startTime);
    const endMins = parseTimeToMinutes(pc.endTime);
    const workMinutes = calcWorkMinutes(startMins, endMins);
    if (workMinutes <= 0) {
      message.warning("该时间段全部为休息时间，无法登记工时");
      return;
    }
    const hours = String(Math.round((workMinutes / 60) * 100) / 100);
    createTimesheet(row.projectId, {
      date: pc.date,
      start_time: pc.startTime,
      end_time: pc.endTime,
      hours,
      issue: row.type === "issue" ? row.issueId : undefined,
      test_case: row.type === "test_case" ? row.testCaseId : undefined,
      category: row.categoryId,
    }).catch((err: any) => {
      message.error(err?.detail || err?.error || "创建工时失败");
    });
  };

  const blocksByDay = useMemo(() => {
    const map = new Map<string, TTimesheetBlock[]>();
    for (const day of weekDays) {
      const key = formatDateKey(day);
      const dayTimesheets = timesheets.filter((t) => t.date === key);
      map.set(key, buildBlocks(dayTimesheets, getProjectById));
    }
    return map;
  }, [timesheets, weekDays, getProjectById]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      const currentHour = new Date().getHours();
      scrollContainerRef.current.scrollTop = Math.max(0, CONTENT_PADDING_TOP + (currentHour - 1) * HOUR_HEIGHT);
    }
  }, []);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* 顶部表头 */}
      <div
        className="flex shrink-0 border-b border-subtle bg-layer-2"
        style={{ paddingLeft: TIME_AXIS_WIDTH }}
      >
        {weekDays.map((date) => {
          const key = formatDateKey(date);
          const { dayLabel, dateLabel } = formatDayHeader(date);
          const isToday = key === today;
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const dayHours = getDayTotalHours(key);
          return (
            <div
              key={key}
              className={cn(
                "flex-1 border-r border-subtle px-2 py-2 text-center text-sm",
                isToday ? "bg-accent-primary/5" : isWeekend ? "bg-layer-1" : ""
              )}
            >
              <div className={cn("font-semibold text-sm", isToday ? "text-accent-primary" : "text-secondary")}>
                {dayLabel}
                {dayHours > 0 && (
                  <>
                    <span className="text-subtle font-normal"> · </span>
                    <span className="font-medium">{formatHours(dayHours)}</span>
                  </>
                )}
              </div>
              <div className={cn("text-sm mt-0.5", isToday ? "text-accent-primary" : "text-tertiary")}>{dateLabel}</div>
            </div>
          );
        })}
      </div>

      {/* 可滚动时间轴区域 */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden"
      >
        <div className="flex" style={{ height: SCROLLABLE_HEIGHT }}>
          {/* 左侧时间刻度 */}
          <div className="shrink-0 relative border-r border-subtle bg-layer-2" style={{ width: TIME_AXIS_WIDTH, height: SCROLLABLE_HEIGHT }}>
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 flex items-start"
                style={{ top: CONTENT_PADDING_TOP + h * HOUR_HEIGHT - 8 }}
              >
                <span className="pl-2 text-xs text-tertiary tabular-nums w-full">
                  {h < 24 ? `${String(h).padStart(2, "0")}:00` : ""}
                </span>
              </div>
            ))}
          </div>

          {/* 日期列 */}
          {weekDays.map((date) => {
            const key = formatDateKey(date);
            const blocks = blocksByDay.get(key) ?? [];
            const isToday = key === today;
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;

            const nowMinutes = isToday
              ? new Date().getHours() * 60 + new Date().getMinutes()
              : null;

            return (
              <div
                key={key}
                ref={(el) => {
                  if (el) dayColumnRefs.current.set(key, el);
                  else dayColumnRefs.current.delete(key);
                }}
                className={cn(
                  "flex-1 relative border-r border-subtle",
                  isToday ? "bg-accent-primary/[0.02]" : isWeekend ? "bg-layer-1/30" : "bg-transparent",
                  isDateEditable(key) && "cursor-pointer"
                )}
                style={{ height: SCROLLABLE_HEIGHT }}
                onClick={(e) => handleColumnClick(e, key)}
                onMouseMove={(e) => handleColumnMouseMove(e, key)}
                onMouseLeave={handleColumnMouseLeave}
              >
                {/* 小时网格线 */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-subtle/50"
                    style={{ top: CONTENT_PADDING_TOP + h * HOUR_HEIGHT }}
                  />
                ))}

                {/* 当前时间线 */}
                {nowMinutes !== null && (
                  <div
                    className="absolute left-0 right-0 z-10 pointer-events-none"
                    style={{ top: CONTENT_PADDING_TOP + (nowMinutes / 60) * HOUR_HEIGHT }}
                  >
                    <div className="relative h-0">
                      <div className="absolute left-0 right-0 h-0.5 bg-red-400" />
                      <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-red-400" />
                    </div>
                  </div>
                )}

                {/* 悬浮新建提示 */}
                {hoverSlot && hoverSlot.date === key && !dragPreview && (
                  <div
                    className="absolute left-1 right-1 rounded-md bg-accent-primary/[0.06] border border-dashed border-accent-primary/25 pointer-events-none z-[1] flex items-center justify-center gap-1 transition-[top,opacity] duration-100"
                    style={{ top: CONTENT_PADDING_TOP + hoverSlot.topPx, height: HOUR_HEIGHT }}
                  >
                    <Plus className="h-4 w-4 text-accent-primary/40" />
                    <span className="text-xs font-medium text-accent-primary/40 tabular-nums">{hoverSlot.timeLabel}</span>
                  </div>
                )}

                {/* 工时块 */}
                {blocks.map((block) => {
                  const isDragged = dragPreview?.blockId === block.id;
                  const hoursStr = formatHours(parseFloat(block.hours));
                  const compact = block.heightPx < 36;
                  const timeRange = `${block.start_time.slice(0, 5)}–${block.end_time.slice(0, 5)}`;
                  const showProjectName = block.blockType !== "project" && block.projectName;
                  return (
                    <div
                      key={block.id}
                      className={cn(
                        "group/block absolute left-1 right-1 rounded-md overflow-hidden cursor-pointer select-none",
                        "border border-subtle/90 shadow-sm",
                        "border-l-[3px] transition-[opacity] hover:bg-layer-1",
                        getBlockStyleClasses(block),
                        isDragged && "invisible"
                      )}
                      style={{ top: CONTENT_PADDING_TOP + block.topPx, height: block.heightPx }}
                      title={`${block.kindLabel} · ${block.label}\n${timeRange}（${hoursStr}）`}
                      aria-label={`${block.kindLabel}，${block.label}，${timeRange}，${hoursStr}`}
                      onMouseDown={(e) => startDrag(e, block, "move", key)}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {/* 删除按钮 */}
                      <button
                        type="button"
                        className="absolute top-1 right-1 z-20 hidden h-5 w-5 items-center justify-center rounded text-tertiary transition-colors hover:text-red-400 hover:bg-red-50 group-hover/block:flex cursor-pointer"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          Modal.confirm({
                            title: "确认删除",
                            content: "确定要删除这条工时记录吗？此操作不可撤销。",
                            okText: "删除",
                            cancelText: "取消",
                            okButtonProps: { danger: true },
                            onOk: () => deleteTimesheet(block.id),
                          });
                        }}
                        aria-label="删除工时"
                      >
                        <Trash2 className="h-3 w-3" color="red"/>
                      </button>

                      {/* 上边界拖拽手柄 */}
                      <div
                        className="absolute inset-x-0 top-0 h-2 cursor-ns-resize z-10 group/top"
                        onMouseDown={(e) => { e.stopPropagation(); startDrag(e, block, "resize-top", key); }}
                      >
                        <div className="mx-auto mt-0.5 h-0.5 w-6 rounded-full bg-tertiary/0 transition-colors group-hover/top:bg-tertiary/40" />
                      </div>

                      <div
                        className={cn(
                          "flex h-full min-h-0 justify-start overflow-hidden px-2 py-1",
                          compact ? "flex-col gap-0" : "flex-col gap-0.5"
                        )}
                      >
                        <div className="flex items-center gap-1 min-w-0 pr-6">
                          {renderBlockIcon(block, getProjectById, compact ? 3 : 3)}
                          <p className="text-xs font-medium leading-snug text-primary truncate min-w-0">{block.label}</p>
                        </div>
                        {!compact && (
                          <p className="text-xs leading-snug text-tertiary tabular-nums truncate">
                            {showProjectName && (
                              <>
                                <span className="text-secondary font-medium">{block.projectName}</span>
                                <span className="text-subtle"> · </span>
                              </>
                            )}
                            {block.kindLabel}
                            <span className="text-subtle"> · </span>
                            {hoursStr}
                            <span className="text-subtle"> · </span>
                            {timeRange}
                          </p>
                        )}
                        {!compact && block.heightPx > 48 && block.description?.trim() && (
                          <p className="text-xs leading-snug text-tertiary/90 line-clamp-2">{block.description}</p>
                        )}
                      </div>

                      <BlockBreakOverlay startTime={block.start_time} endTime={block.end_time} />

                      {/* 下边界拖拽手柄 */}
                      <div
                        className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize z-10 group/bottom"
                        onMouseDown={(e) => { e.stopPropagation(); startDrag(e, block, "resize-bottom", key); }}
                      >
                        <div className="mx-auto mb-0.5 h-0.5 w-6 rounded-full bg-tertiary/0 transition-colors group-hover/bottom:bg-tertiary/40" />
                      </div>
                    </div>
                  );
                })}

                {/* 拖拽预览 ghost block */}
                {dragPreview && dragPreview.date === key && (() => {
                  const gb = dragPreview.block;
                  const ghCompact = dragPreview.heightPx < 36;
                  const ghHoursStr = formatHours(parseFloat(gb.hours));
                  const ghTimeRange = `${dragPreview.startTime}–${dragPreview.endTime}`;
                  const ghShowProject = gb.blockType !== "project" && gb.projectName;
                  return (
                    <div
                      className={cn(
                        "absolute left-1 right-1 rounded-md overflow-hidden pointer-events-none z-20",
                        "border border-subtle/90 shadow-lg",
                        "border-l-[3px] ring-2 ring-accent-primary/30",
                        getBlockStyleClasses(gb),
                      )}
                      style={{ top: CONTENT_PADDING_TOP + dragPreview.topPx, height: dragPreview.heightPx }}
                    >
                      <div className={cn("flex h-full min-h-0 justify-start overflow-hidden px-2 py-1", ghCompact ? "flex-col gap-0" : "flex-col gap-0.5")}>
                        <div className="flex items-center gap-1 min-w-0">
                          {renderBlockIcon(gb, getProjectById, 3)}
                          <p className="text-xs font-medium leading-snug text-primary truncate min-w-0">{gb.label}</p>
                        </div>
                        {!ghCompact && (
                          <p className="text-xs leading-snug text-tertiary tabular-nums truncate">
                            {ghShowProject && (
                              <>
                                <span className="text-secondary font-medium">{gb.projectName}</span>
                                <span className="text-subtle"> · </span>
                              </>
                            )}
                            {gb.kindLabel}
                            <span className="text-subtle"> · </span>
                            {ghHoursStr}
                            <span className="text-subtle"> · </span>
                            {ghTimeRange}
                          </p>
                        )}
                      </div>
                      <BlockBreakOverlay startTime={dragPreview.startTime} endTime={dragPreview.endTime} />
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>
      <TimesheetRowAddModal
        open={addModalOpen}
        workspaceSlug={workspaceSlug}
        onAdd={handleAddFromTimeline}
        onClose={() => { setAddModalOpen(false); pendingCreateRef.current = null; }}
      />
    </div>
  );
});
