/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// hooks
import { ModuleIcon } from "@plane/propel/icons";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// components
import { ActivityChangeFooter, IssueActivityBlockComponent } from "./";
import { activityTruncateLinkClassName } from "./helpers/activity-link-styles";

type TIssueModuleActivity = { activityId: string; ends: "top" | "bottom" | undefined };

const moduleIcon = <ModuleIcon className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />;

export const IssueModuleActivity = observer(function IssueModuleActivity(props: TIssueModuleActivity) {
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
      icon={<ModuleIcon className="h-4 w-4 flex-shrink-0 text-secondary" />}
      activityId={activityId}
      ends={ends}
      footer={
        showFooter ? (
          <ActivityChangeFooter
            from={{ icon: moduleIcon, label: oldLabel, labelEmphasis: "muted" }}
            to={{ icon: moduleIcon, label: newLabel }}
          />
        ) : null
      }
    >
      <>
        {activity.verb === "created" ? (
          <>
            <span>added this work item to the module </span>
            <a
              href={`/${activity.workspace_detail?.slug}/projects/${activity.project}/modules/${activity.new_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className={activityTruncateLinkClassName()}
            >
              <span className="truncate">{activity.new_value}</span>
            </a>
          </>
        ) : activity.verb === "updated" ? (
          <>
            <span>set the module to </span>
            <a
              href={`/${activity.workspace_detail?.slug}/projects/${activity.project}/modules/${activity.new_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className={activityTruncateLinkClassName()}
            >
              <span className="truncate"> {activity.new_value}</span>
            </a>
          </>
        ) : (
          <>
            <span>removed the work item from the module </span>
            <a
              href={`/${activity.workspace_detail?.slug}/projects/${activity.project}/modules/${activity.old_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className={activityTruncateLinkClassName()}
            >
              <span className="truncate"> {activity.old_value}</span>
            </a>
          </>
        )}
      </>
    </IssueActivityBlockComponent>
  );
});
