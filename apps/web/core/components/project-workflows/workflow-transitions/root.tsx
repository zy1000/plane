/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useCallback, useEffect, useState } from "react";
import { GitPullRequest } from "lucide-react";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IState } from "@plane/types";
import { useWorkflowTransitions } from "@/hooks/store/use-workflow-transitions";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUserPermissions } from "@/hooks/store/user";
import type { TApprovalType, TWorkflow, TWorkflowTransition } from "@/services/project/project-workflow.service";
import { StateTransitionCard } from "./state-transition-card";
import { TransitionEditModal } from "./transition-edit-modal";
import { WorkflowViewPanel, type TViewBox } from "./workflow-view-panel";

type TWorkflowTransitionsRootProps = {
  workspaceSlug: string;
  projectId: string;
  workflow: TWorkflow;
};

const TransitionsSkeleton: FC = () => (
  <div className="flex flex-col gap-3">
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="h-14 animate-pulse rounded-lg border border-subtle bg-layer-1" />
    ))}
  </div>
);

export const WorkflowTransitionsRoot: FC<TWorkflowTransitionsRootProps> = ({
  workspaceSlug,
  projectId,
  workflow,
}) => {
  const { t } = useTranslation();
  const { allowProjectPermissionKeys } = useUserPermissions();
  const { getProjectStatesByIssueTypeId, fetchProjectStates } = useProjectState();
  const {
    transitions,
    isLoading,
    fetchTransitions,
    createTransition,
    updateTransition,
    deleteTransition: deleteTransitionApi,
  } = useWorkflowTransitions(workspaceSlug, projectId, workflow.id);

  const toastWorkflowError = useCallback(
    (error: unknown, fallbackMessage: string) => {
      if (isProjectPermissionError(error)) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
          message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
            ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
            : undefined,
        });
        return;
      }
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: fallbackMessage,
      });
    },
    [t]
  );

  const [editing, setEditing] = useState<{
    fromState: IState;
    transition: TWorkflowTransition | null;
  } | null>(null);
  const [activeView, setActiveView] = useState<{
    fromState: IState;
    transition: TWorkflowTransition;
    box: TViewBox;
  } | null>(null);

  const isEditable = allowProjectPermissionKeys(["workflow.config"], workspaceSlug, projectId);

  useEffect(() => {
    fetchTransitions();
  }, [fetchTransitions]);

  useEffect(() => {
    if (workflow.issue_type_id) {
      fetchProjectStates(workspaceSlug, projectId, workflow.issue_type_id);
    }
  }, [workspaceSlug, projectId, workflow.issue_type_id, fetchProjectStates]);

  const allStates = getProjectStatesByIssueTypeId(projectId, workflow.issue_type_id) ?? [];

  const transitionsByState: Record<string, typeof transitions> = {};
  for (const state of allStates) {
    transitionsByState[state.id] = transitions.filter((t) => t.from_state_id === state.id);
  }

  const handleSaveTransition = async (
    stateId: string,
    data: {
      id?: string;
      to_state_id: string;
      initiator_ids: string[];
      assignee_ids: string[];
      approver_ids: string[];
      approval_type: TApprovalType;
      required_count?: number;
      extra_field_ids: string[];
    }
  ) => {
    const requiredCountField = data.required_count !== undefined ? { required_count: data.required_count } : {};
    try {
      if (data.id) {
        await updateTransition({
          id: data.id,
          to_state_id: data.to_state_id,
          initiator_ids: data.initiator_ids,
          assignee_ids: data.assignee_ids,
          approver_ids: data.approver_ids,
          approval_type: data.approval_type,
          extra_field_ids: data.extra_field_ids,
          ...requiredCountField,
        });
      } else {
        await createTransition({
          workflow_id: workflow.id,
          from_state_id: stateId,
          to_state_id: data.to_state_id,
          initiator_ids: data.initiator_ids,
          assignee_ids: data.assignee_ids,
          approver_ids: data.approver_ids,
          approval_type: data.approval_type,
          extra_field_ids: data.extra_field_ids,
          ...requiredCountField,
        });
      }
    } catch (error) {
      toastWorkflowError(error, data.id ? "更新流转配置失败，请重试。" : "创建流转失败，请重试。");
      throw error;
    }
  };

  const handleDeleteTransition = async (transitionId: string) => {
    try {
      await deleteTransitionApi(transitionId);
    } catch (error) {
      toastWorkflowError(error, "删除流转失败，请重试。");
    }
  };

  const handleOpenCreate = (state: IState) => {
    setEditing({ fromState: state, transition: null });
  };

  const handleOpenEdit = (state: IState, transition: TWorkflowTransition) => {
    setActiveView(null);
    setEditing({ fromState: state, transition });
  };

  const handleViewBox = (state: IState, transition: TWorkflowTransition, box: TViewBox) => {
    setActiveView((prev) =>
      prev && prev.transition.id === transition.id && prev.box === box
        ? null
        : { fromState: state, transition, box }
    );
  };

  const modalUsedToStateIds = editing
    ? (transitionsByState[editing.fromState.id] ?? []).map((transition) => transition.to_state_id)
    : [];

  return (
    <div className="flex flex-col gap-6">
      {/* workflow info banner */}
      <div className="flex items-center justify-between gap-4 rounded-lg bg-surface-1 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <GitPullRequest className="rotate-90 h-5 w-5 flex-shrink-0 text-secondary" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-primary">{workflow.name}</p>
            {workflow.description && (
              <p className="truncate text-xs text-secondary">{workflow.description}</p>
            )}
          </div>
        </div>
        {workflow.is_active && (
          <span className="inline-flex flex-shrink-0 items-center rounded-sm bg-accent-subtle px-2 py-0.5 text-xs font-medium text-accent-primary">
            活动
          </span>
        )}
      </div>

      {/* define workflow section */}
      <div>
        <h3 className="mb-3 text-sm font-medium text-secondary">Define workflow</h3>

        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            {isLoading ? (
              <TransitionsSkeleton />
            ) : allStates.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-subtle py-12 text-center gap-3">
                <GitPullRequest className="rotate-90 size-8 text-tertiary" strokeWidth={1.2} />
                <p className="text-sm text-secondary">该工作流关联的工作项类型暂无状态</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {allStates.map((state) => (
                  <StateTransitionCard
                    key={state.id}
                    state={state}
                    allStates={allStates}
                    transitions={transitionsByState[state.id] ?? []}
                    isEditable={isEditable}
                    activeView={activeView}
                    onCreate={handleOpenCreate}
                    onViewBox={handleViewBox}
                    onEdit={handleOpenEdit}
                    onDeleteTransition={handleDeleteTransition}
                  />
                ))}
              </div>
            )}
          </div>

          {activeView && (
            <div
              className="w-64 flex-shrink-0 sticky top-0 flex flex-col"
              style={{ height: "calc(100vh - 2.75rem)" }}
            >
              <WorkflowViewPanel
                box={activeView.box}
                transition={activeView.transition}
                fromState={activeView.fromState}
                allStates={allStates}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                issueTypeId={workflow.issue_type_id}
                onClose={() => setActiveView(null)}
              />
            </div>
          )}
        </div>
      </div>

      {editing && (
        <TransitionEditModal
          isOpen={!!editing}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          issueTypeId={workflow.issue_type_id}
          fromState={editing.fromState}
          allStates={allStates}
          usedToStateIds={modalUsedToStateIds}
          transition={editing.transition}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await handleSaveTransition(editing.fromState.id, data);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
};
