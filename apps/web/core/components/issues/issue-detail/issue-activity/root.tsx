/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
// plane package imports
import { E_SORT_ORDER, EActivityTab, EUserPermissions } from "@plane/constants";
import { useLocalStorage } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
//types
import type { TFileSignedURLResponse, TIssueComment } from "@plane/types";
import { Avatar } from "@plane/ui";
import { getFileURL } from "@plane/utils";
// components
import { CommentCreate } from "@/components/comments/comment-create";
// hooks
import { useIssueActivityTimeline } from "@/hooks/store/use-issue-activity-timeline";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProject } from "@/hooks/store/use-project";
import { useUser, useUserPermissions } from "@/hooks/store/user";
// plane web components
import { IssueActivityWorklogCreateButton } from "@/plane-web/components/issues/worklog/activity/worklog-create-button";
import { ActivityTabs, TAB_I18N_KEY } from "./activity-tabs";
import { useWorkItemCommentOperations } from "./helper";
import { IssueActivityLoader } from "./loader";
import { ActivityOperatorFilterRoot } from "./operator-filter-root";
import { ActivitySortRoot } from "./sort-root";
import { IssueActivityTimesheetList } from "./timesheet-list";
import { IssueActivityTimelineList } from "./timeline/timeline-list";

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

const TAB_VALUES = Object.values(EActivityTab) as string[];

/**
 * 工作项详情的「活动」区：流转 / 评论 / 修改三类记录按时间排成一条线，按天分组。
 * 顶部页签带计数，右侧按操作人筛选 + 排序；评论框跟着排序走 —— 从旧到新时在底部，从新到旧时在顶部，
 * 只看流转或修改时不出评论框。
 */
export const IssueActivity = observer(function IssueActivity(props: TIssueActivity) {
  const { workspaceSlug, projectId, issueId, disabled = false, isIntakeIssue = false } = props;
  const { t } = useTranslation();
  // 页签记在本机；旧版本存过已经不存在的页签值，回落到「全部」
  const { setValue: setActiveTab, storedValue: storedActiveTab } = useLocalStorage<EActivityTab>(
    "issue_activity_tab",
    EActivityTab.ALL
  );
  const { setValue: setSortOrder, storedValue: sortOrder } = useLocalStorage("activity_sort_order", E_SORT_ORDER.ASC);
  // store hooks
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);
  const [timesheetOperatorIds, setTimesheetOperatorIds] = useState<string[]>([]);

  const { getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();
  const { getProjectById } = useProject();
  const { data: currentUser } = useUser();
  // derived values
  const activeTab =
    storedActiveTab && TAB_VALUES.includes(storedActiveTab) ? (storedActiveTab as EActivityTab) : EActivityTab.ALL;
  const resolvedSortOrder = sortOrder === E_SORT_ORDER.DESC ? E_SORT_ORDER.DESC : E_SORT_ORDER.ASC;
  const issue = issueId ? getIssueById(issueId) : undefined;
  const currentUserProjectRole = getProjectRoleByWorkspaceSlugAndProjectId(workspaceSlug, projectId);
  const isAdmin = currentUserProjectRole === EUserPermissions.ADMIN;
  const isGuest = currentUserProjectRole === EUserPermissions.GUEST;
  const isAssigned = issue?.assignee_ids && currentUser?.id ? issue?.assignee_ids.includes(currentUser?.id) : false;
  const isWorklogButtonEnabled = !isIntakeIssue && !isGuest && (isAdmin || isAssigned);
  const showCommentComposer = !disabled && (activeTab === EActivityTab.ALL || activeTab === EActivityTab.COMMENT);
  const isTimesheetTab = activeTab === EActivityTab.TIMESHEET;

  const { days, counts, operatorIds, isLoading } = useIssueActivityTimeline({
    issueId,
    activeTab,
    sortOrder: resolvedSortOrder,
    operatorFilterIds: selectedOperatorIds,
  });
  const operatorFilterOptionIds = Array.from(new Set([...operatorIds, ...timesheetOperatorIds]));

  useEffect(() => {
    setSelectedOperatorIds([]);
    setTimesheetOperatorIds([]);
  }, [issueId]);

  const toggleSortOrder = () => {
    setSortOrder(resolvedSortOrder === E_SORT_ORDER.ASC ? E_SORT_ORDER.DESC : E_SORT_ORDER.ASC);
  };

  // helper hooks
  const activityOperations = useWorkItemCommentOperations(workspaceSlug, projectId, issueId);

  const project = getProjectById(projectId);
  if (!project) return <></>;

  // 评论框：头像 + 收成一行的输入框，聚焦才展开工具栏
  const composer = showCommentComposer ? (
    <div className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-x-2.5">
      <span className="grid size-7 place-items-center pt-1">
        <Avatar
          size={20}
          name={currentUser?.display_name ?? ""}
          src={getFileURL(currentUser?.avatar_url ?? "")}
          showTooltip={false}
        />
      </span>
      <CommentCreate
        workspaceSlug={workspaceSlug}
        entityId={issueId}
        activityOperations={activityOperations}
        showToolbarInitially={false}
        projectId={projectId}
      />
    </div>
  ) : null;

  let content: ReactNode;
  if (isTimesheetTab) {
    content = (
      <IssueActivityTimesheetList
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
        sortOrder={resolvedSortOrder}
        operatorFilterIds={selectedOperatorIds}
        onOperatorIdsChange={setTimesheetOperatorIds}
      />
    );
  } else if (isLoading) {
    content = <IssueActivityLoader />;
  } else if (days.length === 0) {
    content = (
      <div className="py-6 text-center text-13 text-placeholder">
        {selectedOperatorIds.length > 0
          ? t("issue_activity.empty.operator")
          : t(`issue_activity.empty.${TAB_I18N_KEY[activeTab]}`)}
      </div>
    );
  } else {
    content = (
      <IssueActivityTimelineList
        days={days}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        activityOperations={activityOperations}
        showAccessSpecifier={!!project.anchor}
        showCopyLinkOption={!isIntakeIssue}
        disabled={disabled}
      />
    );
  }

  return (
    <div className="pb-4">
      <div className="flex items-center justify-between gap-2 border-b border-subtle pb-2">
        <ActivityTabs activeTab={activeTab} counts={counts} onChange={setActiveTab} />
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
          <ActivitySortRoot sortOrder={resolvedSortOrder} toggleSort={toggleSortOrder} variant="label" />
        </div>
      </div>

      <div className="min-h-[160px] pt-2">
        {composer && resolvedSortOrder === E_SORT_ORDER.DESC && (
          <div className="mb-1 border-b border-subtle pb-4 pt-1">{composer}</div>
        )}
        {content}
        {composer && resolvedSortOrder === E_SORT_ORDER.ASC && (
          <div className="mt-3 border-t border-subtle pt-4">{composer}</div>
        )}
      </div>
    </div>
  );
});
