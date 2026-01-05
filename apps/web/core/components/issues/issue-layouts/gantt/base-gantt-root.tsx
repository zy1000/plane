import React, { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { ALL_ISSUES, EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { EIssuesStoreType, IBlockUpdateData, TIssue } from "@plane/types";
import { EIssueLayoutTypes, EIssueServiceType, GANTT_TIMELINE_TYPE } from "@plane/types";
import { renderFormattedPayloadDate } from "@plane/utils";
// components
import { TimeLineTypeContext } from "@/components/gantt-chart/contexts";
import { GanttChartRoot } from "@/components/gantt-chart/root";
import { IssueGanttSidebar } from "@/components/gantt-chart/sidebar/issues/sidebar";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useUserPermissions } from "@/hooks/store/user";
import { useIssueStoreType } from "@/hooks/use-issue-layout-store";
import { useIssuesActions } from "@/hooks/use-issues-actions";
import { useTimeLineChart } from "@/hooks/use-timeline-chart";
// plane web hooks
import { useBulkOperationStatus } from "@/plane-web/hooks/use-bulk-operation-status";

import { IssueLayoutHOC } from "../issue-layout-HOC";
import { GanttQuickAddIssueButton, QuickAddIssueRoot } from "../quick-add";
import { IssueGanttBlock } from "./blocks";

interface IBaseGanttRoot {
  viewId?: string | undefined;
  isCompletedCycle?: boolean;
  isEpic?: boolean;
}

export type GanttStoreType =
  | EIssuesStoreType.PROJECT
  | EIssuesStoreType.MODULE
  | EIssuesStoreType.CYCLE
  | EIssuesStoreType.PROJECT_VIEW
  | EIssuesStoreType.EPIC;

export const BaseGanttRoot = observer(function BaseGanttRoot(props: IBaseGanttRoot) {
  const { viewId, isCompletedCycle = false, isEpic = false } = props;
  const { t } = useTranslation();
  // router
  const { workspaceSlug, projectId } = useParams();

  const storeType = useIssueStoreType() as GanttStoreType;
  const { issues, issuesFilter } = useIssues(storeType);
  const { fetchIssues, fetchNextIssues, updateIssue, quickAddIssue } = useIssuesActions(storeType);
  const { initGantt } = useTimeLineChart(GANTT_TIMELINE_TYPE.ISSUE);
  // store hooks
  const { allowPermissions } = useUserPermissions();
  const { subIssues: subIssuesStore, issue: issueDetailStore } = useIssueDetail(
    isEpic ? EIssueServiceType.EPICS : EIssueServiceType.ISSUES
  );

  const appliedDisplayFilters = issuesFilter.issueFilters?.displayFilters;
  // plane web hooks
  const isBulkOperationsEnabled = useBulkOperationStatus();
  // derived values
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 1);

  useEffect(() => {
    fetchIssues("init-loader", { canGroup: false, perPageCount: 100 }, viewId);
  }, [fetchIssues, storeType, viewId]);

  useEffect(() => {
    initGantt();
  }, []);

  const issuesIds = (issues.groupedIssueIds?.[ALL_ISSUES] as string[]) ?? [];
  const nextPageResults = issues.getPaginationData(undefined, undefined)?.nextPageResults;

  const { enableIssueCreation } = issues?.viewFlags || {};

  const [expandedIssueIds, setExpandedIssueIds] = useState<Set<string>>(() => new Set());

  const visibleIssueRows: { id: string; nestingLevel: number }[] = [];
  const nestingLevelById: Record<string, number> = {};
  const visitedIds = new Set<string>();

  const pushVisible = (id: string, nestingLevel: number) => {
    if (!id || visitedIds.has(id)) return;
    visitedIds.add(id);
    visibleIssueRows.push({ id, nestingLevel });
    nestingLevelById[id] = nestingLevel;

    if (isEpic) return;
    if (nestingLevel >= 3) return;
    if (!expandedIssueIds.has(id)) return;

    const subIssueIds = subIssuesStore.subIssuesByIssueId(id) ?? [];
    for (const subIssueId of subIssueIds) {
      pushVisible(subIssueId, nestingLevel + 1);
    }
  };

  for (const issueId of issuesIds) pushVisible(issueId, 0);

  const visibleIssueIds = visibleIssueRows.map((row) => row.id);

  const loadMoreIssues = useCallback(() => {
    fetchNextIssues();
  }, [fetchNextIssues]);

  const handleToggleExpand = useCallback(
    async (issueId: string) => {
      if (!workspaceSlug || isEpic) return;

      const nestingLevel = nestingLevelById[issueId] ?? 0;
      if (nestingLevel >= 3) return;

      const isCurrentlyExpanded = expandedIssueIds.has(issueId);
      if (isCurrentlyExpanded) {
        const idsToCollapse: string[] = [];
        const collect = (id: string, level: number) => {
          idsToCollapse.push(id);
          if (level >= 3) return;
          const children = subIssuesStore.subIssuesByIssueId(id) ?? [];
          for (const childId of children) collect(childId, level + 1);
        };
        collect(issueId, nestingLevel);

        setExpandedIssueIds((prev) => {
          const next = new Set(prev);
          for (const id of idsToCollapse) next.delete(id);
          return next;
        });
        return;
      }

      const issue = issueDetailStore.getIssueById(issueId);
      if (issue?.project_id) {
        await subIssuesStore.fetchSubIssues(workspaceSlug.toString(), issue.project_id, issueId);
      }

      setExpandedIssueIds((prev) => {
        const next = new Set(prev);
        next.add(issueId);
        return next;
      });
    },
    [expandedIssueIds, isEpic, issueDetailStore, nestingLevelById, subIssuesStore, workspaceSlug]
  );

  const updateIssueBlockStructure = async (issue: TIssue, data: IBlockUpdateData) => {
    if (!workspaceSlug) return;

    const payload: any = { ...data };
    if (data.sort_order) payload.sort_order = data.sort_order.newSortOrder;

    updateIssue && (await updateIssue(issue.project_id, issue.id, payload));
  };

  const isAllowed = allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.PROJECT);
  const updateBlockDates = useCallback(
    (
      updates: {
        id: string;
        start_date?: string;
        target_date?: string;
      }[]
    ) =>
      issues.updateIssueDates(workspaceSlug.toString(), updates, projectId.toString()).catch(() => {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("toast.error"),
          message: "Error while updating work item dates, Please try again Later",
        });
      }),
    [issues, projectId, workspaceSlug]
  );

  const quickAdd =
    enableIssueCreation && isAllowed && !isCompletedCycle ? (
      <QuickAddIssueRoot
        layout={EIssueLayoutTypes.GANTT}
        QuickAddButton={GanttQuickAddIssueButton}
        containerClassName="sticky bottom-0 z-[1]"
        prePopulatedData={{
          start_date: renderFormattedPayloadDate(new Date()),
          target_date: renderFormattedPayloadDate(targetDate),
        }}
        quickAddCallback={quickAddIssue}
        isEpic={isEpic}
      />
    ) : undefined;

  return (
    <IssueLayoutHOC layout={EIssueLayoutTypes.GANTT}>
      <TimeLineTypeContext.Provider value={GANTT_TIMELINE_TYPE.ISSUE}>
        <div className="h-full w-full">
          <GanttChartRoot
            border={false}
            title={isEpic ? t("epic.label", { count: 2 }) : t("issue.label", { count: 2 })}
            loaderTitle={isEpic ? t("epic.label", { count: 2 }) : t("issue.label", { count: 2 })}
            blockIds={visibleIssueIds}
            blockUpdateHandler={updateIssueBlockStructure}
            blockToRender={(data: TIssue) => <IssueGanttBlock issueId={data.id} isEpic={isEpic} />}
            sidebarToRender={(props) => (
              <IssueGanttSidebar
                {...props}
                showAllBlocks
                isEpic={isEpic}
                rootBlockIds={issuesIds}
                expandedIssueIds={expandedIssueIds}
                nestingLevelById={nestingLevelById}
                onToggleExpand={handleToggleExpand}
              />
            )}
            enableBlockLeftResize={isAllowed}
            enableBlockRightResize={isAllowed}
            enableBlockMove={isAllowed}
            enableReorder={appliedDisplayFilters?.order_by === "sort_order" && isAllowed}
            enableAddBlock={isAllowed}
            enableSelection={isBulkOperationsEnabled && isAllowed}
            quickAdd={quickAdd}
            loadMoreBlocks={loadMoreIssues}
            canLoadMoreBlocks={nextPageResults}
            updateBlockDates={updateBlockDates}
            showAllBlocks
            enableDependency
            isEpic={isEpic}
          />
        </div>
      </TimeLineTypeContext.Provider>
    </IssueLayoutHOC>
  );
});
