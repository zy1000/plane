/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { observer } from "mobx-react";
import * as LucideIcons from "lucide-react";
import { ClipboardCheck, FolderOpen, Layers } from "lucide-react";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { cn } from "@plane/utils";
import { useProject } from "@/hooks/store/use-project";
import { ProjectIssueTypeService, type TIssueType } from "@/services/project";
import type { TTimeSheet } from "@/services/issue/timesheet.service";
import { formatDateKey } from "@/hooks/store/use-timesheet-page";
import type { useTimesheetPage } from "@/hooks/store/use-timesheet-page";

const projectIssueTypeService = new ProjectIssueTypeService();

const WEEK_DAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

const HOUR_HEIGHT = 60; // px per hour
const TOTAL_HEIGHT = 24 * HOUR_HEIGHT;
const HOURS = Array.from({ length: 25 }, (_, i) => i); // 0..24
const TIME_AXIS_WIDTH = 56; // px

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

type TTimesheetBlock = TTimeSheet & {
  topPx: number;
  heightPx: number;
  kindLabel: string;
  label: string;
  projectName: string;
  blockType: TTimesheetBlockType;
};

type TTimesheetBlockType = "project" | "issue" | "test_case";

function getBlockType(timesheet: TTimeSheet): TTimesheetBlockType {
  if (timesheet.issue_detail) return "issue";
  if (timesheet.test_case_detail) return "test_case";
  return "project";
}

function getBlockStyleClasses(type: TTimesheetBlockType): string {
  if (type === "issue") return "border-l-accent-primary bg-accent-primary/[0.04]";
  if (type === "test_case") return "border-l-warning-primary bg-warning-primary/[0.04]";
  return "border-l-success-primary bg-success-primary/[0.04]";
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

    let kindLabel = "项目";
    let label = projectName?.trim() ? projectName : "项目工时";

    if (t.issue_detail) {
      kindLabel = "工作项";
      label = t.issue_detail.name;
    } else if (t.test_case_detail) {
      kindLabel = "测试用例";
      label = t.test_case_detail.name;
    }

    return { ...t, topPx, heightPx, kindLabel, label, projectName, blockType };
  });
}

function renderIssueTypeIcon(issueTypeId: string | null | undefined, issueTypesMap: Record<string, TIssueType>, size = 3) {
  const issueType = issueTypeId ? issueTypesMap[issueTypeId] : undefined;
  const logoIcon = issueType?.logo_props?.icon;

  const sizeClass = size === 3 ? "h-3 w-3" : "h-3.5 w-3.5";
  const wrapClass = size === 3 ? "h-4 w-4" : "h-5 w-5";

  if (!logoIcon) {
    return (
      <span className={`inline-flex ${wrapClass} shrink-0 items-center justify-center rounded bg-layer-1 text-tertiary`}>
        <Layers className={sizeClass} />
      </span>
    );
  }

  const { name, color, background_color } = logoIcon;
  const IconComp = (LucideIcons as any)[name] as ComponentType<{ className?: string; strokeWidth?: number }> | undefined;

  return (
    <span
      className={`inline-flex ${wrapClass} shrink-0 items-center justify-center rounded`}
      style={{ backgroundColor: background_color || "transparent", color: color || "currentColor" }}
    >
      {IconComp ? <IconComp className={sizeClass} strokeWidth={2} /> : <Layers className={sizeClass} />}
    </span>
  );
}

