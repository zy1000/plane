/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane constants
import { EIssueFilterType, EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// types
import type { GroupByColumnTypes, TGroupedIssues, TIssueKanbanFilters } from "@plane/types";
import { EIssueLayoutTypes, EIssuesStoreType } from "@plane/types";
// constants
// hooks
import { useIssues } from "@/hooks/store/use-issues";
import { useUserPermissions } from "@/hooks/store/user";
// hooks
import { useGroupIssuesDragNDrop } from "@/hooks/use-group-dragndrop";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { useIssuesActions } from "@/hooks/use-issues-actions";
// components
import { IssueLayoutHOC } from "../issue-layout-HOC";
import { StateTransitionAssigneeModal } from "../../state-transition-assignee-modal";
import { List } from "./default";
// types
import type { IQuickActionProps, TRenderQuickActions } from "./list-view-types";

type ListStoreType =
  | EIssuesStoreType.PROJECT
  | EIssuesStoreType.MODULE
  | EIssuesStoreType.RELEASE
  | EIssuesStoreType.CYCLE
  | EIssuesStoreType.PROJECT_VIEW
  | EIssuesStoreType.PROFILE
  | EIssuesStoreType.ARCHIVED
  | EIssuesStoreType.WORKSPACE_DRAFT
  | EIssuesStoreType.TEAM
  | EIssuesStoreType.TEAM_VIEW
  | EIssuesStoreType.EPIC;

interface IBaseListRoot {
  QuickActions: FC<IQuickActionProps>;
  addIssuesToView?: (issueIds: string[]) => Promise<any>;
  canEditPropertiesBasedOnProject?: (projectId: string) => boolean;
  viewId?: string | undefined;
  isCompletedCycle?: boolean;
  isEpic?: boolean;
}
export const BaseListRoot = observer(function BaseListRoot(props: IBaseListRoot) {
  const {
    QuickActions,
    viewId,
    addIssuesToView,
    canEditPropertiesBasedOnProject,
    isCompletedCycle = false,
    isEpic = false,
  } = props;
  // router
  const storeType = useIssueStoreType() as ListStoreType;
  const hideColumnHeaderAddButton = storeType === EIssuesStoreType.CYCLE;
  //stores
  const { issuesFilter, issues } = useIssues(storeType);
  const {
    fetchIssues,
    fetchNextIssues,
    updateIssue,
    removeIssue,
    removeIssueFromView,
    archiveIssue,
    restoreIssue,
  } = useIssuesActions(storeType);
  // mobx store
  const { allowPermissions } = useUserPermissions();
  const { issueMap } = useIssues();

  const displayFilters = issuesFilter?.issueFilters?.displayFilters;
  const displayProperties = issuesFilter?.issueFilters?.displayProperties;
  const orderBy = displayFilters?.order_by || undefined;

  const group_by = (displayFilters?.group_by || null) as GroupByColumnTypes | null;
  const showEmptyGroup = displayFilters?.show_empty_groups ?? false;

  const { workspaceSlug, projectId } = useParams();
  const { updateFilters } = useIssuesActions(storeType);
  const collapsedGroups =
    issuesFilter?.issueFilters?.kanbanFilters || ({ group_by: [], sub_group_by: [] } as TIssueKanbanFilters);

  // 将分组侧栏选中项提升到这里持有：IssueLayoutHOC 在数据刷新（如删除工作项后
  // 触发的 fetchIssues('mutation')）期间可能暂时卸载 <List>，
  // 若 state 放在 <List> 内部就会被清空，从而回退到首个分组（如 Backlog）。
  // 放在 BaseListRoot 保证选中分组跨刷新保留。
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // groupBy 切换时清空选中，交给 <List> 的校验 effect 重新挑选首个可见分组
  useEffect(() => {
    setSelectedGroupId(null);
  }, [group_by, storeType, viewId]);

  useEffect(() => {
    fetchIssues("init-loader", { canGroup: true, perPageCount: group_by ? 50 : 100 }, viewId);
  }, [fetchIssues, storeType, group_by, viewId]);

  const groupedIssueIds = issues?.groupedIssueIds as TGroupedIssues | undefined;
  // auth
  const isEditingAllowed = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );
  const { enableInlineEditing, enableIssueCreation } = issues?.viewFlags || {};

  const canEditProperties = useCallback(
    (projectId: string | undefined) => {
      const isEditingAllowedBasedOnProject =
        canEditPropertiesBasedOnProject && projectId ? canEditPropertiesBasedOnProject(projectId) : isEditingAllowed;

      return !!enableInlineEditing && isEditingAllowedBasedOnProject;
    },
    [canEditPropertiesBasedOnProject, enableInlineEditing, isEditingAllowed]
  );

  const { handleOnDrop, assigneeModalProps } = useGroupIssuesDragNDrop(storeType, orderBy, group_by);

  const renderQuickActions: TRenderQuickActions = useCallback(
    ({ issue, parentRef }) => (
      <QuickActions
        parentRef={parentRef}
        issue={issue}
        handleDelete={async () => {
          // removeIssue 已经在 store 中乐观更新了 groupedIssueIds / groupedIssueCount，
          // MobX 会反应式地让 List 无闪动地重渲；如果这里再调用 fetchIssues('mutation', ...)
          // 会先执行 store.clear() 把 groupedIssueIds 清空，导致 IssueLayoutHOC
          // 因为 issueCount === undefined 短暂显示 <ActiveLoader />，产生明显闪动。
          await removeIssue(issue.project_id, issue.id);
        }}
        handleUpdate={async (data) => updateIssue && updateIssue(issue.project_id, issue.id, data)}
        handleRemoveFromView={async () => removeIssueFromView && removeIssueFromView(issue.project_id, issue.id)}
        handleArchive={async () => archiveIssue && archiveIssue(issue.project_id, issue.id)}
        handleRestore={async () => restoreIssue && restoreIssue(issue.project_id, issue.id)}
        readOnly={!canEditProperties(issue.project_id ?? undefined) || isCompletedCycle}
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isCompletedCycle,
      canEditProperties,
      removeIssue,
      updateIssue,
      removeIssueFromView,
      archiveIssue,
      restoreIssue,
    ]
  );

  const loadMoreIssues = useCallback(
    (groupId?: string) => {
      fetchNextIssues(groupId);
    },
    [fetchNextIssues]
  );

  // kanbanFilters and EIssueFilterType.KANBAN_FILTERS are used because the state is shared between kanban view and list view
  const handleCollapsedGroups = useCallback(
    (value: string) => {
      if (workspaceSlug) {
        let collapsedGroups = issuesFilter?.issueFilters?.kanbanFilters?.group_by || [];
        if (collapsedGroups.includes(value)) {
          collapsedGroups = collapsedGroups.filter((_value) => _value != value);
        } else {
          collapsedGroups.push(value);
        }
        updateFilters(projectId?.toString() ?? "", EIssueFilterType.KANBAN_FILTERS, {
          group_by: collapsedGroups,
        } as TIssueKanbanFilters);
      }
    },
    [workspaceSlug, issuesFilter, projectId, updateFilters]
  );

  return (
    <IssueLayoutHOC layout={EIssueLayoutTypes.LIST}>
      <>
        <div className={`relative size-full bg-surface-2`}>
          <List
            issuesMap={issueMap}
            displayProperties={displayProperties}
            group_by={group_by}
            orderBy={orderBy}
            updateIssue={updateIssue}
            quickActions={renderQuickActions}
            groupedIssueIds={groupedIssueIds ?? {}}
            loadMoreIssues={loadMoreIssues}
            showEmptyGroup={showEmptyGroup}
            canEditProperties={canEditProperties}
            disableIssueCreation={!enableIssueCreation || !isEditingAllowed}
            hideColumnHeaderAddButton={hideColumnHeaderAddButton}
            addIssuesToView={addIssuesToView}
            isCompletedCycle={isCompletedCycle}
            handleOnDrop={handleOnDrop}
            handleCollapsedGroups={handleCollapsedGroups}
            collapsedGroups={collapsedGroups}
            isEpic={isEpic}
            selectedGroupId={selectedGroupId}
            onSelectGroup={setSelectedGroupId}
          />
        </div>
        <StateTransitionAssigneeModal {...assigneeModalProps} />
      </>
    </IssueLayoutHOC>
  );
});
