/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IState, EIssuesStoreType, TIssue, TIssueGroupByOptions, TIssueOrderByOptions } from "@plane/types";
import type { GroupDropLocation } from "@/components/issues/issue-layouts/utils";
import { isWorkflowApprovalInitiated, type TIssueWorkflowUpdateError } from "@/components/issues/workflow-error-utils";
import { handleGroupDragDrop } from "@/components/issues/issue-layouts/utils";
import { store } from "@/lib/store-context";
import { ISSUE_FILTER_DEFAULT_DATA } from "@/store/issue/helpers/base-issues.store";
import { useIssueDetail } from "./store/use-issue-detail";
import { useIssues } from "./store/use-issues";
import { useIssuesActions } from "./use-issues-actions";

type DNDStoreType =
  | EIssuesStoreType.PROJECT
  | EIssuesStoreType.MODULE
  | EIssuesStoreType.CYCLE
  | EIssuesStoreType.PROJECT_VIEW
  | EIssuesStoreType.PROFILE
  | EIssuesStoreType.ARCHIVED
  | EIssuesStoreType.WORKSPACE_DRAFT
  | EIssuesStoreType.TEAM
  | EIssuesStoreType.TEAM_VIEW
  | EIssuesStoreType.EPIC
  | EIssuesStoreType.TEAM_PROJECT_WORK_ITEMS;

export type PendingDrop = {
  source: GroupDropLocation;
  destination: GroupDropLocation;
  statesInGroup: IState[];
};

export const useGroupIssuesDragNDrop = (
  storeType: DNDStoreType,
  orderBy: TIssueOrderByOptions | undefined,
  groupBy: TIssueGroupByOptions | undefined,
  subGroupBy?: TIssueGroupByOptions
) => {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();

  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);

  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { updateIssue } = useIssuesActions(storeType);
  const {
    issues: { getIssueIds, addCycleToIssue, removeCycleFromIssue, changeModulesInIssue },
  } = useIssues(storeType);

  /**
   * update Issue on Drop, checks if modules or cycles are changed and then calls appropriate functions
   * @param projectId
   * @param issueId
   * @param data
   * @param issueUpdates
   */
  const updateIssueOnDrop = async (
    projectId: string,
    issueId: string,
    data: Partial<TIssue>,
    issueUpdates: {
      [groupKey: string]: {
        ADD: string[];
        REMOVE: string[];
      };
    }
  ) => {
    const errorToastProps = {
      type: TOAST_TYPE.ERROR,
      title: t("common.error.label"),
      message: "Error while updating work item",
    };
    const moduleKey = ISSUE_FILTER_DEFAULT_DATA["module"];
    const cycleKey = ISSUE_FILTER_DEFAULT_DATA["cycle"];

    const isModuleChanged = Object.keys(data).includes(moduleKey);
    const isCycleChanged = Object.keys(data).includes(cycleKey);

    if (isCycleChanged && workspaceSlug) {
      if (data[cycleKey]) {
        addCycleToIssue(workspaceSlug.toString(), projectId, data[cycleKey]?.toString() ?? "", issueId).catch(() =>
          setToast(errorToastProps)
        );
      } else {
        removeCycleFromIssue(workspaceSlug.toString(), projectId, issueId).catch(() => setToast(errorToastProps));
      }
      delete data[cycleKey];
    }

    if (isModuleChanged && workspaceSlug && issueUpdates[moduleKey]) {
      changeModulesInIssue(
        workspaceSlug.toString(),
        projectId,
        issueId,
        issueUpdates[moduleKey].ADD,
        issueUpdates[moduleKey].REMOVE
      ).catch(() => setToast(errorToastProps));
      delete data[moduleKey];
    }

    updateIssue &&
      updateIssue(projectId, issueId, data).catch((error) => {
        const errorData = error as TIssueWorkflowUpdateError;
        const approvalInitiated = isWorkflowApprovalInitiated(errorData);
        setToast({
          ...errorToastProps,
          type: approvalInitiated ? TOAST_TYPE.INFO : TOAST_TYPE.ERROR,
          title: approvalInitiated ? "已发起审批流程" : errorToastProps.title,
          message: errorData?.error ?? errorToastProps.message,
        });
      });
  };

  const executeDrop = async (
    source: GroupDropLocation,
    destination: GroupDropLocation,
    overrideStateId?: string
  ) => {
    await handleGroupDragDrop(
      source,
      destination,
      getIssueById,
      getIssueIds,
      updateIssueOnDrop,
      groupBy,
      subGroupBy,
      orderBy !== "sort_order",
      overrideStateId
    ).catch((err) => {
      setToast({
        title: t("common.error.label"),
        type: TOAST_TYPE.ERROR,
        message: err?.detail ?? "Failed to perform this action",
      });
    });
  };

  const handleOnDrop = async (source: GroupDropLocation, destination: GroupDropLocation) => {
    if (
      source.columnId &&
      destination.columnId &&
      destination.columnId === source.columnId &&
      destination.id === source.id
    )
      return;

    // 当按状态组分组时，检查目标组是否有多个状态，若有则弹出选择框
    if (
      groupBy === "state_detail.group" &&
      source.groupId &&
      destination.groupId &&
      source.groupId !== destination.groupId
    ) {
      const sourceIssue = getIssueById(source.id ?? "");
      if (sourceIssue) {
        const projectStates = store.state.getProjectStates(sourceIssue.project_id ?? undefined) ?? [];
        const statesInGroup = projectStates
          .filter((s) => s.group === destination.groupId && s.issue_type_id === sourceIssue.type_id)
          .sort((a, b) => a.sequence - b.sequence);

        if (statesInGroup.length > 1) {
          setPendingDrop({ source, destination, statesInGroup });
          return;
        }
      }
    }

    await executeDrop(source, destination);
  };

  const confirmStateSelection = async (stateId: string) => {
    if (!pendingDrop) return;
    const { source, destination } = pendingDrop;
    setPendingDrop(null);
    await executeDrop(source, destination, stateId);
  };

  const cancelStateSelection = () => {
    setPendingDrop(null);
  };

  return { handleOnDrop, pendingDrop, confirmStateSelection, cancelStateSelection };
};
