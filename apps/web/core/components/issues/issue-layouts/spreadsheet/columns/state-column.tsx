/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// types
import type { TIssue } from "@plane/types";
// components
import { StateDropdown } from "@/components/dropdowns/state/dropdown";
import { StateTransitionAssigneeModal } from "@/components/issues/state-transition-assignee-modal";
import {
  useStateTransitionAssigneeGuard,
  type TStateTransitionUpdatePayload,
} from "@/hooks/store/use-state-transition-assignee-guard";

type Props = {
  issue: TIssue;
  onClose: () => void;
  onChange: (issue: TIssue, data: Partial<TIssue>, updates: any) => void;
  disabled: boolean;
};

export const SpreadsheetStateColumn = observer(function SpreadsheetStateColumn(props: Props) {
  const { issue, onChange, disabled, onClose } = props;
  const { workspaceSlug } = useParams();
  const stateTransitionGuard = useStateTransitionAssigneeGuard(workspaceSlug?.toString(), issue.project_id ?? undefined);

  const submitStateChange = useCallback(
    async (payload: TStateTransitionUpdatePayload) => {
      await onChange(issue, payload, {
        changed_property: "state",
        change_details: payload.state_id,
      });
    },
    [issue, onChange]
  );

  const handleStateChange = useCallback(
    async (stateId: string) => {
      await stateTransitionGuard.requestStateChange(issue, stateId, submitStateChange);
    },
    [issue, stateTransitionGuard, submitStateChange]
  );

  return (
    <>
      <div className="h-11 border-b-[0.5px] border-subtle">
        <StateDropdown
          projectId={issue.project_id ?? undefined}
          issueTypeId={issue.type_id}
          value={issue.state_id}
          onChange={handleStateChange}
          disabled={disabled}
          buttonVariant="transparent-with-text"
          buttonClassName="text-left rounded-none group-[.selected-issue-row]:bg-accent-primary/5 group-[.selected-issue-row]:hover:bg-accent-primary/10 px-page-x"
          buttonContainerClassName="w-full"
          onClose={onClose}
          showTooltip
        />
      </div>
      <StateTransitionAssigneeModal {...stateTransitionGuard.modalProps} />
    </>
  );
});
