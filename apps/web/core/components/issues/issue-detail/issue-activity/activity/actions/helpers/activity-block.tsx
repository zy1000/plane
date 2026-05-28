/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC, ReactNode } from "react";
import { Network } from "lucide-react";
// plane imports
import { Tooltip } from "@plane/propel/tooltip";
import { renderFormattedTime, renderFormattedDate, calculateTimeAgo } from "@plane/utils";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { usePlatformOS } from "@/hooks/use-platform-os";
// plane web imports
import { IssueCreatorDisplay } from "@/plane-web/components/issues/issue-details/issue-creator";
// local imports
import { IssueUser } from "../";
import { shouldHideActivityChangeFooter, useActivityTab } from "./activity-tab-context";

type TIssueActivityBlockComponent = {
  icon?: ReactNode;
  activityId: string;
  ends: "top" | "bottom" | undefined;
  children: ReactNode;
  customUserName?: string;
  footer?: ReactNode;
};

type TActivityInlineText = {
  children: ReactNode;
  className?: string;
};

export function ActivityInlineText(props: TActivityInlineText) {
  const { children, className = "font-medium text-primary" } = props;

  return (
    <Tooltip tooltipContent={children} position="top">
      <span className={`inline-block max-w-[min(24rem,60vw)] truncate align-bottom ${className}`}>{children}</span>
    </Tooltip>
  );
}

export function IssueActivityBlockComponent(props: TIssueActivityBlockComponent) {
  const { icon, activityId, ends, children, customUserName, footer } = props;
  // hooks
  const {
    activity: { getActivityById },
  } = useIssueDetail();
  const activeTab = useActivityTab();

  const activity = getActivityById(activityId);
  const { isMobile } = usePlatformOS();
  if (!activity) return <></>;
  // 「活动」Tab 下仅显示标题行，不渲染「旧值 → 新值」的详情 footer；
  // 「全部 / 转换 / 历史」等其它 Tab 仍保留 footer。
  const resolvedFooter = shouldHideActivityChangeFooter(activeTab) ? null : footer;
  return (
    <div
      className={`relative flex ${resolvedFooter ? "items-start" : "items-center"} gap-3 text-body-sm-regular ${
        ends === "top" ? `pb-1.5` : ends === "bottom" ? `pt-1.5` : `py-1.5`
      }`}
      style={{ fontSize: "85%" }}
    >
      <div className="absolute top-0 bottom-0 left-[12px] w-px bg-layer-3" aria-hidden />
      <div className="z-[4] flex h-6 w-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-subtle bg-layer-2 text-secondary shadow-raised-100 [&_svg]:size-3">
        {icon ? icon : <Network className="h-3 w-3" />}
      </div>
      <div className="w-full min-w-0 text-secondary">
        <div className="truncate">
          {!activity?.field && activity?.verb === "created" ? (
            <IssueCreatorDisplay activityId={activityId} customUserName={customUserName} />
          ) : (
            <IssueUser activityId={activityId} customUserName={customUserName} />
          )}
          <span> {children} </span>
          <span>
            <Tooltip
              isMobile={isMobile}
              tooltipContent={`${renderFormattedDate(activity.created_at)}, ${renderFormattedTime(activity.created_at)}`}
            >
              <span className="whitespace-nowrap text-tertiary"> {calculateTimeAgo(activity.created_at)}</span>
            </Tooltip>
          </span>
        </div>
        {resolvedFooter ? <div className="mt-4">{resolvedFooter}</div> : null}
      </div>
    </div>
  );
}
