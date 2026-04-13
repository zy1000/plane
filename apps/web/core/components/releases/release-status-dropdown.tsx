/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { MODULE_STATUS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TModuleStatus } from "@plane/propel/icons";
import { ModuleStatusIcon } from "@plane/propel/icons";
import type { IRelease } from "@plane/types";
import { CustomSelect } from "@plane/ui";

type Props = {
  isDisabled: boolean;
  releaseDetails: IRelease;
  handleReleaseDetailsChange: (payload: Partial<IRelease>) => Promise<void>;
};

export const ReleaseStatusDropdown = observer(function ReleaseStatusDropdown(props: Props) {
  const { isDisabled, releaseDetails, handleReleaseDetailsChange } = props;
  const { t } = useTranslation();
  const releaseStatus = MODULE_STATUS.find((status) => status.value === releaseDetails.status);

  if (!releaseStatus) return <></>;

  return (
    <CustomSelect
      customButton={
        <span
          className={`flex h-6 w-20 items-center justify-center rounded-sm text-center text-11 ${
            isDisabled ? "cursor-not-allowed" : "cursor-pointer"
          }`}
          style={{
            color: releaseStatus ? releaseStatus.color : "#a3a3a2",
            backgroundColor: releaseStatus ? `${releaseStatus.color}20` : "#a3a3a220",
          }}
        >
          {(releaseStatus && t(releaseStatus?.i18n_label)) ?? t("project_modules.status.backlog")}
        </span>
      }
      value={releaseStatus?.value}
      onChange={(val: TModuleStatus) => {
        handleReleaseDetailsChange({ status: val });
      }}
      disabled={isDisabled}
    >
      {MODULE_STATUS.map((status) => (
        <CustomSelect.Option key={status.value} value={status.value}>
          <div className="flex items-center gap-2">
            <ModuleStatusIcon status={status.value} />
            {t(status.i18n_label)}
          </div>
        </CustomSelect.Option>
      ))}
    </CustomSelect>
  );
});
