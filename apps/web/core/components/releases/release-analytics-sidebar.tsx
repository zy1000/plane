/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { Info, SquareUser } from "lucide-react";
import { Disclosure, Transition } from "@headlessui/react";
import { EEstimateSystem, PROJECT_RELEASES_EDIT_PERMISSION_KEY } from "@plane/constants";
// plane types
import { useTranslation } from "@plane/i18n";
import {
  PlusIcon,
  MembersPropertyIcon,
  WorkItemsIcon,
  StartDatePropertyIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ILinkDetails, IRelease, ModuleLink } from "@plane/types";
// plane ui
import { Loader, TextArea } from "@plane/ui";
// components
// helpers
import { getDate, renderFormattedPayloadDate } from "@plane/utils";
import { DateRangeDropdown } from "@/components/dropdowns/date-range";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { CreateUpdateReleaseLinkModal, ReleaseLinksList } from "@/components/releases/links";
import { ReleaseAnalyticsProgress } from "@/components/releases/analytics-sidebar/issue-progress";
import { ReleaseOverdueRecordsSection } from "@/components/releases/release-overdue-records-section";
import { ReleaseStatusDropdown, type TReleaseUpdatePayload } from "@/components/releases/release-status-dropdown";
import { formatReleaseUpdateError } from "@/components/releases/use-release-error-message";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useRelease } from "@/hooks/store/use-release";
import { useUserPermissions } from "@/hooks/store/user";
// plane web constants
const defaultValues: Partial<IRelease> = {
  lead_id: "",
  member_ids: [],
  start_date: null,
  target_date: null,
  status: "not-started",
};

type Props = {
  releaseId: string;
  handleClose: () => void;
  isArchived?: boolean;
};

