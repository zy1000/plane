/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// Plane-web
import { getRelationActivityContent, useTimeLineRelationOptions } from "@/plane-web/components/relations";
import type { TIssueRelationTypes } from "@/plane-web/types";
//
import { ActivityChangeFooter, IssueActivityBlockComponent } from "./";

type TIssueRelationActivity = { activityId: string; ends: "top" | "bottom" | undefined };

export const IssueRelationActivity = observer(function IssueRelationActivity(props: TIssueRelationActivity) {
  const { activityId, ends } = props;
  // hooks
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);
  const ISSUE_RELATION_OPTIONS = useTimeLineRelationOptions();
  const activityContent = getRelationActivityContent(activity);

  if (!activity) return <></>;

  const relationOption = activity.field
    ? ISSUE_RELATION_OPTIONS[activity.field as TIssueRelationTypes]
    : undefined;
  const headerIcon = relationOption ? relationOption.icon(14) : null;
  const footerIcon = relationOption ? relationOption.icon(14) : null;

  const oldLabel = activity.old_value || "None";
  const newLabel = activity.new_value || "None";
  const showFooter = !!(activity.old_value || activity.new_value);

  return (
    <IssueActivityBlockComponent
      icon={headerIcon ?? <></>}
      activityId={activityId}
      ends={ends}
      footer={
        showFooter ? (
          <ActivityChangeFooter
            from={{ icon: footerIcon, label: oldLabel, labelEmphasis: "muted" }}
            to={{ icon: footerIcon, label: newLabel }}
          />
        ) : null
      }
    >
      {activityContent}
      {activity.old_value === "" ? (
        <span className="font-medium text-primary">{activity.new_value}.</span>
      ) : (
        <span className="font-medium text-primary">{activity.old_value}.</span>
      )}
    </IssueActivityBlockComponent>
  );
});
