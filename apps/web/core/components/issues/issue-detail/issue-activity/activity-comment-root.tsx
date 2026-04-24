/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { observer } from "mobx-react";
// plane imports
import type { E_SORT_ORDER, EActivityFilterType } from "@plane/constants";
import { BASE_ACTIVITY_FILTER_TYPES, EActivityTab, filterActivityByTab } from "@plane/constants";
import type { TCommentsOperations } from "@plane/types";
// components
import { CommentCard } from "@/components/comments/card/root";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// plane web components
import { IssueAdditionalPropertiesActivity } from "@/plane-web/components/issues/issue-details/issue-properties-activity";
import { IssueActivityWorklog } from "@/plane-web/components/issues/worklog/activity/root";
// local imports
import { IssueActivityItem } from "./activity/activity-list";
import { ActivityTabProvider } from "./activity/actions/helpers/activity-tab-context";
import { IssueActivityLoader } from "./loader";

type TIssueActivityCommentRoot = {
  workspaceSlug: string;
  projectId: string;
  isIntakeIssue: boolean;
  issueId: string;
  activeTab: EActivityTab;
  activityOperations: TCommentsOperations;
  showAccessSpecifier?: boolean;
  disabled?: boolean;
  sortOrder: E_SORT_ORDER;
};

const EMPTY_TAB_LABELS: Record<EActivityTab, string> = {
  [EActivityTab.ALL]: "暂无记录",
  [EActivityTab.ACTIVITY]: "暂无活动",
  [EActivityTab.COMMENT]: "暂无评论",
  [EActivityTab.TIMESHEET]: "暂无工时记录",
  [EActivityTab.TRANSITION]: "暂无状态转换",
  [EActivityTab.HISTORY]: "暂无历史记录",
};

/** 「全部」Tab 下活动列表：限制最大高度，溢出时与 IssuePeek 描述区一致的「显示全部 / 显示更少」 */
const ACTIVITY_ALL_COLLAPSED_MAX_HEIGHT_PX = 320;

function ActivityAllFeedCollapsible(props: {
  issueId: string;
  listLength: number;
  sortOrder: E_SORT_ORDER;
  children: ReactNode;
}) {
  const { issueId, listLength, sortOrder, children } = props;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsExpanded(false);
  }, [issueId]);

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const measure = () => {
      const overflow = el.scrollHeight - ACTIVITY_ALL_COLLAPSED_MAX_HEIGHT_PX > 1;
      setIsOverflowing(overflow);
    };

    measure();

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(measure);
      const target = el.firstElementChild ?? el;
      observer.observe(target);
    }

    return () => {
      observer?.disconnect();
    };
  }, [issueId, listLength, sortOrder, isExpanded]);

  const showCollapsedFade = !isExpanded && isOverflowing;
  /** 底部内容渐隐，接近「显示全部」时由实到透（用 mask 而非纯色叠层，避免与背景对不齐的硬边） */
  const collapsedBottomFadeMask =
    "linear-gradient(to bottom, #000 0%, #000 64%, rgba(0,0,0,0.5) 82%, rgba(0,0,0,0) 100%)";

  return (
    <div className="space-y-1">
      <div
        ref={wrapperRef}
        className="relative overflow-hidden transition-[max-height] duration-200 ease-in-out"
        style={{
          maxHeight:
            isExpanded || !isOverflowing ? "none" : `${ACTIVITY_ALL_COLLAPSED_MAX_HEIGHT_PX}px`,
          ...(showCollapsedFade
            ? {
                WebkitMaskImage: collapsedBottomFadeMask,
                maskImage: collapsedBottomFadeMask,
                WebkitMaskSize: "100% 100%",
                maskSize: "100% 100%",
                WebkitMaskRepeat: "no-repeat",
                maskRepeat: "no-repeat",
              }
            : {
                WebkitMaskImage: "none",
                maskImage: "none",
              }),
        }}
      >
        {children}
      </div>
      {isOverflowing && (
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="text-body-sm-medium text-accent-primary hover:underline"
        >
          {isExpanded ? "显示更少" : "显示全部"}
        </button>
      )}
    </div>
  );
}

export const IssueActivityCommentRoot = observer(function IssueActivityCommentRoot(props: TIssueActivityCommentRoot) {
  const {
    workspaceSlug,
    isIntakeIssue,
    issueId,
    activeTab,
    activityOperations,
    showAccessSpecifier,
    projectId,
    disabled,
    sortOrder,
  } = props;
  // store hooks
  const {
    activity: { getActivityAndCommentsByIssueId, getActivityById },
    comment: { getCommentById },
  } = useIssueDetail();
  // derived values
  const activityAndComments = getActivityAndCommentsByIssueId(issueId, sortOrder);

  if (!activityAndComments) return <IssueActivityLoader />;

  const filteredActivityAndComments = filterActivityByTab(activityAndComments, activeTab, getActivityById);

  if (filteredActivityAndComments.length <= 0)
    return <div className="py-6 text-center text-body-sm-regular text-placeholder">{EMPTY_TAB_LABELS[activeTab]}</div>;

  const list = (
    <div>
      {filteredActivityAndComments.map((activityComment, index) => {
        const comment = getCommentById(activityComment.id);
        return activityComment.activity_type === "COMMENT" ? (
          <CommentCard
            key={activityComment.id}
            workspaceSlug={workspaceSlug}
            entityId={issueId}
            comment={comment}
            activityOperations={activityOperations}
            ends={index === 0 ? "top" : index === filteredActivityAndComments.length - 1 ? "bottom" : undefined}
            showAccessSpecifier={!!showAccessSpecifier}
            showCopyLinkOption={!isIntakeIssue}
            disabled={disabled}
            projectId={projectId}
            enableReplies
          />
        ) : BASE_ACTIVITY_FILTER_TYPES.includes(activityComment.activity_type as EActivityFilterType) ? (
          <IssueActivityItem
            key={activityComment.id}
            activityId={activityComment.id}
            ends={index === 0 ? "top" : index === filteredActivityAndComments.length - 1 ? "bottom" : undefined}
          />
        ) : activityComment.activity_type === "ISSUE_ADDITIONAL_PROPERTIES_ACTIVITY" ? (
          <IssueAdditionalPropertiesActivity
            key={activityComment.id}
            activityId={activityComment.id}
            ends={index === 0 ? "top" : index === filteredActivityAndComments.length - 1 ? "bottom" : undefined}
          />
        ) : activityComment.activity_type === "WORKLOG" ? (
          <IssueActivityWorklog
            key={activityComment.id}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            issueId={issueId}
            activityComment={activityComment}
            ends={index === 0 ? "top" : index === filteredActivityAndComments.length - 1 ? "bottom" : undefined}
          />
        ) : (
          <></>
        );
      })}
    </div>
  );

  if (activeTab === EActivityTab.ALL) {
    return (
      <ActivityTabProvider value={activeTab}>
        <ActivityAllFeedCollapsible
          issueId={issueId}
          listLength={filteredActivityAndComments.length}
          sortOrder={sortOrder}
        >
          {list}
        </ActivityAllFeedCollapsible>
      </ActivityTabProvider>
    );
  }

  return <ActivityTabProvider value={activeTab}>{list}</ActivityTabProvider>;
});
