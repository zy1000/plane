/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// store hooks
// icons
import {
  TagIcon,
  CopyPlus,
  Calendar,
  Link2Icon,
  Users2Icon,
  ArchiveIcon,
  PaperclipIcon,
  TriangleIcon,
  LayoutGridIcon,
  SignalMediumIcon,
  MessageSquareIcon,
  FileText,
  UsersIcon,
  ClipboardCheck,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import {
  BlockedIcon,
  BlockerIcon,
  CycleIcon,
  EpicIcon,
  IntakeIcon,
  ModuleIcon,
  RelatedIcon,
  WorkItemsIcon,
} from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { IIssueActivity } from "@plane/types";
import { renderFormattedDate, generateWorkItemLink, capitalizeFirstLetter } from "@plane/utils";
// helpers
import { useLabel } from "@/hooks/store/use-label";
import { usePlatformOS } from "@/hooks/use-platform-os";
// types

export function IssueLink({ activity }: { activity: IIssueActivity }) {
  // router params
  const { workspaceSlug } = useParams();
  const { isMobile } = usePlatformOS();

  const workItemLink = generateWorkItemLink({
    workspaceSlug: workspaceSlug?.toString() ?? activity.workspace_detail?.slug,
    projectId: activity?.project,
    issueId: activity?.issue,
    projectIdentifier: activity?.project_detail?.identifier,
    sequenceId: activity?.issue_detail?.sequence_id,
  });

  return (
    <Tooltip
      tooltipContent={activity?.issue_detail ? activity.issue_detail.name : "This work item has been deleted"}
      isMobile={isMobile}
    >
      {activity?.issue_detail ? (
        <a
          aria-disabled={activity.issue === null}
          href={workItemLink}
          target={activity.issue === null ? "_self" : "_blank"}
          rel={activity.issue === null ? "" : "noopener noreferrer"}
          className="inline items-center gap-1 font-medium text-[#1677ff]"
        >
          <span className="whitespace-nowrap">{`${activity.project_detail.identifier}-${activity.issue_detail.sequence_id}`}</span>{" "}
          <span className="font-regular break-all">{activity.issue_detail?.name}</span>
        </a>
      ) : (
        <span className="inline-flex items-center gap-1 font-medium whitespace-nowrap text-primary">
          {" a work item"}{" "}
        </span>
      )}
    </Tooltip>
  );
}

function UserLink({ activity }: { activity: IIssueActivity }) {
  // router params
  const { workspaceSlug } = useParams();

  return (
    <a
      href={`/${workspaceSlug ?? activity.workspace_detail?.slug}/profile/${
        activity.new_identifier ?? activity.old_identifier
      }`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center font-medium text-[#1677ff]"
    >
      {activity.new_value && activity.new_value !== "" ? activity.new_value : activity.old_value}
    </a>
  );
}

const LabelPill = observer(function LabelPill({ labelId, workspaceSlug }: { labelId: string; workspaceSlug: string }) {
  // store hooks
  const { workspaceLabels, fetchWorkspaceLabels } = useLabel();

  useEffect(() => {
    if (!workspaceLabels) fetchWorkspaceLabels(workspaceSlug);
  }, [fetchWorkspaceLabels, workspaceLabels, workspaceSlug]);

  return (
    <span
      className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
      style={{
        backgroundColor: workspaceLabels?.find((l) => l.id === labelId)?.color ?? "#000000",
      }}
      aria-hidden="true"
    />
  );
});

const inboxActivityMessage = {
  declined: {
    showIssue: "declined work item",
    noIssue: "declined this work item from intake.",
  },
  snoozed: {
    showIssue: "snoozed work item",
    noIssue: "snoozed this work item.",
  },
  accepted: {
    showIssue: "accepted work item",
    noIssue: "accepted this work item from intake.",
  },
  markedDuplicate: {
    showIssue: "declined work item",
    noIssue: "declined this work item from intake by marking a duplicate work item.",
  },
};

const getInboxUserActivityMessage = (activity: IIssueActivity, showIssue: boolean) => {
  switch (activity.verb) {
    case "-1":
      return showIssue ? inboxActivityMessage.declined.showIssue : inboxActivityMessage.declined.noIssue;
    case "0":
      return showIssue ? inboxActivityMessage.snoozed.showIssue : inboxActivityMessage.snoozed.noIssue;
    case "1":
      return showIssue ? inboxActivityMessage.accepted.showIssue : inboxActivityMessage.accepted.noIssue;
    case "2":
      return showIssue ? inboxActivityMessage.markedDuplicate.showIssue : inboxActivityMessage.markedDuplicate.noIssue;
    default:
      return "updated intake work item status.";
  }
};

const activityDetails: {
  [key: string]: {
    message: (activity: IIssueActivity, showIssue: boolean, workspaceSlug: string) => React.ReactNode;
    icon: React.ReactNode | ((activity: IIssueActivity) => React.ReactNode);
  };
} = {
  assignees: {
    message: (activity, showIssue) => {
      if (activity.old_value === "")
        return (
          <>
            added a new assignee <UserLink activity={activity} />
            {showIssue && (
              <>
                {" "}
                to <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            removed the assignee <UserLink activity={activity} />
            {showIssue && (
              <>
                {" "}
                from <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <Users2Icon size={12} className="text-secondary" aria-hidden="true" />,
  },
  archived_at: {
    message: (activity) => {
      if (activity.new_value === "restore")
        return (
          <>
            restored <IssueLink activity={activity} />
          </>
        );
      else
        return (
          <>
            archived <IssueLink activity={activity} />
          </>
        );
    },
    icon: <ArchiveIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  attachment: {
    message: (activity, showIssue) => {
      if (activity.verb === "created")
        return (
          <>
            uploaded a new attachment
            {showIssue && (
              <>
                {" "}
                to <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            removed an attachment
            {showIssue && (
              <>
                {" "}
                from <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <PaperclipIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  description: {
    message: (activity, showIssue) => (
      <>
        updated the description
        {showIssue && (
          <>
            {" "}
            of <IssueLink activity={activity} />
          </>
        )}
      </>
    ),
    icon: <FileText size={12} className="text-secondary" aria-hidden="true" />,
  },
  extra_field: {
    message: (activity, showIssue) => {
      const fieldName = activity.comment || "custom field";
      const hasOld = !!activity.old_value;
      const hasNew = !!activity.new_value;
      const oldLabel = hasOld ? activity.old_value : "None";
      const newLabel = hasNew ? activity.new_value : "None";

      if (!hasOld && hasNew)
        return (
          <>
            set <span className="font-medium text-primary">{fieldName}</span> to{" "}
            <span className="font-medium text-primary">{newLabel}</span>
            {showIssue && (
              <>
                {" "}
                for <IssueLink activity={activity} />
              </>
            )}
          </>
        );

      if (hasOld && !hasNew)
        return (
          <>
            cleared <span className="font-medium text-primary">{fieldName}</span> (was{" "}
            <span className="font-medium text-secondary">{oldLabel}</span>)
            {showIssue && (
              <>
                {" "}
                for <IssueLink activity={activity} />
              </>
            )}
          </>
        );

      return (
        <>
          updated <span className="font-medium text-primary">{fieldName}</span> from{" "}
          <span className="font-medium text-secondary">{oldLabel}</span> to{" "}
          <span className="font-medium text-primary">{newLabel}</span>
          {showIssue && (
            <>
              {" "}
              for <IssueLink activity={activity} />
            </>
          )}
        </>
      );
    },
    icon: <TagIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  estimate_point: {
    message: (activity, showIssue) => {
      if (!activity.new_value)
        return (
          <>
            removed the estimate point
            {showIssue && (
              <>
                {" "}
                from <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            set the estimate point to {activity.new_value}
            {showIssue && (
              <>
                {" "}
                for <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <TriangleIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  issue: {
    message: (activity) => {
      if (activity.verb === "created")
        return (
          <>
            created <IssueLink activity={activity} />
          </>
        );
      else if (activity.verb === "converted")
        return (
          <>
            converted <IssueLink activity={activity} /> to an epic
          </>
        );
      else
        return (
          <>
            deleted <IssueLink activity={activity} />
          </>
        );
    },
    icon: <WorkItemsIcon width={12} height={12} className="text-secondary" aria-hidden="true" />,
  },
  epic: {
    message: (activity) => {
      if (activity.verb === "created")
        return (
          <>
            created <IssueLink activity={activity} />
          </>
        );
      else if (activity.verb === "converted")
        return (
          <>
            converted <IssueLink activity={activity} /> to a work item
          </>
        );
      else
        return (
          <>
            deleted <IssueLink activity={activity} />
          </>
        );
    },
    icon: <EpicIcon width={12} height={12} className="text-secondary" aria-hidden="true" />,
  },
  labels: {
    message: (activity, showIssue, workspaceSlug) => {
      if (activity.old_value === "")
        return (
          <span className="overflow-hidden">
            added a new label{" "}
            <span className="inline-flex items-center gap-2 rounded-full border border-strong px-2 py-0.5 text-11">
              <LabelPill labelId={activity.new_identifier ?? ""} workspaceSlug={workspaceSlug} />
              <span className="line-clamp-1 flex-shrink font-medium break-all text-primary">{activity.new_value}</span>
            </span>
            {showIssue && (
              <span className="">
                {" "}
                to <IssueLink activity={activity} />
              </span>
            )}
          </span>
        );
      else
        return (
          <>
            removed the label{" "}
            <span className="inline-flex items-center gap-2 rounded-full border border-strong px-2 py-0.5 text-11">
              <LabelPill labelId={activity.old_identifier ?? ""} workspaceSlug={workspaceSlug} />
              <span className="line-clamp-1 flex-shrink font-medium break-all text-primary">{activity.old_value}</span>
            </span>
            {showIssue && (
              <span>
                {" "}
                from <IssueLink activity={activity} />
              </span>
            )}
          </>
        );
    },
    icon: <TagIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  link: {
    message: (activity, showIssue) => {
      if (activity.verb === "created")
        return (
          <>
            added this{" "}
            <a
              href={`${activity.new_value}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-[#1677ff]"
            >
              link
            </a>
            {showIssue && (
              <>
                {" "}
                to <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else if (activity.verb === "updated")
        return (
          <>
            updated the{" "}
            <a
              href={`${activity.old_value}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-[#1677ff]"
            >
              link
            </a>
            {showIssue && (
              <>
                {" "}
                from <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            removed this{" "}
            <a
              href={`${activity.old_value}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-[#1677ff]"
            >
              link
            </a>
            {showIssue && (
              <>
                {" "}
                from <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <Link2Icon size={12} className="text-secondary" aria-hidden="true" />,
  },
  cycles: {
    message: (activity, showIssue, workspaceSlug) => {
      if (activity.verb === "created")
        return (
          <>
            <span className="flex-shrink-0">
              added {showIssue ? <IssueLink activity={activity} /> : "this work item"}{" "}
              <span className="whitespace-nowrap">to the cycle</span>{" "}
            </span>
            <a
              href={`/${workspaceSlug}/projects/${activity.project}/cycles/${activity.new_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline items-center gap-1 font-medium text-[#1677ff]"
            >
              <span className="break-all">{activity.new_value}</span>
            </a>
          </>
        );
      else if (activity.verb === "updated")
        return (
          <>
            <span className="flex-shrink-0 whitespace-nowrap">set the cycle to </span>
            <a
              href={`/${workspaceSlug}/projects/${activity.project}/cycles/${activity.new_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline items-center gap-1 font-medium text-[#1677ff]"
            >
              <span className="break-all">{activity.new_value}</span>
            </a>
          </>
        );
      else
        return (
          <>
            removed <IssueLink activity={activity} /> from the cycle{" "}
            <a
              href={`/${workspaceSlug}/projects/${activity.project}/cycles/${activity.old_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline items-center gap-1 font-medium text-[#1677ff]"
            >
              <span className="break-all">{activity.old_value}</span>
            </a>
          </>
        );
    },
    icon: <CycleIcon height={12} width={12} className="text-secondary" aria-hidden="true" />,
  },
  modules: {
    message: (activity, showIssue, workspaceSlug) => {
      if (activity.verb === "created")
        return (
          <>
            added {showIssue ? <IssueLink activity={activity} /> : "this work item"} to the module{" "}
            <a
              href={`/${workspaceSlug}/projects/${activity.project}/modules/${activity.new_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline items-center gap-1 font-medium text-[#1677ff]"
            >
              <span className="break-all">{activity.new_value}</span>
            </a>
          </>
        );
      else if (activity.verb === "updated")
        return (
          <>
            set the module to{" "}
            <a
              href={`/${workspaceSlug}/projects/${activity.project}/modules/${activity.new_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline items-center gap-1 font-medium text-[#1677ff]"
            >
              <span className="break-all">{activity.new_value}</span>
            </a>
          </>
        );
      else
        return (
          <>
            removed <IssueLink activity={activity} /> from the module{" "}
            <a
              href={`/${workspaceSlug}/projects/${activity.project}/modules/${activity.old_identifier}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline items-center gap-1 font-medium text-[#1677ff]"
            >
              <span className="break-all">{activity.old_value}</span>
            </a>
          </>
        );
    },
    icon: <ModuleIcon className="h-3 w-3 !text-secondary" aria-hidden="true" />,
  },
  name: {
    message: (activity, showIssue) => (
      <>
        set the title to <span className="break-all">{activity.new_value}</span>
        {showIssue && (
          <>
            {" "}
            of <IssueLink activity={activity} />
          </>
        )}
      </>
    ),
    icon: <MessageSquareIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  parent: {
    message: (activity, showIssue) => {
      if (!activity.new_value)
        return (
          <>
            removed the parent <span className="font-medium whitespace-nowrap text-primary">{activity.old_value}</span>
            {showIssue && (
              <>
                {" "}
                from <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            set the parent to <span className="font-medium whitespace-nowrap text-primary">{activity.new_value}</span>
            {showIssue && (
              <>
                {" "}
                for <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <UsersIcon className="h-3 w-3 !text-secondary" aria-hidden="true" />,
  },
  priority: {
    message: (activity, showIssue) => (
      <>
        set the priority to{" "}
        <span className="font-medium text-primary">
          {activity.new_value ? capitalizeFirstLetter(activity.new_value) : "None"}
        </span>
        {showIssue && (
          <>
            {" "}
            for <IssueLink activity={activity} />
          </>
        )}
      </>
    ),
    icon: <SignalMediumIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  relates_to: {
    message: (activity, showIssue) => {
      if (activity.old_value === "")
        return (
          <>
            marked that {showIssue ? <IssueLink activity={activity} /> : "this work item"} relates to{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.new_value}</span>.
          </>
        );
      else
        return (
          <>
            removed the relation from{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.old_value}</span>.
          </>
        );
    },
    icon: <RelatedIcon height="12" width="12" className="text-secondary" />,
  },
  blocking: {
    message: (activity, showIssue) => {
      if (activity.old_value === "")
        return (
          <>
            marked {showIssue ? <IssueLink activity={activity} /> : "this work item"} is blocking work item{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.new_value}</span>.
          </>
        );
      else
        return (
          <>
            removed the blocking work item{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.old_value}</span>.
          </>
        );
    },
    icon: <BlockerIcon height="12" width="12" className="text-secondary" />,
  },
  blocked_by: {
    message: (activity, showIssue) => {
      if (activity.old_value === "")
        return (
          <>
            marked {showIssue ? <IssueLink activity={activity} /> : "this work item"} is being blocked by{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.new_value}</span>.
          </>
        );
      else
        return (
          <>
            removed {showIssue ? <IssueLink activity={activity} /> : "this work item"} being blocked by work item{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.old_value}</span>.
          </>
        );
    },
    icon: <BlockedIcon height="12" width="12" className="text-secondary" />,
  },
  duplicate: {
    message: (activity, showIssue) => {
      if (activity.old_value === "")
        return (
          <>
            marked {showIssue ? <IssueLink activity={activity} /> : "this work item"} as duplicate of{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.new_value}</span>.
          </>
        );
      else
        return (
          <>
            removed {showIssue ? <IssueLink activity={activity} /> : "this work item"} as a duplicate of{" "}
            <span className="font-medium whitespace-nowrap text-primary">{activity.old_value}</span>.
          </>
        );
    },
    icon: <CopyPlus size={12} className="text-secondary" />,
  },
  state: {
    message: (activity, showIssue) => (
      <>
        set the state to <span className="font-medium break-all text-primary">{activity.new_value}</span>
        {showIssue && (
          <>
            {" "}
            for <IssueLink activity={activity} />
          </>
        )}
      </>
    ),
    icon: <LayoutGridIcon size={12} className="text-secondary" aria-hidden="true" />,
  },
  start_date: {
    message: (activity, showIssue) => {
      if (!activity.new_value)
        return (
          <>
            removed the start date
            {showIssue && (
              <>
                {" "}
                from <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            set the start date to{" "}
            <span className="font-medium whitespace-nowrap text-primary">
              {renderFormattedDate(activity.new_value)}
            </span>
            {showIssue && (
              <>
                {" "}
                for <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <Calendar size={12} className="text-secondary" aria-hidden="true" />,
  },
  target_date: {
    message: (activity, showIssue) => {
      if (!activity.new_value)
        return (
          <>
            removed the due date
            {showIssue && (
              <>
                {" "}
                from <IssueLink activity={activity} />
              </>
            )}
          </>
        );
      else
        return (
          <>
            set the due date to{" "}
            <span className="font-medium whitespace-nowrap text-primary">
              {renderFormattedDate(activity.new_value)}
            </span>
            {showIssue && (
              <>
                {" "}
                for <IssueLink activity={activity} />
              </>
            )}
          </>
        );
    },
    icon: <Calendar size={12} className="text-secondary" aria-hidden="true" />,
  },
  inbox: {
    message: (activity, showIssue) => (
      <>
        {getInboxUserActivityMessage(activity, showIssue)}
        {showIssue && (
          <>
            {" "}
            <IssueLink activity={activity} />
          </>
        )}
        {activity.verb === "2" && ` from intake by marking a duplicate work item.`}
      </>
    ),
    icon: <IntakeIcon className="size-3 text-secondary" aria-hidden="true" />,
  },
  workflow_approval_request: {
    message: (activity, showIssue) => {
      const isRejected = activity.verb === "updated" && activity.new_value === "rejected";
      const isCancelled = activity.verb === "updated" && activity.new_value === "cancelled";
      const fromName = activity.old_value || "None";
      const toName =
        activity.new_value && !["rejected", "cancelled"].includes(activity.new_value)
          ? activity.new_value
          : undefined;

      return (
        <>
          {isRejected ? (
            <>closed the state change approval request as rejected</>
          ) : isCancelled ? (
            <>cancelled the pending state change approval request</>
          ) : (
            <>
              requested approval to change the state from{" "}
              <span className="font-medium break-all text-primary">{fromName}</span>
              {" to "}
              <span className="font-medium break-all text-primary">{toName || "None"}</span>
            </>
          )}
          {showIssue && (
            <>
              {" "}
              for <IssueLink activity={activity} />
            </>
          )}
        </>
      );
    },
    icon: (activity) => {
      const isRejected = activity.verb === "updated" && activity.new_value === "rejected";
      const isCancelled = activity.verb === "updated" && activity.new_value === "cancelled";

      if (isRejected)
        return <XCircle size={12} className="text-red-500" aria-hidden="true" />;
      if (isCancelled)
        return <XCircle size={12} className="text-secondary" aria-hidden="true" />;
      return <ClipboardCheck size={12} className="text-secondary" aria-hidden="true" />;
    },
  },
  workflow_approval_action: {
    message: (activity, showIssue) => {
      const approved = activity.new_value === "approved";

      return (
        <>
          {approved ? "approved" : "rejected"} the state change approval request
          {showIssue && (
            <>
              {" "}
              for <IssueLink activity={activity} />
            </>
          )}
        </>
      );
    },
    icon: (activity) =>
      activity.new_value === "approved" ? (
        <CheckCircle2 size={12} className="text-emerald-500" aria-hidden="true" />
      ) : (
        <XCircle size={12} className="text-red-500" aria-hidden="true" />
      ),
  },
};

export function ActivityIcon({ activity }: { activity: IIssueActivity }) {
  const activityConfig = activityDetails[activity.field as keyof typeof activityDetails];
  const icon = activityConfig?.icon;

  return (
    <>
      {icon ? (
        typeof icon === "function" ? (
          icon(activity)
        ) : (
          icon
        )
      ) : (
        <WorkItemsIcon width={12} height={12} className="text-secondary" aria-hidden="true" />
      )}
    </>
  );
}

type ActivityMessageProps = {
  activity: IIssueActivity;
  showIssue?: boolean;
};

export function ActivityMessage({ activity, showIssue = false }: ActivityMessageProps) {
  // router params
  const { workspaceSlug } = useParams();
  const activityField = activity.field ?? "issue";
  const activityConfig = activityDetails[activityField as keyof typeof activityDetails];

  return (
    <>
      {activityConfig
        ? activityConfig.message(
            activity,
            showIssue,
            workspaceSlug ? workspaceSlug.toString() : (activity.workspace_detail?.slug ?? "")
          )
        : activity.comment || null}
    </>
  );
}
