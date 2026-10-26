/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import Link from "next/link";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

/** 活动流内可点击链接（与项目活动流保持一致） */
const activityLinkClassName = () => "font-medium text-[#1677ff] hover:underline";

type TIssueUser = {
  activityId: string;
  customUserName?: string;
};

export function IssueCreatorDisplay(props: TIssueUser) {
  const { activityId, customUserName } = props;
  // hooks
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityId);

  if (!activity) return <></>;

  return (
    <>
      {customUserName ? (
        <span className="font-medium text-primary">{customUserName || "Plane"}</span>
      ) : (
        <Link
          href={`/${activity?.workspace_detail?.slug}/profile/${activity?.actor_detail?.id}`}
          className={activityLinkClassName()}
        >
          {activity.actor_detail?.display_name}
        </Link>
      )}
    </>
  );
}
