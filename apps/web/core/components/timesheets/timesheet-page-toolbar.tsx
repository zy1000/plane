/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { DatePicker, message } from "antd";
import dayjs from "dayjs";
import { ChevronLeft, ChevronRight, LayoutList, CalendarDays, Copy } from "lucide-react";
import { cn } from "@plane/utils";
import { formatDateKey, getWeekStart } from "@/hooks/store/use-timesheet-page";
import type { useTimesheetPage } from "@/hooks/store/use-timesheet-page";
import { TimesheetTimelineHelp } from "./timesheet-timeline-help";

const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
const TOOLBAR_BUTTON_CLASS =
  "inline-flex h-[26px] items-center justify-center rounded-md border border-subtle px-2.5 text-secondary transition-colors hover:bg-layer-1 hover:text-primary";
const TOOLBAR_SEGMENT_BUTTON_CLASS =
  "flex h-[26px] items-center gap-1.5 px-2.5 text-sm font-medium transition-colors";

function formatWeekRange(weekStart: Date, weekEnd: Date): string {
  const startMonth = MONTH_LABELS[weekStart.getMonth()];
  const endMonth = MONTH_LABELS[weekEnd.getMonth()];
  if (weekStart.getMonth() === weekEnd.getMonth()) {
    return `${weekStart.getFullYear()} ${startMonth} ${weekStart.getDate()} – ${weekEnd.getDate()}`;
  }
  return `${startMonth} ${weekStart.getDate()} – ${endMonth} ${weekEnd.getDate()}`;
}

type TTimesheetPageToolbarProps = {
  timesheetPage: ReturnType<typeof useTimesheetPage>;
};

export const TimesheetPageToolbar = observer(function TimesheetPageToolbar({
  timesheetPage,
}: TTimesheetPageToolbarProps) {
  const {
    viewType,
    setViewType,
    weekStart,
    weekEnd,
    goToPrevWeek,
    goToNextWeek,
    goToCurrentWeek,
    goToWeek,
    copyPreviousWeek,
    isCopyingPreviousWeek,
    isLoading,
    isWeekFullyReadOnly,
  } = timesheetPage;

  const [pickerOpen, setPickerOpen] = useState(false);

  const handlePrevWeek = () => {
    goToPrevWeek();
    // fetchTimesheets 会在 useEffect 里监听 weekStart 变化后触发
  };

  const handleNextWeek = () => {
    goToNextWeek();
  };

  const handleCurrentWeek = () => {
    goToCurrentWeek();
  };

  const handleCopyPreviousWeek = async () => {
    try {
      const result = await copyPreviousWeek();
      if (!result) return;

      if (result.source_count === 0) {
        message.info("上一周没有可复制的工时");
        return;
      }

      if (result.created_count > 0 && result.skipped_count > 0) {
        message.warning(`已复制 ${result.created_count} 条工时，跳过 ${result.skipped_count} 条冲突记录`);
        return;
      }

      if (result.created_count > 0) {
        message.success(`已复制 ${result.created_count} 条上一周工时`);
        return;
      }

      message.warning("当前周已存在冲突工时，未复制成功");
    } catch (error: any) {
      message.error(error?.week_start?.[0] || error?.detail || error?.error || "复制上一周工时失败");
    }
  };

  const isCurrentWeek = formatDateKey(weekStart) === formatDateKey(getWeekStart(new Date()));


  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-subtle bg-surface-1 shrink-0">
      {/* 左：周导航 */}
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-md border border-subtle overflow-hidden">
          <button
            onClick={handlePrevWeek}
            className="inline-flex h-[26px] w-[26px] items-center justify-center text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
            title="上一周"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <div
            className="relative flex h-[26px] items-center border-x border-subtle cursor-pointer hover:bg-layer-1 transition-colors"
            onClick={() => setPickerOpen(true)}
          >
            <span className="px-3 text-sm font-medium text-primary tabular-nums select-none">
              {formatWeekRange(weekStart, weekEnd)}
            </span>
            <DatePicker
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              value={dayjs(weekStart)}
              onChange={(date) => {
                if (date) goToWeek(date.toDate());
                setPickerOpen(false);
              }}
              allowClear={false}
              suffixIcon={null}
              variant="borderless"
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                opacity: 0,
                pointerEvents: "none",
              }}
            />
          </div>
          <button
            onClick={handleNextWeek}
            className="inline-flex h-[26px] w-[26px] items-center justify-center text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
            title="下一周"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {!isCurrentWeek && (
          <button
            onClick={handleCurrentWeek}
            className={TOOLBAR_BUTTON_CLASS}
          >
            本周
          </button>
        )}
        <button
          onClick={handleCopyPreviousWeek}
          disabled={isCopyingPreviousWeek || isLoading || isWeekFullyReadOnly}
          className={cn(
            `${TOOLBAR_BUTTON_CLASS} gap-1.5`,
            isCopyingPreviousWeek || isLoading || isWeekFullyReadOnly
              ? "border-subtle bg-layer-1 text-placeholder cursor-not-allowed"
              : ""
          )}
          title={isWeekFullyReadOnly ? "当前周已超出可填报范围" : "将上一周的工时复制到当前周对应日期"}
        >
          <Copy className="h-3.5 w-3.5" />
          <span>{isCopyingPreviousWeek ? "复制中…" : "复制上一周"}</span>
        </button>
      </div>

      {/* 右：操作技巧 + 视图切换 */}
      <div className="flex items-center gap-2">
        {viewType === "timeline" && <TimesheetTimelineHelp className={TOOLBAR_BUTTON_CLASS} />}
        <div className="flex items-center rounded-md border border-subtle overflow-hidden">
          <button
            onClick={() => setViewType("table")}
            title="表格视图"
            className={cn(
              TOOLBAR_SEGMENT_BUTTON_CLASS,
              viewType === "table"
                ? "bg-accent-primary/10 text-accent-primary"
                : "text-secondary hover:bg-layer-1 hover:text-primary"
            )}
          >
            <LayoutList className="h-3.5 w-3.5" />
            <span>表格</span>
          </button>
          <div className="h-[26px] w-px bg-subtle" />
          <button
            onClick={() => setViewType("timeline")}
            title="时间线视图"
            className={cn(
              TOOLBAR_SEGMENT_BUTTON_CLASS,
              viewType === "timeline"
                ? "bg-accent-primary/10 text-accent-primary"
                : "text-secondary hover:bg-layer-1 hover:text-primary"
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            <span>时间线</span>
          </button>
        </div>
      </div>
    </div>
  );
});

