/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { observer } from "mobx-react";
// plane constants
import { ALL_ISSUES } from "@plane/constants";
import type {
  GroupByColumnTypes,
  TGroupedIssues,
  TIssue,
  IIssueDisplayProperties,
  TIssueMap,
  TIssueGroupByOptions,
  TIssueOrderByOptions,
  IGroupByColumn,
  TIssueKanbanFilters,
} from "@plane/types";
// components
import { MultipleSelectGroup } from "@/components/core/multiple-select";
// hooks
import { useIssueStoreType, useTypedPageIssueTypeIds } from "@/hooks/use-issue-layout-store";
// plane web components
import { IssueBulkOperationsRoot } from "@/plane-web/components/issues/bulk-operations";
// plane web hooks
import { useBulkOperationStatus } from "@/plane-web/hooks/use-bulk-operation-status";
// utils
import type { GroupDropLocation } from "../utils";
import { getGroupByColumns, isWorkspaceLevel, isSubGrouped } from "../utils";
import { GroupSidebar } from "./group-sidebar";
import { ListGroup } from "./list-group";
import type { TRenderQuickActions } from "./list-view-types";

export interface IList {
  groupedIssueIds: TGroupedIssues;
  issuesMap: TIssueMap;
  group_by: TIssueGroupByOptions | null;
  orderBy: TIssueOrderByOptions | undefined;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  quickActions: TRenderQuickActions;
  displayProperties: IIssueDisplayProperties | undefined;
  showEmptyGroup?: boolean;
  canEditProperties: (projectId: string | undefined) => boolean;
  disableIssueCreation?: boolean;
  hideColumnHeaderAddButton?: boolean;
  handleOnDrop: (source: GroupDropLocation, destination: GroupDropLocation) => Promise<void>;
  addIssuesToView?: (issueIds: string[]) => Promise<TIssue>;
  isCompletedCycle?: boolean;
  loadMoreIssues: (groupId?: string) => void;
  handleCollapsedGroups: (value: string) => void;
  collapsedGroups: TIssueKanbanFilters;
  isEpic?: boolean;
  /** 受控的当前分组 id；由 BaseListRoot 持有以便在数据刷新导致 List 卸载后保留选中项 */
  selectedGroupId: string | null;
  /** 选中分组的 setter；由 BaseListRoot 提供 */
  onSelectGroup: (groupId: string | null) => void;
}

