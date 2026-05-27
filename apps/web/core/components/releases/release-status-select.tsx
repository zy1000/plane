/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import type { FieldError, Control } from "react-hook-form";
import { Controller } from "react-hook-form";
import { StatePropertyIcon } from "@plane/propel/icons";
import type { IRelease } from "@plane/types";
import { CustomSelect } from "@plane/ui";
import { getAllowedReleaseStatusOptions, getReleaseStatusDetails } from "./release-status-config";

type Props = {
  control: Control<IRelease, unknown>;
  error?: FieldError;
  tabIndex?: number;
};

export function ReleaseStatusSelect({ control, error, tabIndex }: Props) {
  return (
    <Controller
      control={control}
      rules={{ required: true }}
      name="status"
      render={({ field: { value, onChange } }) => {
        const selectedValue = getReleaseStatusDetails(value);
        const allowedStatusOptions = getAllowedReleaseStatusOptions(value);
        const SelectedStatusIcon = selectedValue.icon;
        return (
          <CustomSelect
            value={value}
            className="h-full"
            buttonClassName="h-full"
            label={
              <div
                className={`flex items-center justify-center gap-2 py-0.5 text-11 ${error ? "text-danger-primary" : ""}`}
              >
                {value ? (
                  <SelectedStatusIcon className="h-3.5 w-3.5" style={{ color: selectedValue.color }} />
                ) : (
                  <StatePropertyIcon className={`h-3 w-3 ${error ? "text-danger-primary" : "text-secondary"}`} />
                )}
                <span className={`${error ? "text-danger-primary" : "text-secondary"}`}>
                  {value ? selectedValue.label : "Status"}
                </span>
              </div>
            }
            onChange={onChange}
            tabIndex={tabIndex}
            noChevron
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
      }}
    />
  );
}
