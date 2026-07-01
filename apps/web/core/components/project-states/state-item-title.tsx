/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { SetStateAction } from "react";
import { observer } from "mobx-react";
import { GripVertical } from "lucide-react";
import { EIconSize, STATE_TRACKER_ELEMENTS } from "@plane/constants";
// plane imports
import { EditIcon, StateGroupIcon } from "@plane/propel/icons";
import type { IState, TStateOperationsCallbacks } from "@plane/types";
// local imports
import { useProjectState } from "@/hooks/store/use-project-state";
import { StateDelete, StateMarksAsDefault } from "./options";
import type { TProjectStatePermissions } from "./types";

type TBaseStateItemTitleProps = {
  stateCount: number;
  state: IState;
  shouldShowDescription?: boolean;
  setUpdateStateModal: (value: SetStateAction<boolean>) => void;
  stateOperationsCallbacks: Pick<TStateOperationsCallbacks, "markStateAsDefault" | "deleteState">;
  permissions: TProjectStatePermissions;
  shouldTrackEvents: boolean;
};

export type TStateItemTitleProps = TBaseStateItemTitleProps;

export const StateItemTitle = observer(function StateItemTitle(props: TStateItemTitleProps) {
  const { stateCount, setUpdateStateModal, permissions, state, shouldShowDescription = true } = props;
  // store hooks
  const { getStatePercentageInGroup } = useProjectState();
  // derived values
  const statePercentage = getStatePercentageInGroup(state.id);
  const percentage = statePercentage ? statePercentage / 100 : undefined;

  return (
    <div className="flex w-full items-center justify-between gap-2">
      <div className="flex items-center gap-1 px-1">
        {/* draggable indicator */}
        {permissions.canEditState && stateCount != 1 && (
          <div className="absolute -left-1.5 hidden h-3 w-3 flex-shrink-0 cursor-pointer items-center justify-center rounded-xs bg-surface-2 text-secondary transition-colors group-hover:flex hover:text-primary">
            <GripVertical className="h-3 w-3" />
          </div>
        )}
        {/* state icon */}
        <div className="flex-shrink-0">
          <StateGroupIcon stateGroup={state.group} color={state.color} size={EIconSize.XL} percentage={percentage} />
        </div>
        {/* state title and description */}
        <div className="min-h-5 px-2 text-13">
          <h6 className="text-13 font-medium">{state.name}</h6>
          {shouldShowDescription && <p className="text-11 text-secondary">{state.description}</p>}
        </div>
      </div>
      <div className="hidden items-center gap-2 group-hover:flex">
        {/* state mark as default option */}
        <div className="flex-shrink-0 text-11 transition-all">
          <StateMarksAsDefault
            stateId={state.id}
            isDefault={state.default ? true : false}
            markStateAsDefaultCallback={props.stateOperationsCallbacks.markStateAsDefault}
            disabled={!permissions.canMarkStateAsDefault}
          />
        </div>
        {/* state edit options */}
        <div className="flex items-center gap-1 transition-all">
          <button
            className="flex h-5 w-5 flex-shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-sm text-secondary transition-colors hover:bg-layer-1 hover:text-primary disabled:cursor-not-allowed disabled:text-placeholder disabled:hover:bg-transparent"
            onClick={() => {
              if (permissions.canEditState) setUpdateStateModal(true);
            }}
            disabled={!permissions.canEditState}
            data-ph-element={STATE_TRACKER_ELEMENTS.STATE_LIST_EDIT_BUTTON}
          >
            <EditIcon className="h-3 w-3" />
          </button>
          <StateDelete
            totalStates={stateCount}
            state={state}
            deleteStateCallback={props.stateOperationsCallbacks.deleteState}
            shouldTrackEvents={props.shouldTrackEvents}
            disabled={!permissions.canDeleteState}
          />
        </div>
      </div>
    </div>
  );
});
