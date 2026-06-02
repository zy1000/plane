/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import useSWR from "swr";
import {
  Activity as ActivityIcon,
  CalendarDays,
  CheckCircle2,
  FileText,
  Layers,
  MessageSquareIcon,
  Paperclip,
  Tag,
  Trash2,
  UserCog,
} from "lucide-react";
import { E_SORT_ORDER } from "@plane/constants";
import type { TCycleActivity } from "@plane/types";
import { Loader, Tooltip } from "@plane/ui";
import { calculateTimeAgo } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import { useCycleActivity } from "@/hooks/store/use-cycle-activity";
import { useUser } from "@/hooks/store/user";
import { buildCycleActivityMessage } from "./cycle-activity-message";

type Props = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
  emptyHint?: string;
  limit?: number;
  filterFn?: (activity: TCycleActivity) => boolean;
  sortOrder?: E_SORT_ORDER;
};

const iconForActivity = (activity: TCycleActivity): React.ReactNode => {
  const { field, verb } = activity;
  if (verb === "deleted" || verb === "closed") return <Trash2 size={12} aria-hidden />;
  switch (field) {
    case "comment":
      return <MessageSquareIcon size={12} aria-hidden />;
    case "status":
      return <CheckCircle2 size={12} aria-hidden />;
    case "owned_by":
    case "owned_by_id":
      return <UserCog size={12} aria-hidden />;
    case "start_date":
    case "end_date":
      return <CalendarDays size={12} aria-hidden />;
    case "attachment":
      return <Paperclip size={12} aria-hidden />;
    case "cycle_issue":
      return <Layers size={12} aria-hidden />;
    case "overdue":
      return <Tag size={12} aria-hidden />;
    case "cycle":
    case "description":
    case "suggested_test_scope":
      return <FileText size={12} aria-hidden />;
    default:
      return <ActivityIcon size={12} aria-hidden />;
  }
};

const CycleActivityRow = observer(function CycleActivityRow(props: {
  activity: TCycleActivity;
  workspaceSlug: string;
}) {
  const { activity, workspaceSlug } = props;
  const { getUserDetails } = useMember();
  const { data: currentUser } = useUser();

  const actorDetail = activity.actor ? getUserDetails(activity.actor) : undefined;
  const isSystem = !activity.actor;
  const isCurrentUser = !!currentUser && currentUser.id === activity.actor;
  const displayName = isSystem
    ? "系统"
    : isCurrentUser
      ? "You"
      : (actorDetail?.display_name ?? activity.actor_detail?.display_name ?? "未知用户");

  const message = buildCycleActivityMessage(activity);

  return (
    <li>
      <div className="relative flex items-center gap-3 py-2 text-caption-sm-regular">
        <div className="absolute top-0 bottom-0 left-[13px] w-px bg-layer-3" aria-hidden />
        <div className="z-[4] flex h-7 w-7 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-subtle bg-layer-2 text-secondary shadow-raised-100 [&_svg]:!text-secondary">
          {iconForActivity(activity)}
        </div>
        <div className="min-w-0 flex-1 text-secondary">
          <div className="flex min-w-0 items-baseline gap-1">
            {isSystem || isCurrentUser || !actorDetail ? (
              <span className="flex-shrink-0 font-medium text-secondary">{displayName}</span>
            ) : (
              <Link
                href={`/${workspaceSlug}/profile/${activity.actor}`}
                className="flex-shrink-0 font-medium text-[#1677ff]"
              >
                {displayName}
              </Link>
            )}
            <Tooltip tooltipContent={message} position="top">
              <span className="min-w-0 flex-1 truncate">{message}</span>
            </Tooltip>
            <span className="flex-shrink-0 whitespace-nowrap text-tertiary">{calculateTimeAgo(activity.created_at)}</span>
          </div>
        </div>
      </div>
    </li>
  );
});

export const CycleActivityFeed = observer(function CycleActivityFeed(props: Props) {
  const { workspaceSlug, projectId, cycleId, emptyHint = "暂无动态", limit, filterFn, sortOrder } = props;
  const { getActivitiesByCycleId, isLoadingByCycleId, fetchActivities } = useCycleActivity();
  const rawActivities = getActivitiesByCycleId(cycleId);
  const allActivities = filterFn ? rawActivities.filter(filterFn) : rawActivities;
  const activities =
    typeof limit === "number" && limit >= 0
      ? limit > 0
        ? allActivities.slice(-limit).reverse()
        : []
      : sortOrder === E_SORT_ORDER.DESC
        ? [...allActivities].reverse()
        : allActivities;
  const isLoading = isLoadingByCycleId(cycleId);

  useSWR(
    workspaceSlug && projectId && cycleId
      ? ["cycle-activities", workspaceSlug, projectId, cycleId]
      : null,
    () => fetchActivities(workspaceSlug, projectId, cycleId)
  );

  useEffect(() => {
    if (workspaceSlug && projectId && cycleId) {
      void fetchActivities(workspaceSlug, projectId, cycleId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, projectId, cycleId]);

  if (isLoading && activities.length === 0) {
    return (
      <Loader className="space-y-3">
        <Loader.Item height="36px" />
        <Loader.Item height="36px" />
        <Loader.Item height="36px" />
      </Loader>
    );
  }

  if (activities.length === 0) {
    return <div className="grid h-full place-items-center text-sm text-placeholder">{emptyHint}</div>;
  }

  return (
    <ul role="list" className="relative">
      {activities.map((activity) => (
        <CycleActivityRow
          key={activity.id}
          activity={activity}
          workspaceSlug={workspaceSlug}
        />
      ))}
    </ul>
  );
});
