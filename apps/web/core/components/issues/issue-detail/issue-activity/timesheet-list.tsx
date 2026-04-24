/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo } from "react";
import { observer } from "mobx-react";
import { Clock } from "lucide-react";
import { E_SORT_ORDER } from "@plane/constants";
import { Tooltip } from "@plane/propel/tooltip";
import { Avatar } from "@plane/ui";
import { calculateTimeAgo, cn, getFileURL, renderFormattedDate, renderFormattedTime } from "@plane/utils";
import { useTimesheet } from "@/hooks/store/use-timesheet";
import { usePlatformOS } from "@/hooks/use-platform-os";
import type { TTimeSheet } from "@/services/issue/timesheet.service";

type TIssueActivityTimesheetListProps = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  sortOrder: E_SORT_ORDER;
};

function formatHours(hoursStr: string): string {
  const n = parseFloat(hoursStr || "0");
  if (!isFinite(n) || n === 0) return "0h";
  // 保留最多 2 位小数、去掉末尾 0（如 1、1.5）
  const display = Number.isInteger(n) ? `${n}` : `${Math.round(n * 100) / 100}`;
  return `${display}h`;
}

/** 登记日期，YYYY/MM/DD */
function formatTimesheetWorkDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T00:00:00");
    if (!isFinite(d.getTime())) return dateStr;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}/${month}/${day}`;
  } catch {
    return dateStr;
  }
}

/** 起止时间，HH:mm（兼容 "08:30:00" / "08:30"） */
function formatTimesheetClock(timeStr: string): string {
  if (!timeStr) return "";
  try {
    const [h, m] = timeStr.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return timeStr;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  } catch {
    return timeStr;
  }
}

/** 在相对时间前加 "about "；date-fns 已带 about 时不再重复。 */
function withAboutPrefix(ago: string): string {
  const t = ago.trim();
  if (!t) return "";
  if (/^about\s/i.test(t)) return t;
  return `about ${t}`;
}

type TTimesheetActivityItemProps = {
  timesheet: TTimeSheet;
  ends?: "top" | "bottom";
};

function TimesheetActivityItem(props: TTimesheetActivityItemProps) {
  const { timesheet, ends } = props;
  const { isMobile } = usePlatformOS();

  const userName = timesheet.member_detail?.display_name || "Unknown";
  const avatarUrl = timesheet.member_detail?.avatar_url;
  const hoursLabel = formatHours(timesheet.hours);
  const workDate = formatTimesheetWorkDate(timesheet.date);
  const workRange = `${formatTimesheetClock(timesheet.start_time)} — ${formatTimesheetClock(timesheet.end_time)}`;
  const workPeriodLabel = `${workDate} ${workRange}`;

  return (
    <div
      className={cn(
        "relative flex items-center gap-4 text-body-sm-regular",
        ends === "top" ? "pb-3.5" : ends === "bottom" ? "pt-3.5" : "py-3.5"
      )}
    >
      <div className="absolute top-0 bottom-0 left-[13px] w-px bg-layer-3" aria-hidden />
      <div className="z-[4] flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-subtle bg-layer-2 text-secondary shadow-raised-100">
        <Avatar src={getFileURL(avatarUrl ?? "")} name={userName} size="sm" showTooltip={false} />
      </div>
      <div className="min-w-0 flex-1 text-secondary">
        <span className="text-primary font-medium">{userName}</span>
        <span> logged </span>
        <span className="tabular-nums text-primary font-medium">{hoursLabel}</span>
        <span className="ml-2 inline-block tabular-nums text-tertiary" title={workPeriodLabel}>
          {workPeriodLabel}
        </span>
        <span>
          <Tooltip
            isMobile={isMobile}
            tooltipContent={`登记时段：${workPeriodLabel}；提交于 ${renderFormattedDate(timesheet.created_at) ?? ""} ${renderFormattedTime(timesheet.created_at)}`.trim()}
          >
            <span className="ml-3 inline-block whitespace-nowrap text-tertiary">
              {withAboutPrefix(calculateTimeAgo(timesheet.created_at))}
            </span>
          </Tooltip>
        </span>
      </div>
    </div>
  );
}

export const IssueActivityTimesheetList = observer(function IssueActivityTimesheetList(
  props: TIssueActivityTimesheetListProps
) {
  const { workspaceSlug, projectId, issueId, sortOrder } = props;

  const { timesheets, isLoading, fetchTimesheets } = useTimesheet(workspaceSlug, projectId, issueId);

  useEffect(() => {
    fetchTimesheets();
  }, [fetchTimesheets]);

  // 按 created_at 排序，尊重 activity 模块的 sortOrder（升序=最旧在前）
  const ordered = useMemo(() => {
    const copy = [...timesheets];
    copy.sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sortOrder === E_SORT_ORDER.ASC ? ta - tb : tb - ta;
    });
    return copy;
  }, [timesheets, sortOrder]);

  if (isLoading && ordered.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-body-sm-regular text-placeholder">
        <Clock className="h-4 w-4" />
        加载中…
      </div>
    );
  }

  if (ordered.length === 0) {
    return <div className="py-6 text-center text-body-sm-regular text-placeholder">暂无工时记录</div>;
  }

  return (
    <div>
      {ordered.map((t, index) => (
        <TimesheetActivityItem
          key={t.id}
          timesheet={t}
          ends={index === 0 ? "top" : index === ordered.length - 1 ? "bottom" : undefined}
        />
      ))}
    </div>
  );
});
