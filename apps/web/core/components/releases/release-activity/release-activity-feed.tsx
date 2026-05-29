/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import useSWR from "swr";
import {
  Activity as ActivityIcon,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileText,
  Layers,
  MessageSquareIcon,
  Paperclip,
  Repeat,
  Tag,
  Trash2,
  UserCog,
} from "lucide-react";
import { E_SORT_ORDER } from "@plane/constants";
import type { TReleaseActivity, TReleaseStatus } from "@plane/types";
import { Loader, Tooltip } from "@plane/ui";
import { calculateTimeAgo } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import { useReleaseActivity } from "@/hooks/store/use-release-activity";
import { useUser } from "@/hooks/store/user";
import { normalizeReleaseStatusValue } from "../release-status-config";
import { ReleaseStatusReasonViewModal } from "../release-status-reason-view-modal";
import { buildReleaseActivityMessage } from "./release-activity-message";

type Props = {
  workspaceSlug: string;
  projectId: string;
  releaseId: string;
  emptyHint?: string;
  /** 仅展示最近 N 条动态。未传时显示全部。 */
  limit?: number;
  /** 过滤动态记录。返回 true 的记录会被展示。未传时展示全部。 */
  filterFn?: (activity: TReleaseActivity) => boolean;
  /** 排序方向。store 内按时间升序存放，desc 时倒序展示（最新在最上）。未传时升序。 */
  sortOrder?: E_SORT_ORDER;
};

const iconForActivity = (activity: TReleaseActivity): React.ReactNode => {
  const { field, verb } = activity;
  if (verb === "deleted" || verb === "closed") return <Trash2 size={12} aria-hidden />;
  switch (field) {
    case "comment":
      return <MessageSquareIcon size={12} aria-hidden />;
    case "status":
      return <CheckCircle2 size={12} aria-hidden />;
    case "lead":
    case "lead_id":
      return <UserCog size={12} aria-hidden />;
    case "start_date":
    case "target_date":
    case "test_handoff_date":
      return <CalendarDays size={12} aria-hidden />;
    case "attachment":
      return <Paperclip size={12} aria-hidden />;
    case "release_issue":
      return <Layers size={12} aria-hidden />;
    case "release_plan":
      return <ClipboardList size={12} aria-hidden />;
    case "release_cycle":
      return <Repeat size={12} aria-hidden />;
    case "overdue":
      return <Tag size={12} aria-hidden />;
    case "release":
      return <FileText size={12} aria-hidden />;
    case "note":
      return <FileText size={12} aria-hidden />;
    default:
      return <ActivityIcon size={12} aria-hidden />;
  }
};

const ReleaseActivityRow = observer(function ReleaseActivityRow(props: {
  activity: TReleaseActivity;
  workspaceSlug: string;
  onViewReason: (reason: string, status: TReleaseStatus | null) => void;
}) {
  const { activity, workspaceSlug, onViewReason } = props;
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

  const message = buildReleaseActivityMessage(activity);
  const reason = activity.field === "status" ? activity.extra?.reason : undefined;
  const nextStatus = activity.field === "status" ? normalizeReleaseStatusValue(activity.new_value ?? undefined) : null;

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
          {reason && (
            <button
              type="button"
              onClick={() => onViewReason(reason, nextStatus)}
              className="mt-0.5 block w-full cursor-pointer break-words text-left text-[#69b1ff] hover:text-[#1677ff] hover:underline"
            >
              原因：{reason}
            </button>
          )}
        </div>
      </div>
    </li>
  );
});

export const ReleaseActivityFeed = observer(function ReleaseActivityFeed(props: Props) {
  const { workspaceSlug, projectId, releaseId, emptyHint = "暂无动态", limit, filterFn, sortOrder } = props;
  const { getActivitiesByReleaseId, isLoadingByReleaseId, fetchActivities } = useReleaseActivity();
  const rawActivities = getActivitiesByReleaseId(releaseId);
  const allActivities = filterFn ? rawActivities.filter(filterFn) : rawActivities;
  // store 内按 created_at 升序存放。概览的“最近动态”传入 limit 时，应取时间最新的 N 条
  // （包含评论、状态、附件等所有类型），并倒序展示（最新在最上）。
  const activities =
    typeof limit === "number" && limit >= 0
      ? limit > 0
        ? allActivities.slice(-limit).reverse()
        : []
      : sortOrder === E_SORT_ORDER.DESC
        ? [...allActivities].reverse()
        : allActivities;
  const isLoading = isLoadingByReleaseId(releaseId);

  const [reasonModal, setReasonModal] = useState<{
    reason: string;
    status: TReleaseStatus | null;
  } | null>(null);

  useSWR(
    workspaceSlug && projectId && releaseId
      ? ["release-activities", workspaceSlug, projectId, releaseId]
      : null,
    () => fetchActivities(workspaceSlug, projectId, releaseId)
  );

  useEffect(() => {
    if (workspaceSlug && projectId && releaseId) {
      void fetchActivities(workspaceSlug, projectId, releaseId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, projectId, releaseId]);

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
    <>
      <ul role="list" className="relative">
        {activities.map((activity) => (
          <ReleaseActivityRow
            key={activity.id}
            activity={activity}
            workspaceSlug={workspaceSlug}
            onViewReason={(reason, status) => setReasonModal({ reason, status })}
          />
        ))}
      </ul>
      <ReleaseStatusReasonViewModal
        open={reasonModal !== null}
        reason={reasonModal?.reason ?? ""}
        status={reasonModal?.status ?? null}
        onClose={() => setReasonModal(null)}
      />
    </>
  );
});
