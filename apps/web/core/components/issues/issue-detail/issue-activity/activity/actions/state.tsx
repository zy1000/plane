/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { StateGroupIcon, StatePropertyIcon } from "@plane/propel/icons";
import type { IState } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProjectState } from "@/hooks/store/use-project-state";
// components
import { ActivityChangeFooter, IssueActivityBlockComponent, IssueLink } from "./";

type TIssueStateActivity = { activityId: string; showIssue?: boolean; ends: "top" | "bottom" | undefined };

const stateIcon = (state: IState | undefined) => (
  <StateGroupIcon stateGroup={state?.group ?? "backlog"} color={state?.color} className="h-3.5 w-3.5 flex-shrink-0" />
);

export const IssueStateActivity = observer(function IssueStateActivity(props: TIssueStateActivity) {
  const { activityId, showIssue = true, ends } = props;
  // hooks
  const {
    activity: { getActivityById },
  } = useIssueDetail();
  const { getStateById } = useProjectState();

  const activity = getActivityById(activityId);

  if (!activity) return <></>;

  const oldState = activity.old_identifier ? getStateById(activity.old_identifier) : undefined;
  const newState = activity.new_identifier ? getStateById(activity.new_identifier) : undefined;

  const oldName = oldState?.name ?? activity.old_value ?? "None";
  const newName = newState?.name ?? activity.new_value ?? "None";
  const showFooter = !!(activity.old_value || activity.new_value);

  return (
    <IssueActivityBlockComponent
      icon={<StatePropertyIcon className="h-4 w-4 flex-shrink-0 text-secondary" />}
      activityId={activityId}
      ends={ends}
      footer={
        showFooter ? (
          <ActivityChangeFooter
            from={{ icon: stateIcon(oldState), label: oldName }}
            to={{ icon: stateIcon(newState), label: newName }}
          />
        ) : null
      }
    >
      <>
        set the state to <span className="font-medium text-primary">{activity.new_value}</span>
        {showIssue ? ` for ` : ``}
        {showIssue && <IssueLink activityId={activityId} />}.
      </>
    </IssueActivityBlockComponent>
  );
});
