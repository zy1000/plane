/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import type { Control } from "react-hook-form";
import { Controller, useFormContext } from "react-hook-form";
// types
import type { TIssue, TIssueExtraFieldValue, TIssueTypeExtraField } from "@plane/types";
// shared extra-field utilities
import {
  ExtraFieldControl,
  FIELD_TYPE_ICON,
  findValueForField,
  isValueEmpty,
  upsertValue,
} from "@/components/issues/extra-fields";
// hooks
import { useIssueTypeExtraFields } from "@/hooks/store/use-issue-type-extra-fields";
// services
import type { TTypeExtraField } from "@/services/project/project-issue-type.service";

type TIssueExtraFieldsProps = {
  control: Control<TIssue>;
  workspaceSlug: string | undefined;
  projectId: string | null | undefined;
  issueTypeId: string | null | undefined;
  handleFormChange: () => void;
  disabled?: boolean;
  embeddedFields?: TIssueTypeExtraField[] | null;
};

type TFieldRowProps = {
  field: TTypeExtraField;
  value: unknown;
  error?: string;
  onChange: (next: TIssueExtraFieldValue["value"]) => void;
  disabled?: boolean;
};

const ExtraFieldRow = (props: TFieldRowProps) => {
  const { field, value, onChange, disabled, error } = props;
  const inputId = `extra-field-${field.id}`;
  const FieldIcon = FIELD_TYPE_ICON[field.field_type] ?? FIELD_TYPE_ICON.text;

  return (
    <div className="flex items-center gap-0 py-1.5">
      <label htmlFor={inputId} className="flex w-1/4 shrink-0 items-center gap-1.5 text-sm text-secondary">
        <FieldIcon className="h-3.5 w-3.5 shrink-0 text-tertiary" />
        <span className="truncate">{field.name}</span>
        {field.is_required && <span className="text-danger-primary">*</span>}
      </label>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <ExtraFieldControl
          field={field}
          value={value}
          error={error}
          onChange={onChange}
          disabled={disabled}
          compact={false}
        />
        {error && <span className="text-caption-sm-medium text-danger-primary">{error}</span>}
      </div>
    </div>
  );
};

export const IssueExtraFields = observer(function IssueExtraFields(props: TIssueExtraFieldsProps) {
  const { control, workspaceSlug, projectId, issueTypeId, handleFormChange, disabled, embeddedFields } = props;
  const { fields } = useIssueTypeExtraFields(workspaceSlug, projectId, issueTypeId, embeddedFields);
  const { setValue, watch } = useFormContext<TIssue>();

  // 当字段列表加载完成后，若 extra_field_values 为空（新建或切换类型后），
  // 将各字段的 default_value 填入表单。
  useEffect(() => {
    if (!fields || fields.length === 0) return;
    const currentValues = watch("extra_field_values") as TIssueExtraFieldValue[] | undefined;
    if (currentValues && currentValues.length > 0) return;

    const defaults: TIssueExtraFieldValue[] = fields
      .filter((field) => !isValueEmpty(field.default_value))
      .map((field) => ({
        extra_field_id: field.id,
        value: field.default_value as TIssueExtraFieldValue["value"],
        field_type: field.field_type,
      }));

    if (defaults.length > 0) {
      setValue("extra_field_values", defaults, { shouldValidate: false, shouldDirty: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fields]);

  if (fields === null || fields.length === 0) return null;

  return (
    <Controller
      control={control}
      name="extra_field_values"
      rules={{
        validate: (current) => {
          for (const field of fields) {
            if (!field.is_required) continue;
            const v = findValueForField(current as TIssueExtraFieldValue[] | undefined, field.id);
            if (isValueEmpty(v)) return `${field.name} 为必填字段`;
          }
          return true;
        },
      }}
      render={({ field: rhf, fieldState }) => {
        const currentValues = (rhf.value as TIssueExtraFieldValue[] | undefined) ?? [];
        const requiredErrorMessage =
          typeof fieldState.error?.message === "string" ? fieldState.error.message : undefined;

        return (
          <div className="flex flex-col">
            {fields.map((field) => {
              const value = findValueForField(currentValues, field.id);
              const isRequiredAndEmpty =
                !!requiredErrorMessage && field.is_required && isValueEmpty(value);
              return (
                <ExtraFieldRow
                  key={field.id}
                  field={field}
                  value={value}
                  error={isRequiredAndEmpty ? `${field.name} 为必填字段` : undefined}
                  disabled={disabled}
                  onChange={(next) => {
                    const updated = upsertValue(currentValues, field.id, field.field_type, next);
                    rhf.onChange(updated);
                    handleFormChange();
                  }}
                />
              );
            })}
          </div>
        );
      }}
    />
  );
});
