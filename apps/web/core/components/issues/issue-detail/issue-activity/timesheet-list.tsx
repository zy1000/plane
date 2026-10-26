/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo } from "react";
import { observer } from "mobx-react";
import { Clock } from "lucide-react";
import { E_SORT_ORDER } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { useTimesheet } from "@/hooks/store/use-timesheet";
import type { TTimeSheet } from "@/services/issue/timesheet.service";
import { ActivityTime, ActorName, DotNode, TimelineRow } from "./timeline/timeline-primitives";

type TIssueActivityTimesheetListProps = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  sortOrder: E_SORT_ORDER;
  operatorFilterIds?: string[];
  onOperatorIdsChange?: (operatorIds: string[]) => void;
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

type TTimesheetActivityItemProps = {
  timesheet: TTimeSheet;
  workspaceSlug: string;
  isFirst: boolean;
  isLast: boolean;
};

/** 一条工时：灰点一行，「张三 登记了工时 2h 2026/09/05 08:30 — 10:30」 */
function TimesheetActivityItem(props: TTimesheetActivityItemProps) {
  const { timesheet, workspaceSlug, isFirst, isLast } = props;
  const { t } = useTranslation();

  const userName = timesheet.member_detail?.display_name || "—";
  const hoursLabel = formatHours(timesheet.hours);
  const workDate = formatTimesheetWorkDate(timesheet.date);
  const workRange = `${formatTimesheetClock(timesheet.start_time)} — ${formatTimesheetClock(timesheet.end_time)}`;

  return (
    <TimelineRow node={<DotNode />} isFirst={isFirst} isLast={isLast}>
      <div className="flex min-h-7 flex-wrap items-center gap-x-1.5 gap-y-1 text-13 text-tertiary">
        <ActorName name={userName} userId={timesheet.created_by ?? undefined} workspaceSlug={workspaceSlug} />
        <span>{t("issue_activity.timesheet.logged")}</span>
        <span className="font-medium text-primary tabular-nums">{hoursLabel}</span>
        <span className="tabular-nums">
          {workDate} {workRange}
        </span>
        <ActivityTime value={timesheet.created_at} />
      </div>
    </TimelineRow>
  );
}

export const IssueActivityTimesheetList = observer(function IssueActivityTimesheetList(
  props: TIssueActivityTimesheetListProps
) {
  const { workspaceSlug, projectId, issueId, sortOrder, operatorFilterIds = [], onOperatorIdsChange } = props;
  const { t } = useTranslation();

  const { timesheets, isLoading, fetchTimesheets } = useTimesheet(workspaceSlug, projectId, issueId);

  useEffect(() => {
    fetchTimesheets();
  }, [fetchTimesheets]);

  const timesheetOperatorIds = useMemo(
    () =>
      Array.from(
        new Set(
          timesheets
            .flatMap((timesheet) => [timesheet.created_by, timesheet.updated_by])
            .filter((userId): userId is string => !!userId)
        )
      ),
    [timesheets]
  );

  useEffect(() => {
    onOperatorIdsChange?.(timesheetOperatorIds);
  }, [onOperatorIdsChange, timesheetOperatorIds]);

  const filteredTimesheets = useMemo(() => {
    if (operatorFilterIds.length === 0) return timesheets;

    const selectedOperatorSet = new Set(operatorFilterIds);
    return timesheets.filter((timesheet) =>
      [timesheet.created_by, timesheet.updated_by].some((userId) => !!userId && selectedOperatorSet.has(userId))
    );
  }, [timesheets, operatorFilterIds]);

  // 按 created_at 排序，尊重 activity 模块的 sortOrder（升序=最旧在前）
  const ordered = useMemo(() => {
    const copy = [...filteredTimesheets];
    copy.sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      return sortOrder === E_SORT_ORDER.ASC ? ta - tb : tb - ta;
    });
    return copy;
  }, [filteredTimesheets, sortOrder]);

  if (isLoading && ordered.length === 0) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-13 text-placeholder">
        <Clock className="h-4 w-4" />
        {t("issue_activity.empty.loading")}
      </div>
    );
  }

  if (ordered.length === 0) {
    return (
      <div className="py-6 text-center text-13 text-placeholder">
        {operatorFilterIds.length > 0
          ? t("issue_activity.empty.operator_timesheet")
          : t("issue_activity.empty.timesheet")}
      </div>
    );
  }

  return (
    <ul className="flex flex-col pt-1">
      {ordered.map((timesheet, index) => (
        <TimesheetActivityItem
          key={timesheet.id}
          timesheet={timesheet}
          workspaceSlug={workspaceSlug}
          isFirst={index === 0}
          isLast={index === ordered.length - 1}
        />
      ))}
    </ul>
  );
});
