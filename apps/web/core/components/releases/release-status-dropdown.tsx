/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState } from "react";
import { observer } from "mobx-react";
import type { IRelease, TReleaseStatus } from "@plane/types";
import { CustomSelect } from "@plane/ui";
import { TestingDatesConfirmModal } from "@/components/common/testing-dates-confirm-modal";
import { getAllowedReleaseStatusOptions, getReleaseStatusDetails } from "./release-status-config";
import { ReleaseStatusReasonModal } from "./release-status-reason-modal";

export type TReleaseUpdatePayload = Partial<IRelease> & { status_change_reason?: string };

type Props = {
  isDisabled: boolean;
  releaseDetails: IRelease;
  handleReleaseDetailsChange: (payload: TReleaseUpdatePayload) => Promise<void>;
};

const REASON_REQUIRED_STATUSES = new Set<TReleaseStatus>(["rejected", "cancelled"]);

export const ReleaseStatusDropdown = observer(function ReleaseStatusDropdown(props: Props) {
  const { isDisabled, releaseDetails, handleReleaseDetailsChange } = props;
  const releaseStatus = getReleaseStatusDetails(releaseDetails.status);
  const allowedStatusOptions = getAllowedReleaseStatusOptions(releaseDetails.status);
  const CurrentStatusIcon = releaseStatus.icon;

  const [pendingReasonStatus, setPendingReasonStatus] = useState<TReleaseStatus | null>(null);
  const [pendingDateConfirmStatus, setPendingDateConfirmStatus] = useState<TReleaseStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleStatusChange = (val: TReleaseStatus) => {
    if (val === releaseDetails.status) return;
    if (releaseDetails.status === "rejected" && val === "in-progress") {
      setPendingDateConfirmStatus(val);
      return;
    }
    if (REASON_REQUIRED_STATUSES.has(val)) {
      setPendingReasonStatus(val);
      return;
    }
    void handleReleaseDetailsChange({ status: val });
  };

  const handleReasonConfirm = async (reason: string, testHandoffDate?: string | null) => {
    if (!pendingReasonStatus) return;
    try {
      setSubmitting(true);
      const payload: TReleaseUpdatePayload = { status: pendingReasonStatus, status_change_reason: reason };
      if (pendingReasonStatus === "rejected" && testHandoffDate) {
        payload.test_handoff_date = testHandoffDate;
      }
      await handleReleaseDetailsChange(payload);
      setPendingReasonStatus(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReasonCancel = () => {
    if (submitting) return;
    setPendingReasonStatus(null);
  };

  const handleTestingDatesConfirm = async (payload: { endDate: string; testHandoffDate: string }) => {
    if (!pendingDateConfirmStatus) return;
    try {
      setSubmitting(true);
      await handleReleaseDetailsChange({
        status: pendingDateConfirmStatus,
        target_date: payload.endDate,
        test_handoff_date: payload.testHandoffDate,
      });
      setPendingDateConfirmStatus(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTestingDatesCancel = () => {
    if (submitting) return;
    setPendingDateConfirmStatus(null);
  };

  return (
    <>
      <CustomSelect
        customButton={
          <span
            className={`flex h-6 w-20 items-center justify-center rounded-sm text-center text-11 ${
              isDisabled ? "cursor-not-allowed" : "cursor-pointer"
            }`}
            style={{
              color: releaseStatus.color,
              backgroundColor: `${releaseStatus.color}20`,
            }}
          >
            <span className="flex items-center gap-1.5">
              <CurrentStatusIcon className="h-3.5 w-3.5" />
              {releaseStatus.label}
            </span>
          </span>
        }
        value={releaseStatus?.value}
        onChange={handleStatusChange}
        disabled={isDisabled}
      >
        {allowedStatusOptions.map((status) => {
          const StatusIcon = status.icon;
          return (
            <CustomSelect.Option key={status.value} value={status.value}>
              <div className="flex items-center gap-2">
                <StatusIcon className="h-3.5 w-3.5" style={{ color: status.color }} />
                {status.label}
              </div>
            </CustomSelect.Option>
          );
        })}
      </CustomSelect>
      <ReleaseStatusReasonModal
        open={pendingReasonStatus !== null}
        nextStatus={pendingReasonStatus}
        loading={submitting}
        currentTestHandoffDate={releaseDetails.test_handoff_date ?? null}
        releaseStartDate={releaseDetails.start_date ?? null}
        releaseTargetDate={releaseDetails.target_date ?? null}
        onCancel={handleReasonCancel}
        onConfirm={handleReasonConfirm}
      />
      <TestingDatesConfirmModal
        open={pendingDateConfirmStatus !== null}
        loading={submitting}
        entityLabel="发布"
        targetStatusLabel="进行中"
        startDate={releaseDetails.start_date ?? null}
        endDate={releaseDetails.target_date ?? null}
        testHandoffDate={releaseDetails.test_handoff_date ?? null}
        onCancel={handleTestingDatesCancel}
        onConfirm={handleTestingDatesConfirm}
      />
    </>
  );
});