export const List = observer(function List(props: IList) {
  const {
    groupedIssueIds,
    issuesMap,
    group_by,
    orderBy,
    updateIssue,
    quickActions,
    displayProperties,
    showEmptyGroup,
    canEditProperties,
    disableIssueCreation,
    hideColumnHeaderAddButton,
    handleOnDrop,
    addIssuesToView,
    isCompletedCycle = false,
    loadMoreIssues,
    handleCollapsedGroups,
    collapsedGroups,
    isEpic = false,
    selectedGroupId,
    onSelectGroup,
  } = props;

  const storeType = useIssueStoreType();
  const typedPageIssueTypeIds = useTypedPageIssueTypeIds();
  // plane web hooks
  const isBulkOperationsEnabled = useBulkOperationStatus();

  const containerRef = useRef<HTMLDivElement | null>(null);

  const groups = getGroupByColumns({
    groupBy: group_by as GroupByColumnTypes,
    includeNone: true,
    isWorkspaceLevel: isWorkspaceLevel(storeType),
    isEpic: isEpic,
    issueTypeIds: typedPageIssueTypeIds,
  });

  const is_list = group_by === null;
  const isGrouped = !is_list && !!groups && groups.length > 0;

  // Auto-select the first visible group when groups change or selectedGroupId is invalid.
  // 注意：selectedGroupId 由父级（BaseListRoot）持有，因此即使本组件在
  // fetchIssues('mutation') 时被 IssueLayoutHOC 暂时卸载，选中项也会保留；
  // 这里的校验只在 groupBy 切换或当前选中真的不在可选集合时生效。
  useEffect(() => {
    if (!isGrouped || !groups) return;
    const currentValid = selectedGroupId && groups.some((g) => g.id === selectedGroupId);
    if (!currentValid) {
      onSelectGroup(groups[0]?.id ?? null);
    }
  }, [isGrouped, groups, selectedGroupId, onSelectGroup]);

  // Enable Auto Scroll for Main Kanban
  useEffect(() => {
    const element = containerRef.current;

    if (!element) return;

    return combine(
      autoScrollForElements({
        element,
      })
    );
  }, [containerRef]);

  if (!groups) return null;

  const getGroupIndex = (groupId: string | undefined) => groups.findIndex(({ id }) => id === groupId);

  const groupIds = groups.map((g) => g.id);
  const orderedGroups: Record<string, string[]> = {};
  groupIds.forEach((gID) => {
    orderedGroups[gID] = [];
  });

  let entities: Record<string, string[]> = {};

  if (is_list) {
    entities = Object.assign(orderedGroups, { [groupIds[0]]: groupedIssueIds[ALL_ISSUES] ?? [] });
  } else if (!isSubGrouped(groupedIssueIds)) {
    entities = Object.assign(orderedGroups, { ...groupedIssueIds });
  } else {
    entities = orderedGroups;
  }

  const activeGroup = isGrouped && selectedGroupId ? groups.find((g) => g.id === selectedGroupId) : null;

  // In sidebar mode, ensure the active group is never collapsed
  const sidebarCollapsedGroups: TIssueKanbanFilters = isGrouped && selectedGroupId
    ? {
        ...collapsedGroups,
        group_by: (collapsedGroups?.group_by ?? []).filter((id) => id !== selectedGroupId),
      }
    : collapsedGroups;

  if (isGrouped) {
    return (
      <div className="relative flex size-full">
        <GroupSidebar
          groups={groups}
          groupedIssueIds={groupedIssueIds}
          groupBy={group_by}
          selectedGroupId={selectedGroupId ?? ""}
          onSelectGroup={onSelectGroup}
          showEmptyGroup={showEmptyGroup}
        />
        <div className="relative flex min-w-0 flex-1 flex-col">
          <MultipleSelectGroup
            containerRef={containerRef}
            entities={entities}
            disabled={isEpic}
          >
            {(helpers) => (
              <>
                <div
                  ref={containerRef}
                  className="vertical-scrollbar relative scrollbar-lg size-full overflow-auto bg-surface-1"
                >
                  {activeGroup && (
                    <ListGroup
                      key={activeGroup.id}
                      groupIssueIds={groupedIssueIds?.[activeGroup.id]}
                      issuesMap={issuesMap}
                      group_by={group_by}
                      group={activeGroup}
                      updateIssue={updateIssue}
                      quickActions={quickActions}
                      orderBy={orderBy}
                      getGroupIndex={getGroupIndex}
                      handleOnDrop={handleOnDrop}
                      displayProperties={displayProperties}
                      showEmptyGroup={showEmptyGroup}
                      canEditProperties={canEditProperties}
                      disableIssueCreation={disableIssueCreation}
                      hideColumnHeaderAddButton={hideColumnHeaderAddButton}
                      addIssuesToView={addIssuesToView}
                      isCompletedCycle={isCompletedCycle}
                      loadMoreIssues={loadMoreIssues}
                      containerRef={containerRef}
                      selectionHelpers={helpers}
                      handleCollapsedGroups={handleCollapsedGroups}
                      collapsedGroups={sidebarCollapsedGroups}
                      isEpic={isEpic}
                      hideGroupHeader
                    />
                  )}
                </div>

                <IssueBulkOperationsRoot selectionHelpers={helpers} />
              </>
            )}
          </MultipleSelectGroup>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex size-full flex-col">
      {groups && (
        <MultipleSelectGroup
          containerRef={containerRef}
          entities={entities}
          disabled={isEpic}
        >
          {(helpers) => (
            <>
              <div
                ref={containerRef}
                className="vertical-scrollbar relative scrollbar-lg size-full overflow-auto bg-surface-1"
              >
                {groups.map((group: IGroupByColumn) => (
                  <ListGroup
                    key={group.id}
                    groupIssueIds={groupedIssueIds?.[group.id]}
                    issuesMap={issuesMap}
                    group_by={group_by}
                    group={group}
                    updateIssue={updateIssue}
                    quickActions={quickActions}
                    orderBy={orderBy}
                    getGroupIndex={getGroupIndex}
                    handleOnDrop={handleOnDrop}
                    displayProperties={displayProperties}
                    showEmptyGroup={showEmptyGroup}
                    canEditProperties={canEditProperties}
                    disableIssueCreation={disableIssueCreation}
                    hideColumnHeaderAddButton={hideColumnHeaderAddButton}
                    addIssuesToView={addIssuesToView}
                    isCompletedCycle={isCompletedCycle}
                    loadMoreIssues={loadMoreIssues}
                    containerRef={containerRef}
                    selectionHelpers={helpers}
                    handleCollapsedGroups={handleCollapsedGroups}
                    collapsedGroups={collapsedGroups}
                    isEpic={isEpic}
                  />
                ))}
              </div>

              <IssueBulkOperationsRoot selectionHelpers={helpers} />
            </>
          )}
        </MultipleSelectGroup>
      )}
    </div>
  );
});
