/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { SyntheticEvent } from "react";
import React, { useRef } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { Info, SquareUser } from "lucide-react";
import {
  PROGRESS_STATE_GROUPS_DETAILS,
  EUserPermissions,
  EUserPermissionsLevel,
  IS_FAVORITE_MENU_OPEN,
} from "@plane/constants";
import { useLocalStorage } from "@plane/hooks";
import { WorkItemsIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setPromiseToast, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { IRelease } from "@plane/types";
import { Card, FavoriteStar, LinearProgressIndicator } from "@plane/ui";
import { cn, getDate, renderFormattedPayloadDate, generateQueryParams } from "@plane/utils";
import { DateRangeDropdown } from "@/components/dropdowns/date-range";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { DEFAULT_RELEASE_DETAIL_TAB, getReleaseDetailTabStorageKey } from "@/components/releases/release-overview";
import { ReleaseOverdueTags } from "@/components/releases/release-overdue-tags";
import { ReleaseQuickActions } from "@/components/releases/release-quick-actions";
import {
  getReleaseOverdueToneTextClass,
  getReleaseRowTone,
} from "@/components/releases/release-status-config";
import { ReleaseStatusDropdown } from "@/components/releases/release-status-dropdown";
import { formatReleaseUpdateError } from "@/components/releases/use-release-error-message";
import { useMember } from "@/hooks/store/use-member";
import { useRelease } from "@/hooks/store/use-release";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { setValueIntoLocalStorage } from "@/hooks/use-local-storage";
import { usePlatformOS } from "@/hooks/use-platform-os";

type Props = {
  releaseId: string;
};

export const ReleaseCardItem = observer(function ReleaseCardItem(props: Props) {
  const { releaseId } = props;
  const parentRef = useRef(null);
  const router = useAppRouter();
  const { workspaceSlug, projectId } = useParams();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { allowPermissions } = useUserPermissions();
  const { getReleaseById, addReleaseToFavorites, removeReleaseFromFavorites, updateReleaseDetails } = useRelease();
  const { getUserDetails } = useMember();
  const { setValue: toggleFavoriteMenu, storedValue } = useLocalStorage<boolean>(IS_FAVORITE_MENU_OPEN, false);
  const releaseDetails = getReleaseById(releaseId);
  const isEditingAllowed = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );
  const isDisabled = !isEditingAllowed || !!releaseDetails?.archived_at;
  const renderIcon = Boolean(releaseDetails?.start_date) || Boolean(releaseDetails?.target_date);
  const { isMobile } = usePlatformOS();

  const handleAddToFavorites = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (!workspaceSlug || !projectId) return;

    const p = addReleaseToFavorites(workspaceSlug.toString(), projectId.toString(), releaseId).then(() => {
      if (!storedValue) toggleFavoriteMenu(true);
    });

    setPromiseToast(p, {
      loading: "Adding release to favorites...",
      success: {
        title: "Success!",
        message: () => "Release added to favorites.",
      },
      error: {
        title: "Error!",
        message: () => "Couldn't add the release to favorites. Please try again.",
      },
    });
  };

  const handleRemoveFromFavorites = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (!workspaceSlug || !projectId) return;

    const p = removeReleaseFromFavorites(workspaceSlug.toString(), projectId.toString(), releaseId);

    setPromiseToast(p, {
      loading: "Removing release from favorites...",
      success: {
        title: "Success!",
        message: () => "Release removed from favorites.",
      },
      error: {
        title: "Error!",
        message: () => "Couldn't remove the release from favorites. Please try again.",
      },
    });
  };

  const handleEventPropagation = (e: SyntheticEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const handleReleaseDetailsChange = async (payload: Partial<IRelease> & { status_change_reason?: string }) => {
    if (!workspaceSlug || !projectId) return;

    await updateReleaseDetails(workspaceSlug.toString(), projectId.toString(), releaseId, payload)
      .then(() => {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Success!",
          message: "Release updated successfully.",
        });
      })
      .catch((err) => {
        const { title, message } = formatReleaseUpdateError(err);
        setToast({
          type: TOAST_TYPE.ERROR,
          title,
          message,
        });
      });
  };

  const openPeek = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const query = generateQueryParams(searchParams, ["peekRelease"]);
    if (searchParams.has("peekRelease") && searchParams.get("peekRelease") === releaseId) {
      router.push(`${pathname}?${query}`);
    } else {
      router.push(`${pathname}?${query && `${query}&`}peekRelease=${releaseId}`);
    }
  };

  if (!releaseDetails) return null;

  const totalIssues =
    releaseDetails.backlog_issues +
    releaseDetails.unstarted_issues +
    releaseDetails.started_issues +
    releaseDetails.completed_issues +
    releaseDetails.cancelled_issues;

  const completedIssues = releaseDetails.completed_issues;
  const issueCount = !totalIssues || totalIssues === 0
    ? `0 work items`
    : totalIssues === completedIssues
      ? `${totalIssues} Work item${totalIssues > 1 ? `s` : ``}`
      : `${completedIssues}/${totalIssues} Work items`;

  const leadDetails = releaseDetails.lead_id ? getUserDetails(releaseDetails.lead_id) : undefined;

  const progressIndicatorData = PROGRESS_STATE_GROUPS_DETAILS.map((group, index) => ({
    id: index,
    name: group.title,
    value: totalIssues > 0 ? (releaseDetails[group.key as keyof IRelease] as number) : 0,
    color: group.color,
  }));

  const overdueTone = getReleaseRowTone(releaseDetails);
  const overdueToneClass = getReleaseOverdueToneTextClass(overdueTone);
  const releaseOverviewPath = `/${workspaceSlug}/projects/${releaseDetails.project_id}/releases/${releaseDetails.id}/overview`;

  const handleNavigateToOverview = () => {
    setValueIntoLocalStorage(getReleaseDetailTabStorageKey(releaseId), DEFAULT_RELEASE_DETAIL_TAB);
  };

  return (
    <div className="relative" data-prevent-progress>
      <Link ref={parentRef} href={releaseOverviewPath} onClick={handleNavigateToOverview}>
        <Card>
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Tooltip tooltipContent={releaseDetails.name} position="top" isMobile={isMobile}>
                  <span className={cn("truncate text-14 font-medium", overdueToneClass)}>
                    {releaseDetails.name}
                  </span>
                </Tooltip>
                <ReleaseOverdueTags
                  releaseDetails={releaseDetails}
                  workspaceSlug={workspaceSlug.toString()}
                  projectId={releaseDetails.project_id}
                />
              </div>
              <div className="flex items-center gap-2" onClick={handleEventPropagation}>
                <ReleaseStatusDropdown
                  isDisabled={isDisabled}
                  releaseDetails={releaseDetails}
                  handleReleaseDetailsChange={handleReleaseDetailsChange}
                />
                <button type="button" onClick={openPeek}>
                  <Info className="h-4 w-4 text-placeholder" />
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-secondary">
                <WorkItemsIcon className="h-4 w-4 text-tertiary" />
                <span className="text-11 text-tertiary">{issueCount ?? "0 Work item"}</span>
              </div>
              {leadDetails ? (
                <span className="cursor-default">
                  <ButtonAvatars showTooltip={false} userIds={leadDetails?.id} />
                </span>
              ) : (
                <Tooltip tooltipContent="No lead">
                  <SquareUser className="mx-1 h-4 w-4 text-tertiary" />
                </Tooltip>
              )}
            </div>
            <LinearProgressIndicator size="lg" data={progressIndicatorData} />
            <div className="flex items-center justify-between py-0.5" onClick={handleEventPropagation}>
              <DateRangeDropdown
                buttonContainerClassName={`h-6 w-full flex ${isDisabled ? "cursor-not-allowed" : "cursor-pointer"} items-center gap-1.5 text-tertiary border-[0.5px] border-strong rounded-sm text-11`}
                buttonVariant="transparent-with-text"
                className="h-7"
                value={{
                  from: getDate(releaseDetails.start_date),
                  to: getDate(releaseDetails.target_date),
                }}
                onSelect={(val) => {
                  handleReleaseDetailsChange({
                    start_date: val?.from ? renderFormattedPayloadDate(val.from) : null,
                    target_date: val?.to ? renderFormattedPayloadDate(val.to) : null,
                  });
                }}
                placeholder={{
                  from: "Start date",
                  to: "End date",
                }}
                disabled={isDisabled}
                hideIcon={{ from: renderIcon ?? true, to: renderIcon }}
              />
            </div>
          </div>
        </Card>
      </Link>
      <div className="absolute right-4 bottom-[18px] flex items-center gap-1.5">
        {isEditingAllowed && (
          <FavoriteStar
            onClick={(e) => {
              if (releaseDetails.is_favorite) handleRemoveFromFavorites(e);
              else handleAddToFavorites(e);
            }}
            selected={!!releaseDetails.is_favorite}
          />
        )}
        {workspaceSlug && projectId && (
          <ReleaseQuickActions
            parentRef={parentRef}
            releaseId={releaseId}
            projectId={projectId.toString()}
            workspaceSlug={workspaceSlug.toString()}
          />
        )}
      </div>
    </div>
  );
});
