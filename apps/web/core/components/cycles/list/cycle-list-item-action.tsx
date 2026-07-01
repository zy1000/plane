/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MouseEvent } from "react";
import React, { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { Eye, ArrowRight } from "lucide-react";
// plane imports
import {
  CYCLE_STATUS,
  CYCLE_STATUS_TRANSITIONS,
  IS_FAVORITE_MENU_OPEN,
  PROJECT_SPRINTS_EDIT_PERMISSION_KEY,
} from "@plane/constants";
import { useLocalStorage } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { TransferIcon, WorkItemsIcon, MembersPropertyIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast, setPromiseToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { ICycle } from "@plane/types";
import { Avatar, AvatarGroup, CustomSelect, FavoriteStar } from "@plane/ui";
import { getDate, getFileURL, generateQueryParams, renderFormattedPayloadDate } from "@plane/utils";
// components
import { DateDropdown } from "@/components/dropdowns/date";
import { DateRangeDropdown } from "@/components/dropdowns/date-range";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useCycleFilter } from "@/hooks/store/use-cycle-filter";
import { useMember } from "@/hooks/store/use-member";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { useTimeZoneConverter } from "@/hooks/use-timezone-converter";
// plane web components
import { CycleAdditionalActions } from "@/plane-web/components/cycles";
// local imports
import { CycleQuickActions } from "../quick-actions";
import { TransferIssuesModal } from "../transfer-issues-modal";
import { formatCycleUpdateError } from "../use-cycle-error-message";

type Props = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
  cycleDetails: ICycle;
  parentRef: React.RefObject<HTMLDivElement>;
  isActive?: boolean;
};

const defaultValues: Partial<ICycle> = {
  start_date: null,
  end_date: null,
};

