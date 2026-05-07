/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AlignLeft, CalendarDays, Hash, ListChecks, ToggleLeft, Users } from "lucide-react";
// types
import type { TIssueExtraFieldType, TIssueExtraFieldValue } from "@plane/types";
// ui
import { ChevronDownIcon } from "@plane/propel/icons";
import { CustomSelect, Input, MultiSelectDropdown, ToggleSwitch } from "@plane/ui";
import type { TDropdownOption } from "@plane/ui";
// components
import { DateDropdown } from "@/components/dropdowns/date";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// services
import type { TTypeExtraField } from "@/services/project/project-issue-type.service";
// utils
import { cn, getDate, renderFormattedPayloadDate } from "@plane/utils";

// ─── Helpers ────────────────────────────────────────────────────────────────

type TSelectOption = { key: string; label: string };

export const getSelectOptions = (field: TTypeExtraField): TSelectOption[] => {
  const opts = field.options as unknown;
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

export const getSelectionMode = (options: TTypeExtraField["options"]): "single" | "multiple" => {
  if (!options || typeof options !== "object" || Array.isArray(options)) return "single";
  const raw = options as { selection_mode?: unknown; selectionMode?: unknown; multiple?: unknown };
  const mode = raw.selection_mode ?? raw.selectionMode;
  if (mode === "multiple" || mode === "multi") return "multiple";
  if (raw.multiple === true) return "multiple";
  return "single";
};

export const findValueForField = (values: TIssueExtraFieldValue[] | undefined, fieldId: string): unknown => {
  if (!values) return undefined;
  return values.find((v) => v.extra_field_id === fieldId)?.value;
};

export const upsertValue = (
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

export const isValueEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
};

export const FIELD_TYPE_ICON: Record<TIssueExtraFieldType, React.ElementType> = {
  text: AlignLeft,
  number: Hash,
  select: ListChecks,
  boolean: ToggleLeft,
  date: CalendarDays,
  user: Users,
};

// ─── ExtraFieldControl ────────────────────────────────────────────────────────

type TExtraFieldControlProps = {
  field: TTypeExtraField;
  value: unknown;
  error?: string;
  onChange: (next: TIssueExtraFieldValue["value"]) => void;
  disabled?: boolean;
  /**
   * compact=true — sidebar style: transparent button, h-7.5, no border on normal state.
   * compact=false (default) — modal style: border-with-text, h-[38px].
   */
  compact?: boolean;
};

export const ExtraFieldControl = (props: TExtraFieldControlProps) => {
  const { field, value, onChange, disabled, error, compact = false } = props;
  const fieldType = field.field_type;
  const inputId = `extra-field-${field.id}`;

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
        className={cn("w-full", compact && "h-7.5 border-transparent bg-transparent px-2 py-1 text-body-xs-regular hover:border-subtle focus:border-subtle")}
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
        className={cn("w-full", compact && "h-7.5 border-transparent bg-transparent px-2 py-1 text-body-xs-regular hover:border-subtle focus:border-subtle")}
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
    const dateValue =
      typeof value === "string" || value instanceof Date ? getDate(value as string | Date) : undefined;
    const hasDate = Boolean(dateValue);
    const drop = (
      <DateDropdown
        className={cn(compact && "group w-full min-w-0")}
        value={dateValue ?? null}
        onChange={(d) => onChange(d ? (renderFormattedPayloadDate(d) ?? null) : null)}
        placeholder={field.description || field.name}
        buttonVariant={compact ? "transparent-with-text" : "border-with-text"}
        buttonContainerClassName={cn("w-full", compact && "max-w-full text-left h-7.5 rounded-sm")}
        buttonClassName={
          compact
            ? "justify-between gap-1.5 !h-7.5 !w-full !px-1.5 !py-0 text-body-xs-medium"
            : "!h-[38px] !w-full !px-3 !py-2 !rounded !text-13"
        }
        labelClassName={cn(compact && !hasDate && "text-placeholder")}
        dropdownArrow={compact}
        dropdownArrowClassName={
          compact ? "hidden !h-3.5 !w-3.5 group-hover:inline" : undefined
        }
        disabled={disabled}
      />
    );
    return compact ? <div className="flex min-w-0 flex-1 items-center">{drop}</div> : drop;
  }

  if (fieldType === "select") {
    const selectOpts = getSelectOptions(field);
    const selectionMode = getSelectionMode(field.options);

    if (selectionMode === "multiple") {
      const currentArr: string[] = Array.isArray(value) ? (value as string[]) : [];
      const dropdownOptions: TDropdownOption[] = selectOpts.map((opt) => ({ value: opt.key, data: opt }));
      const multi = (
        <MultiSelectDropdown
          containerClassName={compact ? "group relative min-w-0 w-full flex-1" : undefined}
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
            const empty = arr.length === 0;
            return (
              <span className="flex w-full min-w-0 items-center justify-between gap-1.5">
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    compact ? "text-body-xs-medium" : "text-13",
                    compact && empty && "text-placeholder",
                    !compact && empty && "text-tertiary"
                  )}
                >
                  {empty ? field.description || "请选择" : labels.join(", ")}
                </span>
                {compact && (
                  <ChevronDownIcon
                    className="hidden h-3.5 w-3.5 shrink-0 text-secondary group-hover:inline"
                    aria-hidden
                  />
                )}
              </span>
            );
          }}
          buttonContainerClassName={cn(
            "w-full rounded border-[0.5px] text-left",
            compact
              ? "h-7.5 border-transparent !px-1.5 !py-0 hover:border-subtle"
              : "border-custom-border-300 px-3 py-2",
            { "border-danger-strong": !!error }
          )}
          disableSearch={selectOpts.length <= 8}
          disabled={disabled}
        />
      );
      return compact ? <div className="flex min-w-0 flex-1 items-center">{multi}</div> : multi;
    }

    const selected = selectOpts.find((o) => o.key === value);
    const selectControl = (
      <CustomSelect
        className={compact ? "group relative min-w-0 w-full text-left" : undefined}
        value={typeof value === "string" ? value : null}
        onChange={(next: string | null) => onChange(next)}
        label={
          <span
            className={cn("min-w-0 truncate", compact ? "text-body-xs-medium" : "text-13", {
              "text-placeholder": compact && !selected,
              "text-tertiary": !compact && !selected,
            })}
          >
            {selected ? selected.label : field.description || "请选择"}
          </span>
        }
        buttonClassName={cn(
          compact
            ? cn(
                "w-full min-w-0 justify-between gap-1.5 !h-7.5 rounded-sm border-transparent bg-layer-transparent !px-1.5 !py-0 text-body-xs-medium hover:border-transparent hover:bg-layer-transparent-hover focus-visible:bg-layer-transparent-active",
                error && "border border-danger-strong hover:border-danger-strong"
              )
            : cn("w-full", { "border-danger-strong": !!error })
        )}
        chevronClassName={
          compact ? "h-3.5 w-3.5 hidden group-hover:inline" : undefined
        }
        input={!compact}
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
    return compact ? <div className="flex min-w-0 flex-1 items-center">{selectControl}</div> : selectControl;
  }

  if (fieldType === "user") {
    const selectionMode = getSelectionMode(field.options);
    if (selectionMode === "multiple") {
      const currentArr: string[] = Array.isArray(value) ? (value as string[]) : value ? [value as string] : [];
      const userEmpty = currentArr.length === 0;
      const multiUser = (
        <MemberDropdown
          className={cn(compact && "group w-full min-w-0")}
          value={currentArr}
          onChange={(next) => onChange(next)}
          multiple={true}
          projectId={field.project_id ?? field.project ?? undefined}
          buttonVariant={compact ? "transparent-with-text" : "border-with-text"}
          buttonContainerClassName={cn("w-full", compact && "max-w-full text-left h-7.5 rounded-sm")}
          buttonClassName={cn(
            compact
              ? "justify-between gap-1.5 !h-7.5 !w-full !px-1.5 !py-0 text-body-xs-medium"
              : "!h-[38px] !w-full !px-3 !py-2 !rounded !text-13"
          )}
          labelClassName={cn(compact && userEmpty && "text-placeholder")}
          dropdownArrow={compact}
          dropdownArrowClassName={compact ? "hidden h-3.5 w-3.5 group-hover:inline" : undefined}
          placeholder={field.description || "请选择负责人"}
          disabled={disabled}
        />
      );
      return compact ? <div className="flex min-w-0 flex-1 items-center">{multiUser}</div> : multiUser;
    }
    const singleValue = typeof value === "string" ? value : null;
    const userEmpty = !singleValue;
    const singleUser = (
      <MemberDropdown
        className={cn(compact && "group w-full min-w-0")}
        value={singleValue}
        onChange={(next) => onChange(next ?? null)}
        multiple={false}
        projectId={field.project_id ?? field.project ?? undefined}
        buttonVariant={compact ? "transparent-with-text" : "border-with-text"}
        buttonContainerClassName={cn("w-full", compact && "max-w-full text-left h-7.5 rounded-sm")}
        buttonClassName={cn(
          compact
            ? "justify-between gap-1.5 !h-7.5 !w-full !px-1.5 !py-0 text-body-xs-medium"
            : "!h-[38px] !w-full !px-3 !py-2 !rounded !text-13"
        )}
        labelClassName={cn(compact && userEmpty && "text-placeholder")}
        dropdownArrow={compact}
        dropdownArrowClassName={compact ? "hidden h-3.5 w-3.5 group-hover:inline" : undefined}
        placeholder={field.description || "请选择负责人"}
        disabled={disabled}
      />
    );
    return compact ? <div className="flex min-w-0 flex-1 items-center">{singleUser}</div> : singleUser;
  }

  return null;
};
