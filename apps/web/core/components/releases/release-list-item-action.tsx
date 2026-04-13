/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { SquareUser } from "lucide-react";
import {
  MODULE_STATUS,
  EUserPermissions,
  EUserPermissionsLevel,
  IS_FAVORITE_MENU_OPEN,
  PROJECT_ERROR_MESSAGES,
  isProjectPermissionError,
} from "@plane/constants";
import { useLocalStorage } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setPromiseToast, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { IRelease } from "@plane/types";
import { FavoriteStar } from "@plane/ui";
import { renderFormattedPayloadDate, getDate } from "@plane/utils";
import { DateRangeDropdown } from "@/components/dropdowns/date-range";
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
import { ReleaseQuickActions } from "@/components/releases/release-quick-actions";
import { ReleaseStatusDropdown } from "@/components/releases/release-status-dropdown";
import { useMember } from "@/hooks/store/use-member";
import { useRelease } from "@/hooks/store/use-release";
import { useUserPermissions } from "@/hooks/store/user";

type Props = {
  releaseId: string;
  releaseDetails: IRelease;
  parentRef: React.RefObject<HTMLDivElement>;
};

export const ReleaseListItemAction = observer(function ReleaseListItemAction(props: Props) {
  const { releaseId, releaseDetails, parentRef } = props;
  const { workspaceSlug, projectId } = useParams();
  const { allowPermissions } = useUserPermissions();
  const { addReleaseToFavorites, removeReleaseFromFavorites, updateReleaseDetails } = useRelease();
  const { getUserDetails } = useMember();
  const { t } = useTranslation();
  const { setValue: toggleFavoriteMenu, storedValue } = useLocalStorage<boolean>(IS_FAVORITE_MENU_OPEN, false);

  const releaseStatus = MODULE_STATUS.find((status) => status.value === releaseDetails.status);
  const isEditingAllowed = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT
  );
  const isDisabled = !isEditingAllowed || !!releaseDetails?.archived_at;
  const renderIcon = Boolean(releaseDetails.start_date) || Boolean(releaseDetails.target_date);

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

  const handleReleaseDetailsChange = async (payload: Partial<IRelease>) => {
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
        if (isProjectPermissionError(err)) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
            message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
              ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
              : undefined,
          });
        } else {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "Error!",
            message: err?.detail ?? err?.error ?? "Release could not be updated. Please try again.",
          });
        }
      });
  };

  const leadDetails = releaseDetails.lead_id ? getUserDetails(releaseDetails.lead_id) : undefined;

  return (
    <>
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
        mergeDates
        placeholder={{
          from: t("start_date"),
          to: t("end_date"),
        }}
        disabled={isDisabled}
        hideIcon={{ from: renderIcon ?? true, to: renderIcon }}
      />

      {releaseStatus && (
        <ReleaseStatusDropdown
          isDisabled={isDisabled}
          releaseDetails={releaseDetails}
          handleReleaseDetailsChange={handleReleaseDetailsChange}
        />
      )}

      {leadDetails ? (
        <span className="cursor-default">
          <ButtonAvatars showTooltip={false} userIds={leadDetails?.id} />
        </span>
      ) : (
        <Tooltip tooltipContent="No lead">
          <SquareUser className="h-4 w-4 text-tertiary" />
        </Tooltip>
      )}

      {isEditingAllowed && !releaseDetails.archived_at && (
        <FavoriteStar
          onClick={(e) => {
            if (releaseDetails.is_favorite) handleRemoveFromFavorites(e);
            else handleAddToFavorites(e);
          }}
          selected={releaseDetails.is_favorite}
        />
      )}
      {workspaceSlug && projectId && (
        <div className="hidden md:block">
          <ReleaseQuickActions
            parentRef={parentRef}
            releaseId={releaseId}
            projectId={projectId.toString()}
            workspaceSlug={workspaceSlug.toString()}
          />
        </div>
      )}
    </>
  );
});
