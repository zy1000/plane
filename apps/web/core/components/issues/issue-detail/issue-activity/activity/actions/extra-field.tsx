/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { HashPropertyIcon } from "@plane/propel/icons";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// components
import { ActivityChangeFooter, IssueActivityBlockComponent, IssueLink } from "./";

type TIssueExtraFieldActivity = { activityId: string; showIssue?: boolean; ends: "top" | "bottom" | undefined };

export const IssueExtraFieldActivity = observer(function IssueExtraFieldActivity(props: TIssueExtraFieldActivity) {
  const { activityId, showIssue = true, ends } = props;
  // hooks
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);

  if (!activity) return <></>;

  const fieldName = activity.comment || "custom field";
  const hasOld = !!activity.old_value;
  const hasNew = !!activity.new_value;
  const oldLabel = hasOld ? activity.old_value : "None";
  const newLabel = hasNew ? activity.new_value : "None";
  const showFooter = hasOld || hasNew;

  let actionPhrase: ReactNode;
  if (!hasOld && hasNew) {
    actionPhrase = (
      <>
        set <span className="font-medium text-primary">{fieldName}</span> to{" "}
        <span className="font-medium text-primary">{newLabel}</span>
      </>
    );
  } else if (hasOld && !hasNew) {
    actionPhrase = (
      <>
        cleared <span className="font-medium text-primary">{fieldName}</span> (was{" "}
        <span className="font-medium text-secondary">{oldLabel}</span>)
      </>
    );
  } else {
    actionPhrase = (
      <>
        updated <span className="font-medium text-primary">{fieldName}</span> from{" "}
        <span className="font-medium text-secondary">{oldLabel}</span> to{" "}
        <span className="font-medium text-primary">{newLabel}</span>
      </>
    );
  }

  return (
    <IssueActivityBlockComponent
      icon={<HashPropertyIcon className="h-3.5 w-3.5 text-secondary" aria-hidden="true" />}
      activityId={activityId}
      ends={ends}
      footer={
        showFooter ? (
          <ActivityChangeFooter
            from={{ label: oldLabel, labelEmphasis: "muted" }}
            to={{ label: newLabel }}
          />
        ) : null
      }
    >
      <>
        {actionPhrase}
        {showIssue ? ` for ` : ``}
        {showIssue && <IssueLink activityId={activityId} />}.
      </>
    </IssueActivityBlockComponent>
  );
});
