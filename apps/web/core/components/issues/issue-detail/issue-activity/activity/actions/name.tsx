/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Type } from "lucide-react";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// components
import { ActivityChangeFooter, IssueActivityBlockComponent } from "./";

type TIssueNameActivity = { activityId: string; ends: "top" | "bottom" | undefined };

const nameIcon = <Type className="h-3.5 w-3.5 flex-shrink-0 text-secondary" aria-hidden="true" />;

export const IssueNameActivity = observer(function IssueNameActivity(props: TIssueNameActivity) {
  const { activityId, ends } = props;
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
      icon={<Type size={14} className="text-secondary" aria-hidden="true" />}
      activityId={activityId}
      ends={ends}
      footer={
        showFooter ? (
          <ActivityChangeFooter
            from={{ icon: nameIcon, label: oldLabel, labelEmphasis: "muted" }}
            to={{ icon: nameIcon, label: newLabel }}
          />
        ) : null
      }
    >
      <>set the name to {activity.new_value}.</>
    </IssueActivityBlockComponent>
  );
});