// TODO: refactor this component
export const ReleaseAnalyticsSidebar = observer(function ReleaseAnalyticsSidebar(props: Props) {
  const { releaseId, handleClose, isArchived } = props;
  // states
  const [moduleLinkModal, setModuleLinkModal] = useState(false);
  const [selectedLinkToUpdate, setSelectedLinkToUpdate] = useState<ILinkDetails | null>(null);
  // router
  const { workspaceSlug, projectId } = useParams();
  const workspaceSlugValue = workspaceSlug?.toString() ?? "";
  const projectIdValue = projectId?.toString() ?? "";

  // store hooks
  const { t } = useTranslation();
  const { allowProjectPermissionKeys } = useUserPermissions();

  const { getReleaseById, updateReleaseDetails, createReleaseLink, updateReleaseLink, deleteReleaseLink } =
    useRelease();
  const { areEstimateEnabledByProjectId, currentActiveEstimateId, estimateById } = useProjectEstimates();

  // derived values
  const releaseDetails = getReleaseById(releaseId);
  const areEstimateEnabled = projectId && areEstimateEnabledByProjectId(projectId.toString());
  const estimateType = areEstimateEnabled && currentActiveEstimateId && estimateById(currentActiveEstimateId);
  const isEstimatePointValid = estimateType && estimateType?.type == EEstimateSystem.POINTS ? true : false;
  const isEditingAllowed = allowProjectPermissionKeys(
    [PROJECT_RELEASES_EDIT_PERMISSION_KEY],
    workspaceSlugValue,
    projectIdValue
  );
  const canEditReleaseDetails = isEditingAllowed && !isArchived;

  const { reset, control } = useForm({
    defaultValues,
  });

  const submitChanges = async (data: TReleaseUpdatePayload) => {
    if (!workspaceSlug || !projectId || !releaseId || !canEditReleaseDetails) return;
    try {
      await updateReleaseDetails(workspaceSlug.toString(), projectId.toString(), releaseId.toString(), data);
    } catch (err) {
      const { title, message } = formatReleaseUpdateError(err);
      setToast({
        type: TOAST_TYPE.ERROR,
        title,
        message,
      });
    }
  };

  const handleCreateLink = async (formData: ModuleLink) => {
    if (!workspaceSlug || !projectId || !releaseId || !canEditReleaseDetails) return;
    const payload = { metadata: {}, ...formData };
    await createReleaseLink(workspaceSlug.toString(), projectId.toString(), releaseId.toString(), payload);
  };

  const handleUpdateLink = async (formData: ModuleLink, linkId: string) => {
    if (!workspaceSlug || !projectId || !canEditReleaseDetails) return;
    const payload = { metadata: {}, ...formData };
    await updateReleaseLink(workspaceSlug.toString(), projectId.toString(), releaseId.toString(), linkId, payload);
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!workspaceSlug || !projectId || !canEditReleaseDetails) return;
    try {
      await deleteReleaseLink(workspaceSlug.toString(), projectId.toString(), releaseId.toString(), linkId);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "Release link deleted successfully.",
      });
    } catch (_error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: "Some error occurred",
      });
    }
  };

  const handleDateChange = async (startDate: Date | undefined, targetDate: Date | undefined) => {
    if (!canEditReleaseDetails) return;
    await submitChanges({
      start_date: startDate ? renderFormattedPayloadDate(startDate) : null,
      target_date: targetDate ? renderFormattedPayloadDate(targetDate) : null,
    });
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: "Success!",
      message: "Release updated successfully.",
    });
  };

  useEffect(() => {
    if (releaseDetails)
      reset({
        ...releaseDetails,
      });
  }, [releaseDetails, reset]);

  const handleEditLink = (link: ILinkDetails) => {
    if (!canEditReleaseDetails) return;
    setSelectedLinkToUpdate(link);
    setModuleLinkModal(true);
  };

  if (!releaseDetails)
    return (
      <Loader>
        <div className="space-y-2">
          <Loader.Item height="15px" width="50%" />
          <Loader.Item height="15px" width="30%" />
        </div>
        <div className="mt-8 space-y-3">
          <Loader.Item height="30px" />
          <Loader.Item height="30px" />
          <Loader.Item height="30px" />
        </div>
      </Loader>
    );

  const issueCount =
    releaseDetails.total_issues === 0
      ? "0 work items"
      : `${releaseDetails.completed_issues}/${releaseDetails.total_issues}`;

  const issueEstimatePointCount =
    releaseDetails.total_estimate_points === 0
      ? "0 work items"
      : `${releaseDetails.completed_estimate_points}/${releaseDetails.total_estimate_points}`;

  return (
    <div className="relative">
      <CreateUpdateReleaseLinkModal
        isOpen={moduleLinkModal}
        handleClose={() => {
          setModuleLinkModal(false);
          setTimeout(() => {
            setSelectedLinkToUpdate(null);
          }, 500);
        }}
        data={selectedLinkToUpdate}
        createLink={handleCreateLink}
        updateLink={handleUpdateLink}
      />
      <>
        <div className={`sticky top-0 z-10 flex items-center justify-between bg-surface-1 pt-5 pb-5`}>
          <div>
            <button
              className="flex h-5 w-5 items-center justify-center rounded-full bg-layer-3"
              onClick={() => handleClose()}
            >
              <ChevronRightIcon className="h-3 w-3 stroke-2 text-on-color" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-5 pt-2">
            <ReleaseStatusDropdown
              isDisabled={!canEditReleaseDetails}
              releaseDetails={releaseDetails}
              handleReleaseDetailsChange={submitChanges}
            />
          </div>
          <h4 className="w-full text-18 font-semibold break-words text-primary">{releaseDetails.name}</h4>
        </div>

        {releaseDetails.description && (
          <TextArea
            className="ring-none !m-0 max-h-max w-full resize-none !border-0 bg-transparent !p-0 text-13 leading-5 text-secondary outline-none"
            value={releaseDetails.description}
            disabled
          />
        )}

        <div className="flex flex-col gap-5 pt-2.5 pb-6">
          <div className="flex items-center justify-start gap-1">
            <div className="flex w-2/5 items-center justify-start gap-2 text-tertiary">
              <StartDatePropertyIcon className="h-4 w-4" />
              <span className="text-14">{t("date_range")}</span>
            </div>
            <div className="h-7">
              <Controller
                control={control}
                name="start_date"
                render={({ field: { value: startDateValue, onChange: onChangeStartDate } }) => (
                  <Controller
                    control={control}
                    name="target_date"
                    render={({ field: { value: endDateValue, onChange: onChangeEndDate } }) => {
                      const startDate = getDate(startDateValue);
                      const endDate = getDate(endDateValue);
                      return (
                        <DateRangeDropdown
                          buttonContainerClassName="w-full"
                          buttonVariant="background-with-text"
                          value={{
                            from: startDate,
                            to: endDate,
                          }}
                          onSelect={(val) => {
                            onChangeStartDate(val?.from ? renderFormattedPayloadDate(val.from) : null);
                            onChangeEndDate(val?.to ? renderFormattedPayloadDate(val.to) : null);
                            handleDateChange(val?.from, val?.to);
                          }}
                          placeholder={{
                            from: t("start_date"),
                            to: t("end_date"),
                          }}
                          disabled={!canEditReleaseDetails}
                        />
                      );
                    }}
                  />
                )}
              />
            </div>
          </div>
          <div className="flex items-center justify-start gap-1">
            <div className="flex w-2/5 items-center justify-start gap-2 text-tertiary">
              <SquareUser className="h-4 w-4" />
              <span className="text-14">{t("lead")}</span>
            </div>
            <Controller
              control={control}
              name="lead_id"
              render={({ field: { value } }) => (
                <div className="h-7 w-3/5">
                  <MemberDropdown
                    value={value ?? null}
                    onChange={(val) => {
                      submitChanges({ lead_id: val });
                    }}
                    projectId={projectId?.toString() ?? ""}
                    multiple={false}
                    buttonVariant="background-with-text"
                    placeholder={t("lead")}
                    disabled={!canEditReleaseDetails}
                    icon={SquareUser}
                  />
                </div>
              )}
            />
          </div>
          <div className="flex items-center justify-start gap-1">
            <div className="flex w-2/5 items-center justify-start gap-2 text-tertiary">
              <MembersPropertyIcon className="h-4 w-4" />
              <span className="text-14">{t("members")}</span>
            </div>
            <Controller
              control={control}
              name="member_ids"
              render={({ field: { value } }) => (
                <div className="h-7 w-3/5">
                  <MemberDropdown
                    value={value ?? []}
                    onChange={(val: string[]) => {
                      submitChanges({ member_ids: val });
                    }}
                    multiple
                    projectId={projectId?.toString() ?? ""}
                    buttonVariant={value && value?.length > 0 ? "transparent-without-text" : "background-with-text"}
                    buttonClassName={value && value.length > 0 ? "hover:bg-transparent px-0" : ""}
                    disabled={!canEditReleaseDetails}
                  />
                </div>
              )}
            />
          </div>
          <div className="flex items-center justify-start gap-1">
            <div className="flex w-2/5 items-center justify-start gap-2 text-tertiary">
              <WorkItemsIcon className="h-4 w-4" />
              <span className="text-14">{t("issues")}</span>
            </div>
            <div className="flex h-7 w-3/5 items-center">
              <span className="px-1.5 text-13 text-tertiary">{issueCount}</span>
            </div>
          </div>

          {/**
           * NOTE: Render this section when estimate points of he projects is enabled and the estimate system is points
           */}
          {isEstimatePointValid && (
            <div className="flex items-center justify-start gap-1">
              <div className="flex w-2/5 items-center justify-start gap-2 text-tertiary">
                <WorkItemsIcon className="h-4 w-4" />
                <span className="text-14">{t("points")}</span>
              </div>
              <div className="flex h-7 w-3/5 items-center">
                <span className="px-1.5 text-13 text-tertiary">{issueEstimatePointCount}</span>
              </div>
            </div>
          )}
        </div>

        {workspaceSlug && projectId && releaseDetails?.id && (
          <ReleaseAnalyticsProgress
            workspaceSlug={workspaceSlug.toString()}
            projectId={projectId.toString()}
            releaseId={releaseDetails?.id}
          />
        )}

        {workspaceSlug && projectId && releaseDetails?.id && (
          <ReleaseOverdueRecordsSection
            workspaceSlug={workspaceSlug.toString()}
            projectId={projectId.toString()}
            releaseId={releaseDetails.id}
          />
        )}

        <div className="flex flex-col">
          <div className="flex w-full flex-col items-center justify-start gap-2 border-t border-subtle px-1.5 py-5">
            {/* Accessing link outside the disclosure as mobx is not  considering the children inside Disclosure as part of the component hence not observing their state change*/}
            <Disclosure defaultOpen={!!releaseDetails?.link_release?.length}>
              {({ open }) => (
                <div className={`relative flex h-full w-full flex-col ${open ? "" : "flex-row"}`}>
                  <Disclosure.Button className="flex w-full items-center justify-between gap-2 p-1.5">
                    <div className="flex items-center justify-start gap-2 text-13">
                      <span className="font-medium text-secondary">{t("common.links")}</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <ChevronDownIcon
                        className={`h-3.5 w-3.5 ${open ? "rotate-180 transform" : ""}`}
                        aria-hidden="true"
                      />
                    </div>
                  </Disclosure.Button>
                  <Transition show={open}>
                    <Disclosure.Panel>
                      <div className="mt-2 flex min-h-72 w-full flex-col space-y-3 overflow-y-auto">
                        {releaseDetails.link_release && releaseDetails.link_release.length > 0 ? (
                          <>
                            <div className="flex w-full items-center justify-end">
                              <button
                                type="button"
                                className={`flex items-center gap-1.5 text-13 font-medium ${
                                  canEditReleaseDetails
                                    ? "text-accent-primary"
                                    : "cursor-not-allowed text-tertiary opacity-60"
                                }`}
                                disabled={!canEditReleaseDetails}
                                onClick={() => {
                                  if (!canEditReleaseDetails) return;
                                  setModuleLinkModal(true);
                                }}
                              >
                                <PlusIcon className="h-3 w-3" />
                                {t("add_link")}
                              </button>
                            </div>

                            {releaseId && (
                              <ReleaseLinksList
                                releaseId={releaseId}
                                handleEditLink={handleEditLink}
                                handleDeleteLink={handleDeleteLink}
                                disabled={!canEditReleaseDetails}
                              />
                            )}
                          </>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Info className="h-3.5 w-3.5 stroke-[1.5] text-tertiary" />
                              <span className="p-0.5 text-11 text-tertiary">{t("common.no_links_added_yet")}</span>
                            </div>
                            <button
                              type="button"
                              className={`flex items-center gap-1.5 text-13 font-medium ${
                                canEditReleaseDetails
                                  ? "text-accent-primary"
                                  : "cursor-not-allowed text-tertiary opacity-60"
                              }`}
                              disabled={!canEditReleaseDetails}
                              onClick={() => {
                                if (!canEditReleaseDetails) return;
                                setModuleLinkModal(true);
                              }}
                            >
                              <PlusIcon className="h-3 w-3" />
                              {t("add_link")}
                            </button>
                          </div>
                        )}
                      </div>
                    </Disclosure.Panel>
                  </Transition>
                </div>
              )}
            </Disclosure>
          </div>
        </div>
      </>
    </div>
  );
});
