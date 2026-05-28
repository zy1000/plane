/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import React, { useRef } from "react";
import { observer } from "mobx-react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import { CheckIcon } from "@plane/propel/icons";
import { CircularProgressIndicator } from "@plane/ui";
import { generateQueryParams } from "@plane/utils";
import { ListItem } from "@/components/core/list";
import { ReleaseListItemAction } from "@/components/releases/release-list-item-action";
import { ReleaseOverdueTags } from "@/components/releases/release-overdue-tags";
import { ReleaseQuickActions } from "@/components/releases/release-quick-actions";
import {
  getReleaseOverdueToneTextClass,
  getReleaseRowTone,
} from "@/components/releases/release-status-config";
import type { ReleaseDetailTabKey } from "@/components/releases/release-overview";
import { DEFAULT_RELEASE_DETAIL_TAB, getReleaseDetailTabStorageKey } from "@/components/releases/release-overview";
import { useRelease } from "@/hooks/store/use-release";
import { useAppRouter } from "@/hooks/use-app-router";
import useLocalStorage from "@/hooks/use-local-storage";
import { usePlatformOS } from "@/hooks/use-platform-os";

type Props = {
  releaseId: string;
};

export const ReleaseListItem = observer(function ReleaseListItem(props: Props) {
  const { releaseId } = props;
  const parentRef = useRef(null);
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { getReleaseById } = useRelease();
  const { isMobile } = usePlatformOS();
  const { setValue: setReleaseDetailTab } = useLocalStorage<ReleaseDetailTabKey>(
    getReleaseDetailTabStorageKey(releaseId),
    DEFAULT_RELEASE_DETAIL_TAB
  );

  const releaseDetails = getReleaseById(releaseId);

  if (!releaseDetails) return null;

  const completionPercentage =
    ((releaseDetails.completed_issues + releaseDetails.cancelled_issues) / releaseDetails.total_issues) * 100;
  const progress = isNaN(completionPercentage) ? 0 : Math.floor(completionPercentage);
  const completedCheck = releaseDetails.status === "completed";

  const openPeek = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const query = generateQueryParams(searchParams, ["peekRelease"]);
    if (searchParams.has("peekRelease") && searchParams.get("peekRelease") === releaseId) {
      router.push(`${pathname}?${query}`);
    } else {
      router.push(`${pathname}?${query && `${query}&`}peekRelease=${releaseId}`);
    }
  };

  const releaseOverviewPath = `/${workspaceSlug?.toString()}/projects/${releaseDetails.project_id}/releases/${releaseDetails.id}/overview`;

  const handleItemClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (releaseDetails.archived_at) {
      openPeek(e);
      return;
    }
    setReleaseDetailTab(DEFAULT_RELEASE_DETAIL_TAB);
    router.push(releaseOverviewPath);
  };

  const overdueTone = getReleaseRowTone(releaseDetails);

  return (
    <ListItem
      title={releaseDetails?.name ?? ""}
      titleClassName={getReleaseOverdueToneTextClass(overdueTone)}
      itemLink={releaseOverviewPath}
      onItemClick={handleItemClick}
      prependTitleElement={
        <CircularProgressIndicator size={32} percentage={progress} strokeWidth={4}>
          {completedCheck ? (
            progress === 100 ? (
              <CheckIcon className="h-3 w-3 stroke-[2] text-accent-primary" />
            ) : (
              <span className="text-13 text-accent-primary">{`!`}</span>
            )
          ) : progress === 100 ? (
            <CheckIcon className="h-3 w-3 stroke-[2] text-accent-primary" />
          ) : (
            <span className="text-10 font-medium tabular-nums leading-none text-primary">{`${progress}%`}</span>
          )}
        </CircularProgressIndicator>
      }
      appendTitleElement={
        <span className="flex items-center gap-2">
          <ReleaseOverdueTags
            releaseDetails={releaseDetails}
            workspaceSlug={workspaceSlug.toString()}
            projectId={releaseDetails.project_id}
          />
          <button
            type="button"
            onClick={openPeek}
            className={`z-[5] flex-shrink-0 ${isMobile ? "flex" : "hidden group-hover:flex"}`}
          >
            <Info className="h-4 w-4 text-placeholder" />
          </button>
        </span>
      }
      actionableItems={
        <ReleaseListItemAction releaseId={releaseId} releaseDetails={releaseDetails} parentRef={parentRef} />
      }
      quickActionElement={
        <div className="block md:hidden">
          <ReleaseQuickActions
            parentRef={parentRef}
            releaseId={releaseId}
            projectId={projectId.toString()}
            workspaceSlug={workspaceSlug.toString()}
          />
        </div>
      }
      isMobile={isMobile}
      parentRef={parentRef}
    />
  );
});
