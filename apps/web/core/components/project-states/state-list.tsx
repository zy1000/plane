/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import type { IState, TStateGroups, TStateOperationsCallbacks } from "@plane/types";
// components
import { StateItem } from "@/components/project-states";
import type { TProjectStatePermissions } from "./types";

type TStateList = {
  groupKey: TStateGroups;
  groupedStates: Record<string, IState[]>;
  states: IState[];
  stateOperationsCallbacks: TStateOperationsCallbacks;
  shouldTrackEvents: boolean;
  permissions: TProjectStatePermissions;
  stateItemClassName?: string;
};

export const StateList = observer(function StateList(props: TStateList) {
  const {
    groupKey,
    groupedStates,
    states,
    stateOperationsCallbacks,
    shouldTrackEvents,
    permissions,
    stateItemClassName,
  } = props;

  return (
    <>
      {states.map((state: IState) => (
        <StateItem
          key={state?.name}
          groupKey={groupKey}
          groupedStates={groupedStates}
          totalStates={states.length || 0}
          state={state}
          permissions={permissions}
          stateOperationsCallbacks={stateOperationsCallbacks}
          shouldTrackEvents={shouldTrackEvents}
          stateItemClassName={stateItemClassName}
        />
      ))}
    </>
  );
});
