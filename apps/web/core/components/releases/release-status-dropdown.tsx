/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import type { IRelease, TReleaseStatus } from "@plane/types";
import { CustomSelect } from "@plane/ui";
import { getAllowedReleaseStatusOptions, getReleaseStatusDetails } from "./release-status-config";

type Props = {
  isDisabled: boolean;
  releaseDetails: IRelease;
  handleReleaseDetailsChange: (payload: Partial<IRelease>) => Promise<void>;
};

export const ReleaseStatusDropdown = observer(function ReleaseStatusDropdown(props: Props) {
  const { isDisabled, releaseDetails, handleReleaseDetailsChange } = props;
  const releaseStatus = getReleaseStatusDetails(releaseDetails.status);
  const allowedStatusOptions = getAllowedReleaseStatusOptions(releaseDetails.status);
  const CurrentStatusIcon = releaseStatus.icon;

  return (
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
      onChange={(val: TReleaseStatus) => {
        handleReleaseDetailsChange({ status: val });
      }}
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
  );
});
