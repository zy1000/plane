"use client";

import { Fragment } from "react";
import { observer } from "mobx-react";
import type { TCommentsOperations } from "@plane/types";
import type { TIssueTimelineDay } from "@/hooks/store/use-issue-activity-timeline";
import { ActivityCommentRow } from "./comment-row";
import { ActivityCreatedRow } from "./created-row";
import { ActivityEditRow } from "./edit-row";
import { TimelineDaySeparator, useTimelineDayLabel } from "./timeline-primitives";
import { ActivityTransitionRow } from "./transition-row";

/**
 * 按天分组的时间线：每天先一枚日期药丸，下面是这一天的行。
 * 轨道的首尾按整条列表算：第一枚药丸以上不画，最后一行以下不画。
 */
export const IssueActivityTimelineList = observer(function IssueActivityTimelineList({
  days,
  workspaceSlug,
  projectId,
  activityOperations,
  showAccessSpecifier,
  showCopyLinkOption,
  disabled,
}: {
  days: TIssueTimelineDay[];
  workspaceSlug: string;
  projectId: string;
  activityOperations: TCommentsOperations;
  showAccessSpecifier: boolean;
  showCopyLinkOption: boolean;
  disabled: boolean;
}) {
  const dayLabel = useTimelineDayLabel();
  const total = days.reduce((count, day) => count + day.items.length, 0);
  // 轨道从第一行节点开始、到最后一行节点结束；日期行只在中间穿过
  let seen = 0;

  return (
    <ul className="flex flex-col">
      {days.map((day, dayIndex) => (
        <Fragment key={day.date}>
          <TimelineDaySeparator label={dayLabel(day.date)} isFirst={dayIndex === 0} />
          {day.items.map((item) => {
            seen += 1;
            const isFirst = seen === 1;
            const isLast = seen === total;
            if (item.kind === "created") {
              return (
                <ActivityCreatedRow
                  key={item.key}
                  activity={item.activity}
                  initial={item.initial}
                  isFirst={isFirst}
                  isLast={isLast}
                  workspaceSlug={workspaceSlug}
                />
              );
            }
            if (item.kind === "transition") {
              return (
                <ActivityTransitionRow
                  key={item.key}
                  activity={item.activity}
                  isFirst={isFirst}
                  isLast={isLast}
                  workspaceSlug={workspaceSlug}
                />
              );
            }
            if (item.kind === "edits") {
              return (
                <ActivityEditRow
                  key={item.key}
                  activities={item.activities}
                  isFirst={isFirst}
                  isLast={isLast}
                  workspaceSlug={workspaceSlug}
                />
              );
            }
            return (
              <ActivityCommentRow
                key={item.key}
                comment={item.comment}
                isFirst={isFirst}
                isLast={isLast}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                activityOperations={activityOperations}
                showAccessSpecifier={showAccessSpecifier}
                showCopyLinkOption={showCopyLinkOption}
                disabled={disabled}
              />
            );
          })}
        </Fragment>
      ))}
    </ul>
  );
});