export const CycleListItemAction = observer(function CycleListItemAction(props: Props) {
  const { workspaceSlug, projectId, cycleId, cycleDetails, parentRef, isActive = false } = props;
  // router
  const { projectId: routerProjectId } = useParams();
  //states
  const [transferIssuesModal, setTransferIssuesModal] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isUpdatingDateRange, setIsUpdatingDateRange] = useState(false);
  const [isUpdatingOwner, setIsUpdatingOwner] = useState(false);
  // hooks
  const { isMobile } = usePlatformOS();
  const { t } = useTranslation();
  const { isProjectTimeZoneDifferent, getProjectUTCOffset, renderFormattedDateInUserTimezone } =
    useTimeZoneConverter(projectId);
  const { currentProjectDisplayFilters } = useCycleFilter();
  // router
  const router = useAppRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  // store hooks
  const { addCycleToFavorites, removeCycleFromFavorites, updateCycleDetails } = useCycle();
  const { data: currentUser } = useUser();
  const { allowProjectPermissionKeys } = useUserPermissions();

  // local storage
  const { setValue: toggleFavoriteMenu, storedValue: isFavoriteMenuOpen } = useLocalStorage<boolean>(
    IS_FAVORITE_MENU_OPEN,
    false
  );

  const { getUserDetails } = useMember();

  // form
  const { reset } = useForm({
    defaultValues,
  });

  // derived values
  const cycleStatus = cycleDetails.status ?? "not_started";
  const cycleStatusDetails = CYCLE_STATUS.find((status) => status.value === cycleStatus);
  const displayProperties = currentProjectDisplayFilters?.display_properties ?? {};
  const showStatusProperty = displayProperties.status !== false;
  const showIssueCountProperty = displayProperties.issue_count !== false;
  const showStartDateProperty = displayProperties.start_date !== false;
  const showEndDateProperty = displayProperties.end_date !== false;
  const showDateRange = showStartDateProperty || showEndDateProperty;
  const showTestHandoffDateProperty = displayProperties.test_handoff_date !== false;
  const showOwnerProperty = displayProperties.created_by !== false;
  const showMembersProperty = displayProperties.members !== false;
  const showStatusInGroupedView =
    showStatusProperty &&
    (currentProjectDisplayFilters?.group_by === "owned_by" ||
      currentProjectDisplayFilters?.group_by === "state" ||
      currentProjectDisplayFilters?.group_by === "release" ||
      currentProjectDisplayFilters?.group_by === "none");
  const statusOptions = CYCLE_STATUS_TRANSITIONS[cycleStatus as NonNullable<ICycle["status"]>] ?? [];

  const showIssueCount = useMemo(
    () => showIssueCountProperty && cycleStatus !== "completed" && cycleStatus !== "cancelled",
    [cycleStatus, showIssueCountProperty]
  );

  const transferableIssuesCount = cycleDetails
    ? cycleDetails.total_issues - (cycleDetails.cancelled_issues + cycleDetails.completed_issues)
    : 0;

  const showTransferIssues = routerProjectId && transferableIssuesCount > 0 && cycleStatus === "completed";

  const projectUTCOffset = getProjectUTCOffset();

  const isEditingAllowed = allowProjectPermissionKeys([PROJECT_SPRINTS_EDIT_PERMISSION_KEY], workspaceSlug, projectId);
  const isCompleted = cycleStatus === "completed";
  const isCurrentOwner = Boolean(currentUser?.id) && String(cycleDetails.owned_by_id) === String(currentUser?.id);
  const canChangeStatus = isEditingAllowed && !cycleDetails.archived_at && statusOptions.length > 0;
  const canUpdateDateRange = isEditingAllowed && !cycleDetails.archived_at && !isCompleted;
  const canUpdateOwner = isEditingAllowed && !cycleDetails.archived_at && isCurrentOwner;

  const handleDateRangeSelect = (startDate?: Date, endDate?: Date) => {
    void (async () => {
      const nextStartDate = startDate ? renderFormattedPayloadDate(startDate) : null;
      const nextEndDate = endDate ? renderFormattedPayloadDate(endDate) : null;
      const currentStartDate = cycleDetails.start_date ?? null;
      const currentEndDate = cycleDetails.end_date ?? null;

      if (
        isUpdatingDateRange ||
        (nextStartDate === currentStartDate && nextEndDate === currentEndDate) ||
        !canUpdateDateRange
      ) {
        return;
      }

      setIsUpdatingDateRange(true);
      try {
        await updateCycleDetails(workspaceSlug, projectId, cycleId, {
          start_date: nextStartDate,
          end_date: nextEndDate,
        });
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("project_cycles.action.update.success.title"),
          message: t("project_cycles.action.update.success.description"),
        });
      } catch (err) {
        const { title, message } = formatCycleUpdateError(err);
        setToast({
          type: TOAST_TYPE.ERROR,
          title,
          message,
        });
      } finally {
        setIsUpdatingDateRange(false);
      }
    })();
  };

  const handleTestHandoffDateSelect = (handoffDate?: Date) => {
    void (async () => {
      const nextHandoffDate = handoffDate ? renderFormattedPayloadDate(handoffDate) : null;
      const currentHandoffDate = cycleDetails.test_handoff_date ?? null;

      if (isUpdatingDateRange || nextHandoffDate === currentHandoffDate || !canUpdateDateRange) {
        return;
      }

      setIsUpdatingDateRange(true);
      try {
        await updateCycleDetails(workspaceSlug, projectId, cycleId, {
          test_handoff_date: nextHandoffDate,
        });
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("project_cycles.action.update.success.title"),
          message: t("project_cycles.action.update.success.description"),
        });
      } catch (err) {
        const { title, message } = formatCycleUpdateError(err);
        setToast({
          type: TOAST_TYPE.ERROR,
          title,
          message,
        });
      } finally {
        setIsUpdatingDateRange(false);
      }
    })();
  };

  // handlers
  const handleAddToFavorites = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!workspaceSlug || !projectId) return;

    const addToFavoritePromise = addCycleToFavorites(workspaceSlug?.toString(), projectId.toString(), cycleId).then(
      () => {
        if (!isFavoriteMenuOpen) toggleFavoriteMenu(true);
      }
    );

    setPromiseToast(addToFavoritePromise, {
      loading: t("project_cycles.action.favorite.loading"),
      success: {
        title: t("project_cycles.action.favorite.success.title"),
        message: () => t("project_cycles.action.favorite.success.description"),
      },
      error: {
        title: t("project_cycles.action.favorite.failed.title"),
        message: () => t("project_cycles.action.favorite.failed.description"),
      },
    });
  };

  const handleRemoveFromFavorites = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!workspaceSlug || !projectId) return;

    const removeFromFavoritePromise = removeCycleFromFavorites(
      workspaceSlug?.toString(),
      projectId.toString(),
      cycleId
    );

    setPromiseToast(removeFromFavoritePromise, {
      loading: t("project_cycles.action.unfavorite.loading"),
      success: {
        title: t("project_cycles.action.unfavorite.success.title"),
        message: () => t("project_cycles.action.unfavorite.success.description"),
      },
      error: {
        title: t("project_cycles.action.unfavorite.failed.title"),
        message: () => t("project_cycles.action.unfavorite.failed.description"),
      },
    });
  };

  useEffect(() => {
    if (cycleDetails)
      reset({
        ...cycleDetails,
      });
  }, [cycleDetails, reset]);

  const handleOwnerChange = (nextOwnerId: string | null) => {
    if (!nextOwnerId || isUpdatingOwner || nextOwnerId === cycleDetails.owned_by_id || !canUpdateOwner) return;
    void (async () => {
      setIsUpdatingOwner(true);
      try {
        await updateCycleDetails(workspaceSlug, projectId, cycleId, { owned_by_id: nextOwnerId });
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("project_cycles.action.update.success.title"),
          message: t("project_cycles.action.update.success.description"),
        });
      } catch (err) {
        const { title, message } = formatCycleUpdateError(err);
        setToast({
          type: TOAST_TYPE.ERROR,
          title,
          message,
        });
      } finally {
        setIsUpdatingOwner(false);
      }
    })();
  };

  // handlers
  const openCycleOverview = (e: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const query = generateQueryParams(searchParams, ["peekCycle"]);
    if (searchParams.has("peekCycle") && searchParams.get("peekCycle") === cycleId) {
      router.push(`${pathname}?${query}`);
    } else {
      router.push(`${pathname}?${query && `${query}&`}peekCycle=${cycleId}`);
    }
  };

  return (
    <>
      <TransferIssuesModal
        handleClose={() => setTransferIssuesModal(false)}
        isOpen={transferIssuesModal}
        cycleId={cycleId.toString()}
      />
      <button
        onClick={openCycleOverview}
        className={`z-[1] flex flex-shrink-0 gap-1 text-11 text-accent-secondary ${
          isMobile || (isActive && !searchParams.has("peekCycle"))
            ? "visible"
            : "invisible pointer-events-none group-hover:visible group-hover:pointer-events-auto"
        }`}
      >
        <Eye className="my-auto h-4 w-4 text-accent-secondary" />
        <span>{t("project_cycles.more_details")}</span>
      </button>
      {showStatusInGroupedView && cycleStatusDetails && (
        canChangeStatus ? (
          <CustomSelect
            customButton={
              <span
                className="flex h-6 min-w-20 cursor-pointer items-center justify-center truncate rounded-sm px-2.5 text-center text-11 font-medium whitespace-nowrap"
                style={{
                  color: cycleStatusDetails.color,
                  backgroundColor: `${cycleStatusDetails.color}20`,
                }}
              >
                {t(cycleStatusDetails.i18n_title)}
              </span>
            }
            value={cycleStatus}
            onChange={(nextStatus: string) => {
              void (async () => {
                if (!nextStatus || nextStatus === cycleStatus || isUpdatingStatus) return;
                setIsUpdatingStatus(true);
                try {
                  await updateCycleDetails(workspaceSlug, projectId, cycleId, {
                    status: nextStatus as ICycle["status"],
                  });
                  setToast({
                    type: TOAST_TYPE.SUCCESS,
                    title: t("project_cycles.action.update.success.title"),
                    message: t("project_cycles.action.update.success.description"),
                  });
                } catch (err) {
                  const { title, message } = formatCycleUpdateError(err);
                  setToast({
                    type: TOAST_TYPE.ERROR,
                    title,
                    message,
                  });
                } finally {
                  setIsUpdatingStatus(false);
                }
              })();
            }}
            disabled={isUpdatingStatus}
          >
            {CYCLE_STATUS.filter((status) => statusOptions.includes(status.value)).map((status) => (
              <CustomSelect.Option key={status.value} value={status.value}>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: status.color }} />
                  {t(status.i18n_title)}
                </div>
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        ) : (
          <div className={`rounded-sm px-1.5 py-1 text-11 ${cycleStatusDetails.bgColor} ${cycleStatusDetails.textColor}`}>
            {t(cycleStatusDetails.i18n_title)}
          </div>
        )
      )}
      {showIssueCount && (
        <div className="flex items-center gap-1">
          <WorkItemsIcon className="h-4 w-4 text-tertiary" />
          <span className="text-11 text-tertiary">{cycleDetails.total_issues}</span>
        </div>
      )}
      <CycleAdditionalActions cycleId={cycleId} projectId={projectId} />
      {showTransferIssues && (
        <div
          className="flex h-6 cursor-pointer items-center gap-1 px-2 text-accent-secondary"
          onClick={() => {
            setTransferIssuesModal(true);
          }}
        >
          <TransferIcon className="w-4 fill-accent-primary" />
          <span>{t("project_cycles.transfer_work_items", { count: transferableIssuesCount })}</span>
        </div>
      )}
      {isActive ? (
        <>
          <div className="flex gap-2">
            {showDateRange && (
              <DateRangeDropdown
                buttonVariant={"transparent-with-text"}
                buttonContainerClassName="h-6 flex items-center gap-1.5 rounded-sm text-11 text-tertiary [&>div]:hover:bg-transparent"
                buttonClassName="p-0"
                value={{
                  from: showStartDateProperty ? getDate(cycleDetails.start_date) : undefined,
                  to: showEndDateProperty ? getDate(cycleDetails.end_date) : undefined,
                }}
                onSelect={(val) => {
                  handleDateRangeSelect(val?.from, val?.to);
                }}
                placeholder={{
                  from: t("project_cycles.start_date"),
                  to: t("project_cycles.end_date"),
                }}
                showTooltip={isProjectTimeZoneDifferent() && !!cycleDetails.start_date && !!cycleDetails.end_date}
                customTooltipHeading={t("project_cycles.in_your_timezone")}
                customTooltipContent={
                  <span className="flex gap-1">
                    {renderFormattedDateInUserTimezone(cycleDetails.start_date ?? "")}
                    <ArrowRight className="my-auto h-3 w-3 flex-shrink-0" />
                    {renderFormattedDateInUserTimezone(cycleDetails.end_date ?? "")}
                  </span>
                }
                mergeDates
                disabled={!canUpdateDateRange || isUpdatingDateRange}
                hideIcon={{
                  from: false,
                  to: false,
                }}
              />
            )}
            {showDateRange && projectUTCOffset && (
              <span className="cursor-default rounded-md bg-layer-1 px-2 py-1 text-11 text-tertiary">
                {projectUTCOffset}
              </span>
            )}
            {showTestHandoffDateProperty && (
              <DateDropdown
                buttonVariant="transparent-with-text"
                buttonContainerClassName="h-6 flex items-center gap-1.5 rounded-sm text-11 text-tertiary [&>div]:hover:bg-transparent"
                buttonClassName="p-0"
                value={getDate(cycleDetails.test_handoff_date)}
                onChange={(val) => handleTestHandoffDateSelect(val ?? undefined)}
                placeholder={t("test_handoff_date")}
                minDate={getDate(cycleDetails.start_date) ?? undefined}
                maxDate={getDate(cycleDetails.end_date) ?? undefined}
                disabled={!canUpdateDateRange || isUpdatingDateRange}
              />
            )}
            {showOwnerProperty && (
              <div className="h-5 w-5">
                <MemberDropdown
                  value={cycleDetails?.owned_by_id ?? null}
                  onChange={handleOwnerChange}
                  multiple={false}
                  projectId={projectId}
                  buttonVariant="transparent-without-text"
                  className="h-full w-full"
                  buttonContainerClassName="h-full w-full"
                  buttonClassName="!p-0 hover:bg-transparent"
                  placeholder={t("lead")}
                  showUserDetails
                  disabled={!canUpdateOwner || isUpdatingOwner}
                />
              </div>
            )}
          </div>
        </>
      ) : (
        (showDateRange || showTestHandoffDateProperty) && (
          <>
            {showDateRange && (
              <DateRangeDropdown
                buttonVariant={"transparent-with-text"}
                buttonContainerClassName="h-6 w-full flex items-center gap-1.5 rounded-sm text-11 text-tertiary [&>div]:hover:bg-transparent"
                buttonClassName="p-0"
                value={{
                  from: showStartDateProperty ? getDate(cycleDetails.start_date) : undefined,
                  to: showEndDateProperty ? getDate(cycleDetails.end_date) : undefined,
                }}
                onSelect={(val) => {
                  handleDateRangeSelect(val?.from, val?.to);
                }}
                placeholder={{
                  from: t("project_cycles.start_date"),
                  to: t("project_cycles.end_date"),
                }}
                showTooltip={isProjectTimeZoneDifferent() && !!cycleDetails.start_date && !!cycleDetails.end_date}
                customTooltipHeading={t("project_cycles.in_your_timezone")}
                customTooltipContent={
                  <span className="flex gap-1">
                    {renderFormattedDateInUserTimezone(cycleDetails.start_date ?? "")}
                    <ArrowRight className="my-auto h-3 w-3 flex-shrink-0" />
                    {renderFormattedDateInUserTimezone(cycleDetails.end_date ?? "")}
                  </span>
                }
                mergeDates
                disabled={!canUpdateDateRange || isUpdatingDateRange}
                hideIcon={{
                  from: false,
                  to: false,
                }}
              />
            )}
            {showTestHandoffDateProperty && (
              <DateDropdown
                buttonVariant="transparent-with-text"
                buttonContainerClassName="h-6 w-full flex items-center gap-1.5 rounded-sm text-11 text-tertiary [&>div]:hover:bg-transparent"
                buttonClassName="p-0"
                value={getDate(cycleDetails.test_handoff_date)}
                onChange={(val) => handleTestHandoffDateSelect(val ?? undefined)}
                placeholder={t("test_handoff_date")}
                minDate={getDate(cycleDetails.start_date) ?? undefined}
                maxDate={getDate(cycleDetails.end_date) ?? undefined}
                disabled={!canUpdateDateRange || isUpdatingDateRange}
              />
            )}
          </>
        )
      )}
      {showOwnerProperty && !isActive && (
        <div className="h-5 w-5">
          <MemberDropdown
            value={cycleDetails?.owned_by_id ?? null}
            onChange={handleOwnerChange}
            multiple={false}
            projectId={projectId}
            buttonVariant="transparent-without-text"
            className="h-full w-full"
            buttonContainerClassName="h-full w-full"
            buttonClassName="!p-0 hover:bg-transparent"
            placeholder={t("lead")}
            showUserDetails
            disabled={!canUpdateOwner || isUpdatingOwner}
          />
        </div>
      )}
      {showMembersProperty && !isActive && (
        <Tooltip tooltipContent={`${cycleDetails.assignee_ids?.length} Members`} isMobile={isMobile}>
          <div className="flex w-min cursor-default items-center justify-center">
            {cycleDetails.assignee_ids && cycleDetails.assignee_ids?.length > 0 ? (
              <AvatarGroup showTooltip={false}>
                {cycleDetails.assignee_ids?.map((assignee_id) => {
                  const member = getUserDetails(assignee_id);
                  return (
                    <Avatar key={member?.id} name={member?.display_name} src={getFileURL(member?.avatar_url ?? "")} />
                  );
                })}
              </AvatarGroup>
            ) : (
              <MembersPropertyIcon className="h-4 w-4 text-tertiary" />
            )}
          </div>
        </Tooltip>
      )}
      {isEditingAllowed && !cycleDetails.archived_at && (
        <FavoriteStar
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (cycleDetails.is_favorite) handleRemoveFromFavorites(e);
            else handleAddToFavorites(e);
          }}
          selected={!!cycleDetails.is_favorite}
        />
      )}
      <div className="hidden md:block">
        <CycleQuickActions
          parentRef={parentRef}
          cycleId={cycleId}
          projectId={projectId}
          workspaceSlug={workspaceSlug}
        />
      </div>
    </>
  );
});
