/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
// icons
// plane imports
import { EIconSize } from "@plane/constants";
import { CloseIcon, StateGroupIcon } from "@plane/propel/icons";
import type { IState } from "@plane/types";

type Props = {
  handleRemove: (val: string | string[]) => void;
  states: IState[];
  values: string[];
  editable: boolean | undefined;
};

export const AppliedStateFilters = observer(function AppliedStateFilters(props: Props) {
  const { handleRemove, states, values, editable } = props;

  // Deduplicate applied filter chips by state name.
  // Multiple state IDs that share the same name (from different issue types) are
  // merged into a single chip; removing it clears all of them at once.
  const deduplicatedChips = useMemo(() => {
    const nameToIds = new Map<string, { state: IState; ids: string[] }>();
    for (const stateId of values) {
      const stateDetails = states?.find((s) => s.id === stateId);
      if (!stateDetails) continue;
      const existing = nameToIds.get(stateDetails.name);
      if (existing) {
        existing.ids.push(stateId);
      } else {
        nameToIds.set(stateDetails.name, { state: stateDetails, ids: [stateId] });
      }
    }
    return Array.from(nameToIds.values());
  }, [states, values]);

  return (
    <>
      {deduplicatedChips.map(({ state, ids }) => (
        <div key={state.name} className="flex items-center gap-1 rounded-sm bg-layer-1 p-1 text-11">
          <StateGroupIcon
            color={state.color}
            stateGroup={state.group}
            size={EIconSize.SM}
            percentage={state?.order}
          />
          {state.name}
          {editable && (
            <button
              type="button"
              className="grid place-items-center text-tertiary hover:text-secondary"
              onClick={() => handleRemove(ids.length === 1 ? ids[0] : ids)}
            >
              <CloseIcon height={10} width={10} strokeWidth={2} />
            </button>
          )}
        </div>
      ))}
    </>
  );
});