function renderBlockIcon(
  block: TTimesheetBlock,
  getProjectById: (id: string) => any,
  issueTypesMap: Record<string, TIssueType>,
  size = 3
) {
  const sizeClass = size === 3 ? "h-3 w-3" : "h-3.5 w-3.5";
  const wrapClass = size === 3 ? "h-4 w-4" : "h-5 w-5";

  if (block.blockType === "issue") {
    return renderIssueTypeIcon(block.issue_detail?.type_id, issueTypesMap, size);
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

type TTimesheetTimelineViewProps = {
  timesheetPage: ReturnType<typeof useTimesheetPage>;
  workspaceSlug: string;
};

export const TimesheetTimelineView = observer(function TimesheetTimelineView({
  timesheetPage,
  workspaceSlug,
}: TTimesheetTimelineViewProps) {
  const { getProjectById } = useProject();
  const { timesheets, weekDays, getDayTotalHours, isLoading } = timesheetPage;

  const today = formatDateKey(new Date());

  const [projectIssueTypeMaps, setProjectIssueTypeMaps] = useState<Record<string, Record<string, TIssueType>>>({});
  const loadedProjectIds = useRef(new Set<string>());

  useEffect(() => {
    if (!workspaceSlug) return;
    const projectIds = new Set(timesheets.map((t) => String(t.project)).filter(Boolean));
    for (const pid of projectIds) {
      if (loadedProjectIds.current.has(pid)) continue;
      loadedProjectIds.current.add(pid);
      projectIssueTypeService
        .fetchProjectIssueTypes(workspaceSlug, pid)
        .then((types) => {
          const map: Record<string, TIssueType> = {};
          for (const type of types) {
            if (type?.id) map[type.id] = type;
          }
          setProjectIssueTypeMaps((prev) => ({ ...prev, [pid]: map }));
        })
        .catch(() => {});
    }
  }, [workspaceSlug, timesheets]);

  const blocksByDay = useMemo(() => {
    const map = new Map<string, TTimesheetBlock[]>();
    for (const day of weekDays) {
      const key = formatDateKey(day);
      const dayTimesheets = timesheets.filter((t) => t.date === key);
      map.set(key, buildBlocks(dayTimesheets, getProjectById));
    }
    return map;
  }, [timesheets, weekDays, getProjectById]);

  const scrollToCurrentHour = (el: HTMLDivElement | null) => {
    if (!el) return;
    const currentHour = new Date().getHours();
    const targetScrollTop = Math.max(0, (currentHour - 1) * HOUR_HEIGHT);
    el.scrollTop = targetScrollTop;
  };

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
                "flex-1 border-r border-subtle px-2 py-2 text-center text-xs",
                isToday ? "bg-accent-primary/5" : isWeekend ? "bg-layer-1" : ""
              )}
            >
              <div className={cn("font-semibold text-sm", isToday ? "text-accent-primary" : "text-secondary")}>{dayLabel}</div>
              <div className={cn("text-xs mt-0.5", isToday ? "text-accent-primary" : "text-tertiary")}>{dateLabel}</div>
              {dayHours > 0 && (
                <div className={cn("text-xs font-medium mt-0.5", isToday ? "text-accent-primary" : "text-secondary")}>
                  {formatHours(dayHours)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 可滚动时间轴区域 */}
      <div
        ref={scrollToCurrentHour}
        className="flex-1 overflow-y-auto overflow-x-hidden"
      >
        <div className="flex" style={{ height: TOTAL_HEIGHT }}>
          {/* 左侧时间刻度 */}
          <div className="shrink-0 relative border-r border-subtle bg-layer-2" style={{ width: TIME_AXIS_WIDTH, height: TOTAL_HEIGHT }}>
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute left-0 right-0 flex items-start"
                style={{ top: h * HOUR_HEIGHT - 8 }}
              >
                <span className="pl-2 text-[10px] text-tertiary tabular-nums w-full">
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
                className={cn(
                  "flex-1 relative border-r border-subtle",
                  isToday ? "bg-accent-primary/[0.02]" : isWeekend ? "bg-layer-1/30" : "bg-transparent"
                )}
                style={{ height: TOTAL_HEIGHT }}
              >
                {/* 小时网格线 */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0 border-t border-subtle/50"
                    style={{ top: h * HOUR_HEIGHT }}
                  />
                ))}

                {/* 当前时间线 */}
                {nowMinutes !== null && (
                  <div
                    className="absolute left-0 right-0 z-10 pointer-events-none"
                    style={{ top: (nowMinutes / 60) * HOUR_HEIGHT }}
                  >
                    <div className="relative h-0">
                      <div className="absolute left-0 right-0 h-0.5 bg-red-400" />
                      <div className="absolute -left-1 -top-1 h-2 w-2 rounded-full bg-red-400" />
                    </div>
                  </div>
                )}

                {/* 工时块 */}
                {blocks.map((block) => {
                  const hoursStr = formatHours(parseFloat(block.hours));
                  const compact = block.heightPx < 36;
                  const timeRange = `${block.start_time.slice(0, 5)}–${block.end_time.slice(0, 5)}`;
                  const issueTypesMap = projectIssueTypeMaps[String(block.project)] ?? {};
                  const showProjectName = block.blockType !== "project" && block.projectName;
                  return (
                    <div
                      key={block.id}
                      className={cn(
                        "absolute left-1 right-1 rounded-md overflow-hidden px-2 py-1 cursor-default",
                        "border border-subtle/90 shadow-sm",
                        "border-l-[3px] transition-colors hover:bg-layer-1",
                        getBlockStyleClasses(block.blockType)
                      )}
                      style={{ top: block.topPx, height: block.heightPx }}
                      title={`${block.kindLabel} · ${block.label}\n${timeRange}（${hoursStr}）`}
                      aria-label={`${block.kindLabel}，${block.label}，${timeRange}，${hoursStr}`}
                    >
                      <div
                        className={cn(
                          "flex h-full min-h-0 justify-start overflow-hidden",
                          compact ? "flex-col gap-0" : "flex-col gap-0.5"
                        )}
                      >
                        <div className="flex items-center gap-1 min-w-0">
                          {renderBlockIcon(block, getProjectById, issueTypesMap, compact ? 3 : 3)}
                          <p className="text-xs font-medium leading-snug text-primary truncate min-w-0">{block.label}</p>
                        </div>
                        {!compact && (
                          <p className="text-[10px] leading-snug text-tertiary tabular-nums truncate">
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
                          <p className="text-[10px] leading-snug text-tertiary/90 line-clamp-2">{block.description}</p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* 空状态提示 */}
                {blocks.length === 0 && !isLoading && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-[10px] text-subtle/30 select-none">—</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
