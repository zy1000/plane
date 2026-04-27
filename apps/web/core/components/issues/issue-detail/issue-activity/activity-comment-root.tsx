/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import type { E_SORT_ORDER, EActivityFilterType } from "@plane/constants";
import { BASE_ACTIVITY_FILTER_TYPES, EActivityTab, filterActivityByTab } from "@plane/constants";
import type { TCommentsOperations, TIssueActivityComment } from "@plane/types";
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
import { ActivityFeedCollapsible } from "./activity-feed-collapsible";
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
  operatorFilterIds?: string[];
};

const EMPTY_TAB_LABELS: Record<EActivityTab, string> = {
  [EActivityTab.ALL]: "暂无记录",
  [EActivityTab.ACTIVITY]: "暂无活动",
  [EActivityTab.COMMENT]: "暂无评论",
  [EActivityTab.TIMESHEET]: "暂无工时记录",
  [EActivityTab.TRANSITION]: "暂无状态转换",
  [EActivityTab.HISTORY]: "暂无历史记录",
};

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
    operatorFilterIds = [],
  } = props;
  // store hooks
  const {
    activity: { getActivityAndCommentsByIssueId, getActivityById },
    comment: { getCommentById },
  } = useIssueDetail();
  // derived values
  const activityAndComments = getActivityAndCommentsByIssueId(issueId, sortOrder);

  if (!activityAndComments) return <IssueActivityLoader />;

  const tabFilteredActivityAndComments = filterActivityByTab(activityAndComments, activeTab, getActivityById);
  const selectedOperatorSet = new Set(operatorFilterIds);
  const matchesOperatorFilter = (activityComment: TIssueActivityComment) => {
    if (selectedOperatorSet.size === 0) return true;

    if (activityComment.activity_type === "COMMENT") {
      const comment = getCommentById(activityComment.id);
      return [comment?.actor, comment?.actor_detail?.id, comment?.created_by, comment?.updated_by].some(
        (userId) => !!userId && selectedOperatorSet.has(userId)
      );
    }

    const activity = getActivityById(activityComment.id);
    const activityUserIds = [activity?.actor, activity?.actor_detail?.id, activity?.created_by, activity?.updated_by];

    return activityUserIds.some((userId) => !!userId && selectedOperatorSet.has(userId));
  };
  const filteredActivityAndComments = tabFilteredActivityAndComments.filter(matchesOperatorFilter);

  if (filteredActivityAndComments.length <= 0)
    return (
      <div className="py-6 text-center text-body-sm-regular text-placeholder">
        {operatorFilterIds.length > 0 ? "暂无匹配操作人员的记录" : EMPTY_TAB_LABELS[activeTab]}
      </div>
    );

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

  return (
    <ActivityTabProvider value={activeTab}>
      <ActivityFeedCollapsible
        resetKey={`${issueId}:${activeTab}:${sortOrder}`}
        listLength={filteredActivityAndComments.length}
      >
        {list}
      </ActivityFeedCollapsible>
    </ActivityTabProvider>
  );
});
