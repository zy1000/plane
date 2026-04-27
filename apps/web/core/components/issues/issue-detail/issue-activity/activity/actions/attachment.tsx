/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Paperclip } from "lucide-react";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// components
import { ActivityChangeFooter, IssueActivityBlockComponent, IssueLink } from "./";

type TIssueAttachmentActivity = { activityId: string; showIssue?: boolean; ends: "top" | "bottom" | undefined };

const attachmentIcon = <Paperclip className="h-3.5 w-3.5 flex-shrink-0 text-secondary" aria-hidden="true" />;

export const IssueAttachmentActivity = observer(function IssueAttachmentActivity(props: TIssueAttachmentActivity) {
  const { activityId, showIssue = true, ends } = props;
  // hooks
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);

  if (!activity) return <></>;

  const isCreated = activity.verb === "created";
  const oldLabel = isCreated ? "None" : activity.old_value || "None";
  const newLabel = isCreated ? activity.new_value || "None" : "None";
  const showFooter = !!activity.new_value || !!activity.old_value;

  return (
    <IssueActivityBlockComponent
      icon={<Paperclip size={14} className="text-secondary" aria-hidden="true" />}
      activityId={activityId}
      ends={ends}
      footer={
        showFooter ? (
          <ActivityChangeFooter
            from={{ icon: attachmentIcon, label: oldLabel, labelEmphasis: "muted" }}
            to={{ icon: attachmentIcon, label: newLabel }}
          />
        ) : null
      }
    >
      <>
        {isCreated ? `uploaded a new attachment` : `removed an attachment`}
        {showIssue && (isCreated ? ` to ` : ` from `)}
        {showIssue && <IssueLink activityId={activityId} />}.
      </>
    </IssueActivityBlockComponent>
  );
});
