/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { EIconSize } from "@plane/constants";
import { StateGroupIcon } from "@plane/propel/icons";
import type { IState } from "@plane/types";
import { cn } from "@plane/utils";
import type { TWorkflowTransition, TApprovalType } from "@/services/project/project-workflow.service";
import { TransitionFlowRow } from "./transition-flow-row";
import type { TPrincipalPanelDimension } from "./workflow-side-panel";

type TStateTransitionCardProps = {
  state: IState;
  allStates: IState[];
  transitions: TWorkflowTransition[];
  workspaceSlug: string;
  projectId: string;
  issueTypeId: string;
  isEditable: boolean;
  activePanelOwner: string | null;
  onSetActivePanelOwner: (key: string | null) => void;
  onSaveTransition: (
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
  ) => Promise<void>;
  onDeleteTransition: (transitionId: string) => Promise<void>;
  onRequestStatePanel: (
    availableStates: IState[],
    currentValue: string | null,
    onConfirm: (stateId: string) => void
  ) => void;
  onRequestPrincipalPanel: (
    dimension: TPrincipalPanelDimension,
    currentValue: string[],
    onConfirm: (principalIds: string[], count: number, useNofM: boolean) => void,
    options?: {
      requiredCount?: number;
      isNofM?: boolean;
      showApprovalRule?: boolean;
      readOnly?: boolean;
      onNext?: (principalIds: string[], count: number, useNofM: boolean) => void;
    }
  ) => void;
  onRequestFlowPanel: (onConfirm: () => void) => void;
  onRequestFieldsPanel: (
    currentValue: string[],
    onConfirm: (extraFieldIds: string[]) => void,
    readOnly?: boolean
  ) => void;
};

export const StateTransitionCard: FC<TStateTransitionCardProps> = ({
  state,
  allStates,
  transitions,
  workspaceSlug,
  projectId,
  issueTypeId,
  isEditable,
  activePanelOwner,
  onSetActivePanelOwner,
  onSaveTransition,
  onDeleteTransition,
  onRequestStatePanel,
  onRequestPrincipalPanel,
  onRequestFlowPanel,
  onRequestFieldsPanel,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showNewRow, setShowNewRow] = useState(false);

  const transitionCount = transitions.length;
  const usedToStateIds = transitions.map((t) => t.to_state_id);

  const handleAddFlow = () => {
    if (!isExpanded) setIsExpanded(true);
    setShowNewRow(true);
  };

  return (
    <div className="rounded-lg border border-subtle bg-surface-1 transition-all">
      {/* card header */}
      <div
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-lg px-4 py-3 hover:bg-layer-1/50",
          isExpanded && "rounded-b-none border-b border-subtle"
        )}
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <ChevronRight
          className={cn(
            "h-4 w-4 flex-shrink-0 text-tertiary transition-transform duration-200",
            isExpanded && "rotate-90"
          )}
        />

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <StateGroupIcon stateGroup={state.group} color={state.color} size={EIconSize.MD} />
          <span className="truncate text-sm font-medium text-primary">{state.name}</span>
        </div>

        {/* transition count badge */}
        {transitionCount > 0 && (
          <span
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-sm bg-layer-2 px-1.5 py-0.5 text-xs text-secondary"
            onClick={(e) => e.stopPropagation()}
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M9 18l6-6-6-6" />
            </svg>
            {transitionCount}
          </span>
        )}
      </div>

      {/* expanded content */}
      {isExpanded && (
        <div className="space-y-2 px-4 py-3">
          {transitions.map((transition) => (
            <TransitionFlowRow
              key={transition.id}
              transition={transition}
              fromState={state}
              allStates={allStates}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueTypeId={issueTypeId}
              usedToStateIds={usedToStateIds}
              isEditable={isEditable}
              rowKey={transition.id}
              activePanelOwner={activePanelOwner}
              onSetActivePanelOwner={onSetActivePanelOwner}
              onSave={(data) => onSaveTransition(state.id, data)}
              onDelete={onDeleteTransition}
              onDiscard={() => {}}
              onRequestStatePanel={onRequestStatePanel}
              onRequestPrincipalPanel={onRequestPrincipalPanel}
              onRequestFlowPanel={onRequestFlowPanel}
              onRequestFieldsPanel={onRequestFieldsPanel}
            />
          ))}

          {showNewRow && (
            <TransitionFlowRow
              transition={null}
              fromState={state}
              allStates={allStates}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueTypeId={issueTypeId}
              usedToStateIds={usedToStateIds}
              isEditable={isEditable}
              rowKey={`new-${state.id}`}
              activePanelOwner={activePanelOwner}
              onSetActivePanelOwner={onSetActivePanelOwner}
              onSave={async (data) => {
                await onSaveTransition(state.id, data);
                setShowNewRow(false);
              }}
              onDelete={async () => {}}
              onDiscard={() => setShowNewRow(false)}
              onRequestStatePanel={onRequestStatePanel}
              onRequestPrincipalPanel={onRequestPrincipalPanel}
              onRequestFlowPanel={onRequestFlowPanel}
              onRequestFieldsPanel={onRequestFieldsPanel}
            />
          )}

          {isEditable && !showNewRow && (
            <button
              type="button"
              onClick={handleAddFlow}
              className="flex items-center gap-1.5 text-xs text-secondary transition-colors hover:text-accent-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              Add flow
            </button>
          )}
        </div>
      )}
    </div>
  );
};
