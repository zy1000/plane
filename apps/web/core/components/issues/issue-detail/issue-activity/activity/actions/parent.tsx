/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { ParentPropertyIcon } from "@plane/propel/icons";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// components
import { ActivityChangeFooter, IssueActivityBlockComponent, IssueLink } from "./";

type TIssueParentActivity = { activityId: string; showIssue?: boolean; ends: "top" | "bottom" | undefined };

const parentIcon = <ParentPropertyIcon className="h-3.5 w-3.5 text-secondary" aria-hidden="true" />;

export const IssueParentActivity = observer(function IssueParentActivity(props: TIssueParentActivity) {
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
      icon={parentIcon}
      activityId={activityId}
      ends={ends}
      footer={
        showFooter ? (
          <ActivityChangeFooter
            from={{ icon: parentIcon, label: oldLabel, labelEmphasis: "muted" }}
            to={{ icon: parentIcon, label: newLabel }}
          />
        ) : null
      }
    >
      <>
        {activity.new_value ? `set the parent to ` : `removed the parent `}
        {activity.new_value ? (
          <span className="font-medium text-primary">{activity.new_value}</span>
        ) : (
          <span className="font-medium text-primary">{activity.old_value}</span>
        )}
        {showIssue && (activity.new_value ? ` for ` : ` from `)}
        {showIssue && <IssueLink activityId={activityId} />}.
      </>
    </IssueActivityBlockComponent>
  );
});
