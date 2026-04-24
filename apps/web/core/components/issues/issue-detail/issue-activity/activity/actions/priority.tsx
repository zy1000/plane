/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { PriorityIcon, PriorityPropertyIcon } from "@plane/propel/icons";
import type { TIssuePriorities } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// components
import { ActivityChangeFooter, IssueActivityBlockComponent, IssueLink } from "./";

type TIssuePriorityActivity = { activityId: string; showIssue?: boolean; ends: "top" | "bottom" | undefined };

const PRIORITY_VALUES: TIssuePriorities[] = ["urgent", "high", "medium", "low", "none"];

const toPriority = (value: string | null | undefined): TIssuePriorities => {
  const normalized = (value ?? "none").toLowerCase() as TIssuePriorities;
  return PRIORITY_VALUES.includes(normalized) ? normalized : "none";
};

const priorityIcon = (value: string | null | undefined) => (
  <PriorityIcon priority={toPriority(value)} size={14} className="flex-shrink-0" />
);

export const IssuePriorityActivity = observer(function IssuePriorityActivity(props: TIssuePriorityActivity) {
  const { activityId, showIssue = true, ends } = props;
  // hooks
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);

  if (!activity) return <></>;

  const oldLabel = activity.old_value || "None";
  const newLabel = activity.new_value || "None";
  const showFooter = !!(activity.old_value || activity.new_value);

  return (
    <IssueActivityBlockComponent
      icon={<PriorityPropertyIcon className="h-3.5 w-3.5 text-secondary" aria-hidden="true" />}
      activityId={activityId}
      ends={ends}
      footer={
        showFooter ? (
          <ActivityChangeFooter
            from={{ icon: priorityIcon(activity.old_value), label: oldLabel }}
            to={{ icon: priorityIcon(activity.new_value), label: newLabel }}
          />
        ) : null
      }
    >
      <>
        set the priority to <span className="font-medium text-primary">{activity.new_value}</span>
        {showIssue ? ` for ` : ``}
        {showIssue && <IssueLink activityId={activityId} />}.
      </>
    </IssueActivityBlockComponent>
  );
});
