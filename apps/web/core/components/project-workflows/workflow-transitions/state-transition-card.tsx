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
import type { TWorkflowTransition } from "@/services/project/project-workflow.service";
import { TransitionFlowRow } from "./transition-flow-row";
import type { TViewBox } from "./workflow-view-panel";

type TActiveView = {
  fromState: IState;
  transition: TWorkflowTransition;
  box: TViewBox;
};

type TStateTransitionCardProps = {
  state: IState;
  allStates: IState[];
  transitions: TWorkflowTransition[];
  isEditable: boolean;
  activeView: TActiveView | null;
  onCreate: (state: IState) => void;
  onViewBox: (state: IState, transition: TWorkflowTransition, box: TViewBox) => void;
  onEdit: (state: IState, transition: TWorkflowTransition) => void;
  onDeleteTransition: (transitionId: string) => Promise<void>;
};

export const StateTransitionCard: FC<TStateTransitionCardProps> = ({
  state,
  allStates,
  transitions,
  isEditable,
  activeView,
  onCreate,
  onViewBox,
  onEdit,
  onDeleteTransition,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const transitionCount = transitions.length;

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
              isEditable={isEditable}
              activeViewBox={activeView?.transition.id === transition.id ? activeView.box : null}
              onViewBox={(box) => onViewBox(state, transition, box)}
              onEdit={() => onEdit(state, transition)}
              onDelete={onDeleteTransition}
            />
          ))}

          {isEditable && (
            <button
              type="button"
              onClick={() => {
                if (!isExpanded) setIsExpanded(true);
                onCreate(state);
              }}
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
