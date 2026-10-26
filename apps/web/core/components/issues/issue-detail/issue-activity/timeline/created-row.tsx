"use client";

import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import type { TIssueActivity } from "@plane/types";
import { EInboxIssueSource } from "@plane/types";
import { capitalizeFirstLetter } from "@plane/utils";
import { InitialValues } from "./edit-row";
import { ActivityTime, ActorName, AvatarNode, TimelineRow } from "./timeline-primitives";

/** 创建节点：头像坐轨道 + 「创建了工作项」，创建时一起填的属性挂在下面一行 */
export const ActivityCreatedRow = observer(function ActivityCreatedRow({
  activity,
  initial,
  isFirst,
  isLast,
  workspaceSlug,
}: {
  activity: TIssueActivity;
  initial: TIssueActivity[];
  isFirst: boolean;
  isLast: boolean;
  workspaceSlug: string;
}) {
  const { t } = useTranslation();
  const source = activity.source_data?.source;
  const viaSource = source && source !== EInboxIssueSource.IN_APP;
  const name = activity.actor_detail?.display_name ?? "";

  return (
    <TimelineRow node={<AvatarNode name={name} src={activity.actor_detail?.avatar_url} />} isFirst={isFirst} isLast={isLast}>
      <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 text-14 text-secondary">
        <ActorName name={name} userId={activity.actor_detail?.id ?? activity.actor} workspaceSlug={workspaceSlug} />
        <span>
          {viaSource
            ? t("issue_activity.created_via", { source: capitalizeFirstLetter(source.toLowerCase()) })
            : t("issue_activity.created")}
        </span>
        <ActivityTime value={activity.created_at} />
      </div>
      <InitialValues activities={initial} />
    </TimelineRow>
  );
});
