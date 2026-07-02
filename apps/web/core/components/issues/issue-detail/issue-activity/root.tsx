/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
// plane package imports
import { E_SORT_ORDER, EActivityTab, EUserPermissions } from "@plane/constants";
import { useLocalStorage } from "@plane/hooks";
//types
import type { TFileSignedURLResponse, TIssueComment } from "@plane/types";
// components
import { CommentCreate } from "@/components/comments/comment-create";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useUser, useUserPermissions } from "@/hooks/store/user";
// plane web components
import { IssueActivityWorklogCreateButton } from "@/plane-web/components/issues/worklog/activity/worklog-create-button";
import { ActivityOperatorFilterRoot } from "./operator-filter-root";
import { IssueActivityCommentRoot } from "./activity-comment-root";
import { ActivityTabs } from "./activity-tabs";
import { useWorkItemCommentOperations } from "./helper";
import { ActivitySortRoot } from "./sort-root";
import { IssueActivityTimesheetList } from "./timesheet-list";

type TIssueActivity = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  isIntakeIssue?: boolean;
};

export type TActivityOperations = {
  createComment: (data: Partial<TIssueComment>) => Promise<TIssueComment>;
  updateComment: (commentId: string, data: Partial<TIssueComment>) => Promise<void>;
  removeComment: (commentId: string) => Promise<void>;
  uploadCommentAsset: (blockId: string, file: File, commentId?: string) => Promise<TFileSignedURLResponse>;
};

export const IssueActivity = observer(function IssueActivity(props: TIssueActivity) {
  const { workspaceSlug, projectId, issueId, disabled = false, isIntakeIssue = false } = props;
  // hooks
  const { setValue: setActiveTab, storedValue: storedActiveTab } = useLocalStorage<EActivityTab>(
    "issue_activity_tab",
    EActivityTab.ALL
  );
  const { setValue: setSortOrder, storedValue: sortOrder } = useLocalStorage("activity_sort_order", E_SORT_ORDER.ASC);
  // store hooks
  const {
    activity: { getActivityAndCommentsByIssueId, getActivityById },
    comment: { getCommentById },
    issue: { getIssueById },
  } = useIssueDetail();
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);
  const [timesheetOperatorIds, setTimesheetOperatorIds] = useState<string[]>([]);

  const { getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();
  const { getProjectById } = useProject();
  const { data: currentUser } = useUser();
  // derived values
  const activeTab = storedActiveTab ?? EActivityTab.ALL;
  const resolvedSortOrder = sortOrder || E_SORT_ORDER.ASC;
  const issue = issueId ? getIssueById(issueId) : undefined;
  const activityAndComments = getActivityAndCommentsByIssueId(issueId, resolvedSortOrder);
  const currentUserProjectRole = getProjectRoleByWorkspaceSlugAndProjectId(workspaceSlug, projectId);
  const isAdmin = currentUserProjectRole === EUserPermissions.ADMIN;
  const isGuest = currentUserProjectRole === EUserPermissions.GUEST;
  const isAssigned = issue?.assignee_ids && currentUser?.id ? issue?.assignee_ids.includes(currentUser?.id) : false;
  const isWorklogButtonEnabled = !isIntakeIssue && !isGuest && (isAdmin || isAssigned);
  const showCommentComposer = activeTab === EActivityTab.ALL || activeTab === EActivityTab.COMMENT;
  const operatorFilterOptionIdSet = new Set<string>([...selectedOperatorIds, ...timesheetOperatorIds]);
  activityAndComments?.forEach((activityComment) => {
    if (activityComment.activity_type === "COMMENT") {
      const comment = getCommentById(activityComment.id);
      [comment?.actor, comment?.actor_detail?.id, comment?.created_by, comment?.updated_by].forEach((userId) => {
        if (userId) operatorFilterOptionIdSet.add(userId);
      });
      return;
    }

    const activity = getActivityById(activityComment.id);
    [activity?.actor, activity?.actor_detail?.id, activity?.created_by, activity?.updated_by].forEach((userId) => {
      if (userId) operatorFilterOptionIdSet.add(userId);
    });
  });
  const operatorFilterOptionIds = Array.from(operatorFilterOptionIdSet);

  useEffect(() => {
    setSelectedOperatorIds([]);
    setTimesheetOperatorIds([]);
  }, [issueId]);

  const toggleSortOrder = () => {
    setSortOrder(sortOrder === E_SORT_ORDER.ASC ? E_SORT_ORDER.DESC : E_SORT_ORDER.ASC);
  };

  // helper hooks
  const activityOperations = useWorkItemCommentOperations(workspaceSlug, projectId, issueId);

  const project = getProjectById(projectId);
  const renderCommentCreationBox = useMemo(
    () => (
      <CommentCreate
        workspaceSlug={workspaceSlug}
        entityId={issueId}
        activityOperations={activityOperations}
        showToolbarInitially
        projectId={projectId}
      />
    ),
    [workspaceSlug, issueId, activityOperations, projectId]
  );
  if (!project) return <></>;

  return (
    <div className="pb-4">
      {/* header：底边横线铺满整行，与右侧排序等按钮右缘对齐 */}
      <div className="border-b border-subtle">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <ActivityTabs activeTab={activeTab} onChange={setActiveTab} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isWorklogButtonEnabled && (
              <IssueActivityWorklogCreateButton
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                disabled={disabled}
              />
            )}
            <ActivityOperatorFilterRoot
              operatorIds={operatorFilterOptionIds}
              selectedOperatorIds={selectedOperatorIds}
              onChange={setSelectedOperatorIds}
            />
            <ActivitySortRoot sortOrder={resolvedSortOrder} toggleSort={toggleSortOrder} />
          </div>
        </div>
      </div>

      {/* rendering activity */}
      <div className="pt-2">
        <div className="min-h-[200px]">
          <div className="space-y-4">
            {!disabled && showCommentComposer && resolvedSortOrder === E_SORT_ORDER.DESC && renderCommentCreationBox}
            {activeTab === EActivityTab.TIMESHEET ? (
              <IssueActivityTimesheetList
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueId={issueId}
                sortOrder={resolvedSortOrder}
                operatorFilterIds={selectedOperatorIds}
                onOperatorIdsChange={setTimesheetOperatorIds}
              />
            ) : (
              <IssueActivityCommentRoot
                projectId={projectId}
                workspaceSlug={workspaceSlug}
                isIntakeIssue={isIntakeIssue}
                issueId={issueId}
                activeTab={activeTab}
                activityOperations={activityOperations}
                showAccessSpecifier={!!project.anchor}
                disabled={disabled}
                sortOrder={resolvedSortOrder}
                operatorFilterIds={selectedOperatorIds}
              />
            )}
            {!disabled && showCommentComposer && resolvedSortOrder === E_SORT_ORDER.ASC && renderCommentCreationBox}
          </div>
        </div>
      </div>
    </div>
  );
});
