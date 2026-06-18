/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState } from "react";
import { observer } from "mobx-react";
import type { IRelease, TReleaseStatus } from "@plane/types";
import { CustomSelect } from "@plane/ui";
import { getAllowedReleaseStatusOptions, getReleaseStatusDetails } from "./release-status-config";
import { ReleaseStatusReasonModal } from "./release-status-reason-modal";

export type TReleaseUpdatePayload = Partial<IRelease> & { status_change_reason?: string };

type Props = {
  isDisabled: boolean;
  releaseDetails: IRelease;
  handleReleaseDetailsChange: (payload: TReleaseUpdatePayload) => Promise<void>;
};

const REASON_REQUIRED_STATUSES: TReleaseStatus[] = ["rejected", "cancelled"];

export const ReleaseStatusDropdown = observer(function ReleaseStatusDropdown(props: Props) {
  const { isDisabled, releaseDetails, handleReleaseDetailsChange } = props;
  const releaseStatus = getReleaseStatusDetails(releaseDetails.status);
  const allowedStatusOptions = getAllowedReleaseStatusOptions(releaseDetails.status);
  const CurrentStatusIcon = releaseStatus.icon;

  const [pendingStatus, setPendingStatus] = useState<TReleaseStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleStatusChange = (val: TReleaseStatus) => {
    if (val === releaseDetails.status) return;
    if (REASON_REQUIRED_STATUSES.includes(val)) {
      setPendingStatus(val);
      return;
    }
    void handleReleaseDetailsChange({ status: val });
  };

  const handleReasonConfirm = async (reason: string, testHandoffDate?: string | null) => {
    if (!pendingStatus) return;
    try {
      setSubmitting(true);
      const payload: TReleaseUpdatePayload = { status: pendingStatus, status_change_reason: reason };
      if (pendingStatus === "rejected" && testHandoffDate) {
        payload.test_handoff_date = testHandoffDate;
      }
      await handleReleaseDetailsChange(payload);
      setPendingStatus(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReasonCancel = () => {
    if (submitting) return;
    setPendingStatus(null);
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
        open={pendingStatus !== null}
        nextStatus={pendingStatus}
        loading={submitting}
        currentTestHandoffDate={releaseDetails.test_handoff_date ?? null}
        releaseStartDate={releaseDetails.start_date ?? null}
        releaseTargetDate={releaseDetails.target_date ?? null}
        onCancel={handleReasonCancel}
        onConfirm={handleReasonConfirm}
      />
    </>
  );
});
