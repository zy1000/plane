/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { AlignLeft, CalendarDays, Hash, ListChecks, ToggleLeft, Users } from "lucide-react";
import { observer } from "mobx-react";
import type { Control } from "react-hook-form";
import { Controller, useFormContext } from "react-hook-form";
// types
import type { TIssue, TIssueExtraFieldType, TIssueExtraFieldValue } from "@plane/types";
// ui
import { CustomSelect, Input, MultiSelectDropdown, ToggleSwitch } from "@plane/ui";
import type { TDropdownOption } from "@plane/ui";
// components
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// hooks
import { useIssueTypeExtraFields } from "@/hooks/store/use-issue-type-extra-fields";
// services
import type { TTypeExtraField } from "@/services/project/project-issue-type.service";
// utils
import { cn, getDate, renderFormattedPayloadDate } from "@plane/utils";

type TIssueExtraFieldsProps = {
  control: Control<TIssue>;
  workspaceSlug: string | undefined;
  projectId: string | null | undefined;
  issueTypeId: string | null | undefined;
  handleFormChange: () => void;
  disabled?: boolean;
};

type TSelectOption = { key: string; label: string };

const getSelectOptions = (field: TTypeExtraField): TSelectOption[] => {
  const opts = field.options as unknown;
  // 优先读 choices，兼容旧 options / values 字段，最后尝试直接作为数组
  const raw: unknown = Array.isArray(opts)
    ? opts
    : opts && typeof opts === "object"
      ? ((opts as { choices?: unknown; options?: unknown; values?: unknown }).choices ??
        (opts as { options?: unknown }).options ??
        (opts as { values?: unknown }).values ??
        [])
      : [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): TSelectOption | null => {
      if (typeof item === "string") return { key: item, label: item };
      if (item && typeof item === "object") {
        const obj = item as { key?: string; value?: string; label?: string; name?: string };
        const key = obj.key ?? obj.value;
        if (!key) return null;
        return { key, label: obj.label ?? obj.name ?? key };
      }
      return null;
    })
    .filter((o): o is TSelectOption => o !== null);
};

/** 从 options.selection_mode 推断单选 / 多选模式，兼容 selectionMode / multiple 等旧写法。 */
const getSelectionMode = (options: TTypeExtraField["options"]): "single" | "multiple" => {
  if (!options || typeof options !== "object" || Array.isArray(options)) return "single";
  const raw = options as { selection_mode?: unknown; selectionMode?: unknown; multiple?: unknown };
  const mode = raw.selection_mode ?? raw.selectionMode;
  if (mode === "multiple" || mode === "multi") return "multiple";
  if (raw.multiple === true) return "multiple";
  return "single";
};

const findValueForField = (values: TIssueExtraFieldValue[] | undefined, fieldId: string): unknown => {
  if (!values) return undefined;
  return values.find((v) => v.extra_field_id === fieldId)?.value;
};

const upsertValue = (
  values: TIssueExtraFieldValue[] | undefined,
  fieldId: string,
  fieldType: TIssueExtraFieldType,
  newValue: TIssueExtraFieldValue["value"]
): TIssueExtraFieldValue[] => {
  const next = [...(values ?? [])];
  const idx = next.findIndex((v) => v.extra_field_id === fieldId);
  if (idx >= 0) {
    next[idx] = { ...next[idx], value: newValue, field_type: fieldType };
  } else {
    next.push({ extra_field_id: fieldId, value: newValue, field_type: fieldType });
  }
  return next;
};

const isValueEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
};

