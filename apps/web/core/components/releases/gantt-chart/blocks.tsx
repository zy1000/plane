/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Tooltip } from "@plane/propel/tooltip";
import { SIDEBAR_WIDTH } from "@/components/gantt-chart/constants";
import { getBlockViewDetails } from "@/components/issues/issue-layouts/utils";
import { getReleaseStatusDetails } from "@/components/releases/release-status-config";
import { useRelease } from "@/hooks/store/use-release";
import { useAppRouter } from "@/hooks/use-app-router";
import { usePlatformOS } from "@/hooks/use-platform-os";

type Props = {
  releaseId: string;
};

export const ReleaseGanttBlock = observer(function ReleaseGanttBlock(props: Props) {
  const { releaseId } = props;
  const router = useAppRouter();
  const { workspaceSlug } = useParams();
  const { getReleaseById } = useRelease();
  const releaseDetails = getReleaseById(releaseId);
  const { isMobile } = usePlatformOS();
  const releaseStatus = getReleaseStatusDetails(releaseDetails?.status);

  const { message, blockStyle } = getBlockViewDetails(
    releaseDetails,
    releaseStatus.color
  );

  return (
    <Tooltip
      isMobile={isMobile}
      tooltipContent={
        <div className="space-y-1">
          <h5>{releaseDetails?.name}</h5>
          <div>{message}</div>
        </div>
      }
      position="top-start"
    >
      <div
        className="relative flex h-full w-full cursor-pointer items-center rounded-sm"
        style={blockStyle}
        role="presentation"
        onClick={() =>
          router.push(
            `/${workspaceSlug?.toString()}/projects/${releaseDetails?.project_id}/releases/${releaseDetails?.id}/overview`
          )
        }
      >
        <div className="absolute top-0 left-0 h-full w-full bg-surface-1/50" />
        <div
          className="sticky w-auto truncate overflow-hidden px-2.5 py-1 text-13 text-primary"
          style={{ left: `${SIDEBAR_WIDTH}px` }}
        >
          {releaseDetails?.name}
        </div>
      </div>
    </Tooltip>
  );
});

export const ReleaseGanttSidebarBlock = observer(function ReleaseGanttSidebarBlock(props: Props) {
  const { releaseId } = props;
  const { workspaceSlug } = useParams();
  const { getReleaseById } = useRelease();
  const releaseDetails = getReleaseById(releaseId);
  const releaseStatus = getReleaseStatusDetails(releaseDetails?.status);
  const ReleaseStatusIcon = releaseStatus.icon;

  return (
    <Link
      className="relative flex h-full w-full items-center gap-2"
      href={`/${workspaceSlug?.toString()}/projects/${releaseDetails?.project_id}/releases/${releaseDetails?.id}/overview`}
      draggable={false}
    >
      <ReleaseStatusIcon className="h-4 w-4" style={{ color: releaseStatus.color }} />
      <h6 className="flex-grow truncate text-13 font-medium">{releaseDetails?.name}</h6>
    </Link>
  );
});