const FIELD_TYPE_ICON: Record<TIssueExtraFieldType, React.ElementType> = {
  text: AlignLeft,
  number: Hash,
  select: ListChecks,
  boolean: ToggleLeft,
  date: CalendarDays,
  user: Users,
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
  const fieldType = field.field_type;
  const inputId = `extra-field-${field.id}`;

  const renderControl = () => {
    if (fieldType === "text") {
      return (
        <Input
          id={inputId}
          type="text"
          value={typeof value === "string" ? value : value == null ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.description || field.name}
          disabled={disabled}
          hasError={!!error}
          className="w-full"
        />
      );
    }

    if (fieldType === "number") {
      return (
        <Input
          id={inputId}
          type="number"
          value={value === null || value === undefined || value === "" ? "" : String(value)}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") {
              onChange(null);
              return;
            }
            const parsed = Number(raw);
            onChange(Number.isNaN(parsed) ? raw : parsed);
          }}
          placeholder={field.description || field.name}
          disabled={disabled}
          hasError={!!error}
          className="w-full"
        />
      );
    }

    if (fieldType === "boolean") {
      return (
        <div className="flex items-center gap-2">
          <ToggleSwitch
            value={value === true || value === "true" || value === 1}
            onChange={(checked) => onChange(checked)}
            disabled={disabled}
          />
          <span className="text-12 text-secondary">
            {value === true || value === "true" || value === 1 ? "是" : "否"}
          </span>
        </div>
      );
    }

    if (fieldType === "date") {
      const dateValue = typeof value === "string" || value instanceof Date ? getDate(value as string | Date) : undefined;
      return (
        <DateDropdown
          value={dateValue ?? null}
          onChange={(d) => onChange(d ? renderFormattedPayloadDate(d) ?? null : null)}
          placeholder={field.description || field.name}
          buttonVariant="border-with-text"
          buttonContainerClassName="w-full"
          buttonClassName="!h-[38px] !w-full !px-3 !py-2 !rounded !text-13"
          disabled={disabled}
        />
      );
    }

    if (fieldType === "select") {
      const selectOpts = getSelectOptions(field);
      const selectionMode = getSelectionMode(field.options);

      if (selectionMode === "multiple") {
        const currentArr: string[] = Array.isArray(value) ? (value as string[]) : [];
        const dropdownOptions: TDropdownOption[] = selectOpts.map((opt) => ({ value: opt.key, data: opt }));
        return (
          <MultiSelectDropdown
            value={currentArr}
            onChange={(next) => onChange(next)}
            options={dropdownOptions}
            keyExtractor={(opt) => opt.value}
            renderItem={({ value: optKey, selected }) => {
              const label = selectOpts.find((o) => o.key === optKey)?.label ?? optKey;
              return (
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-13">{label}</span>
                  {selected && <span className="text-primary text-11">✓</span>}
                </div>
              );
            }}
            buttonContent={(_isOpen, val) => {
              const arr = (val as string[] | undefined) ?? [];
              const labels = arr.map((k) => selectOpts.find((o) => o.key === k)?.label ?? k);
              return (
                <span className={cn("truncate text-13", { "text-tertiary": arr.length === 0 })}>
                  {arr.length === 0 ? field.description || "请选择" : labels.join(", ")}
                </span>
              );
            }}
            buttonContainerClassName={cn(
              "w-full rounded border-[0.5px] border-custom-border-300 px-3 py-2 text-left",
              { "border-danger-strong": !!error }
            )}
            disableSearch={selectOpts.length <= 8}
            disabled={disabled}
          />
        );
      }

      const selected = selectOpts.find((o) => o.key === value);
      return (
        <CustomSelect
          value={typeof value === "string" ? value : null}
          onChange={(next: string | null) => onChange(next)}
          label={
            <span className={cn("truncate text-13", { "text-tertiary": !selected })}>
              {selected ? selected.label : field.description || "请选择"}
            </span>
          }
          buttonClassName={cn("w-full", { "border-danger-strong": !!error })}
          input
          disabled={disabled}
        >
          {selectOpts.length === 0 ? (
            <div className="px-2 py-1.5 text-12 text-tertiary">暂无可选项</div>
          ) : (
            selectOpts.map((opt) => (
              <CustomSelect.Option key={opt.key} value={opt.key}>
                <span className="truncate">{opt.label}</span>
              </CustomSelect.Option>
            ))
          )}
        </CustomSelect>
      );
    }

    if (fieldType === "user") {
      const selectionMode = getSelectionMode(field.options);
      if (selectionMode === "multiple") {
        const currentArr: string[] = Array.isArray(value) ? (value as string[]) : value ? [value as string] : [];
        return (
          <MemberDropdown
            value={currentArr}
            onChange={(next) => onChange(next)}
            multiple={true}
            projectId={field.project_id ?? field.project ?? undefined}
            buttonVariant="border-with-text"
            buttonContainerClassName="w-full"
            buttonClassName="!h-[38px] !w-full !px-3 !py-2 !rounded !text-13"
            placeholder={field.description || "请选择负责人"}
            disabled={disabled}
          />
        );
      }
      return (
        <MemberDropdown
          value={typeof value === "string" ? value : null}
          onChange={(next) => onChange(next ?? null)}
          multiple={false}
          projectId={field.project_id ?? field.project ?? undefined}
          buttonVariant="border-with-text"
          buttonContainerClassName="w-full"
          buttonClassName="!h-[38px] !w-full !px-3 !py-2 !rounded !text-13"
          placeholder={field.description || "请选择负责人"}
          disabled={disabled}
        />
      );
    }

    return null;
  };

  const FieldIcon = FIELD_TYPE_ICON[fieldType] ?? AlignLeft;

  return (
    <div className="flex items-center gap-4 py-1.5">
      <label
        htmlFor={inputId}
        className="flex w-2/5 shrink-0 items-center gap-1.5 text-sm text-secondary"
      >
        <FieldIcon className="h-3.5 w-3.5 shrink-0 text-tertiary" strokeWidth={1.5} />
        <span className="truncate">{field.name}</span>
        {field.is_required && <span className="text-danger-strong">*</span>}
      </label>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {renderControl()}
        {error && <span className="text-11 text-danger-strong">{error}</span>}
      </div>
    </div>
  );
};

export const IssueExtraFields = observer(function IssueExtraFields(props: TIssueExtraFieldsProps) {
  const { control, workspaceSlug, projectId, issueTypeId, handleFormChange, disabled } = props;
  const { fields } = useIssueTypeExtraFields(workspaceSlug, projectId, issueTypeId);
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

  if (!fields || fields.length === 0) return null;

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
          <div>
            {requiredErrorMessage && (
              <p className="mb-1 text-11 text-danger-strong">{requiredErrorMessage}</p>
            )}
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
          </div>
        );
      }}
    />
  );
});
