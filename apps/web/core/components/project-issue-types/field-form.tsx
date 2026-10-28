/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * 工作项类型字段（属性）的表单：表单状态、字段 ↔ 表单互转、校验与请求体、行内编辑表单 UI。
 * 项目设置 / 模板中心的类型属性列表（行内表单）与通用字段库的编辑弹窗共用这一份，校验口径只有一处。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePopper } from "react-popper";
import {
  AlignLeft,
  CalendarDays,
  Check,
  ChevronDown,
  Hash,
  ListChecks,
  Plus,
  Search,
  ToggleLeft,
  Trash2,
  Users,
} from "lucide-react";
// plane imports
import { useOutsideClickDetector } from "@plane/hooks";
import { Button, Input, TextArea } from "@plane/ui";
import type { TTypeExtraField, TTypeExtraFieldPayload } from "@/services/project/project-issue-type.service";

/** 字段定义的公共部分：类型字段（TTypeExtraField）与字段库字段（TIssueFieldLibraryItem）都满足 */
export type TFieldDefinition = Pick<TTypeExtraField, "field_type" | "options" | "default_value"> & {
  name?: string | null;
  description?: string | null;
  is_required?: boolean;
  is_active?: boolean;
};

export type TFieldTypeOption = {
  value: TTypeExtraField["field_type"];
  label: string;
  rowLabel: string;
  icon: typeof AlignLeft;
};
const DEFAULT_FIELD_TYPE_OPTION: TFieldTypeOption = { value: "text", label: "文本", rowLabel: "文本", icon: AlignLeft };
const SELECT_FIELD_TYPE_OPTION: TFieldTypeOption = {
  value: "select",
  label: "下拉菜单",
  rowLabel: "下拉菜单",
  icon: ListChecks,
};
export const FIELD_TYPE_OPTIONS: TFieldTypeOption[] = [
  DEFAULT_FIELD_TYPE_OPTION,
  { value: "number", label: "数字", rowLabel: "数字", icon: Hash },
  SELECT_FIELD_TYPE_OPTION,
  { value: "boolean", label: "布尔值", rowLabel: "布尔值", icon: ToggleLeft },
  { value: "date", label: "日期", rowLabel: "日期", icon: CalendarDays },
  { value: "user", label: "成员选择器", rowLabel: "成员", icon: Users },
];

export const isSelectFieldType = (fieldType: TTypeExtraField["field_type"]) => fieldType === "select";

export const getTextMode = (options: TTypeExtraField["options"]): "single_line" | "paragraph" => {
  if (!options || typeof options !== "object" || Array.isArray(options)) return "single_line";
  return (options as { text_mode?: unknown }).text_mode === "paragraph" ? "paragraph" : "single_line";
};

function formatTextIsParagraphForForm(field: TFieldDefinition): boolean {
  return field.field_type === "text" && getTextMode(field.options) === "paragraph";
}

/**
 * 从 options 解析选择模式：select / user 共用 options.selection_mode 表达单/多选。
 * 兼容老字段中可能出现的 selectionMode / multiple: true 写法。
 */
export const getSelectionMode = (options: TTypeExtraField["options"]): "single" | "multiple" => {
  if (!options || typeof options !== "object" || Array.isArray(options)) return "single";
  const raw = options as { selection_mode?: unknown; selectionMode?: unknown; multiple?: unknown };
  const selectionMode = raw.selection_mode ?? raw.selectionMode;
  if (selectionMode === "multiple" || selectionMode === "multi") return "multiple";
  if (raw.multiple === true) return "multiple";
  return "single";
};

export const getFieldTypeOption = (fieldType: TTypeExtraField["field_type"]) =>
  FIELD_TYPE_OPTIONS.find((option) => option.value === fieldType) ?? DEFAULT_FIELD_TYPE_OPTION;

/** 字段行展示文案 */
export const getFieldRowLabel = (field: TFieldDefinition): string => {
  if (field.field_type === "text") return getTextMode(field.options) === "paragraph" ? "段落" : "单行";
  if (field.field_type === "select" && getSelectionMode(field.options) === "multiple") return "多选";
  return getFieldTypeOption(field.field_type).rowLabel;
};

export type TFieldFormState = {
  name: string;
  description: string;
  field_type: TTypeExtraField["field_type"];
  /** 仅当 field_type 为 text 时使用：true 表示段落模式 */
  text_is_paragraph: boolean;
  /** 仅当 field_type 为 number 时使用；空字符串表示不设置默认值 */
  number_default_value: string;
  /** 仅当 field_type 为 select 时使用 */
  select_options: string[];
  /** 仅当 field_type 为 select 时使用：true 表示多选 */
  select_is_multiple: boolean;
  select_default_value: string;
  select_default_values: string[];
  /** 仅当 field_type 为 user 时使用：true 表示多选 */
  user_is_multiple: boolean;
  is_required: boolean;
  is_active: boolean;
};

export const DEFAULT_FIELD_FORM: TFieldFormState = {
  name: "",
  description: "",
  field_type: "text",
  text_is_paragraph: false,
  number_default_value: "",
  select_options: [""],
  select_is_multiple: false,
  select_default_value: "",
  select_default_values: [],
  user_is_multiple: false,
  is_required: false,
  is_active: true,
};

function formatNumberFieldDefaultForForm(field: TFieldDefinition): string {
  if (field.field_type !== "number") return "";
  const v = field.default_value;
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? v.trim() : "";
  }
  return "";
}

function parseNumberFieldDefaultPayload(raw: string): { ok: true; value: number | null } | { ok: false } {
  const t = raw.trim();
  if (!t) return { ok: true, value: null };
  const n = Number(t);
  if (!Number.isFinite(n)) return { ok: false };
  return { ok: true, value: n };
}

function formatSelectOptionsForForm(field: TFieldDefinition): string[] {
  if (!isSelectFieldType(field.field_type)) return [""];

  const options = field.options;
  if (!options || typeof options !== "object" || Array.isArray(options)) return [""];

  const rawOptions =
    (options as { choices?: unknown; options?: unknown; values?: unknown }).choices ??
    (options as { options?: unknown }).options ??
    (options as { values?: unknown }).values;
  if (!Array.isArray(rawOptions)) return [""];

  const values = rawOptions.map((option) => String(option ?? "").trim()).filter(Boolean);
  return values.length > 0 ? values : [""];
}

/** 下拉字段的选项（展示用，不带表单里的空占位行） */
export const getSelectChoices = (field: TFieldDefinition): string[] => formatSelectOptionsForForm(field).filter(Boolean);

function formatSelectDefaultValueForForm(field: TFieldDefinition): string {
  if (field.field_type !== "select") return "";
  if (getSelectionMode(field.options) === "multiple") return "";
  return typeof field.default_value === "string" ? field.default_value : "";
}

function formatSelectDefaultValuesForForm(field: TFieldDefinition): string[] {
  if (field.field_type !== "select") return [];
  if (getSelectionMode(field.options) !== "multiple") return [];
  return Array.isArray(field.default_value) ? field.default_value.map((value) => String(value)) : [];
}

function formatSelectIsMultipleForForm(field: TFieldDefinition): boolean {
  if (field.field_type !== "select") return false;
  return getSelectionMode(field.options) === "multiple";
}

export function getNormalizedSelectOptions(values: string[]) {
  const options = values.map((value) => value.trim()).filter(Boolean);
  return Array.from(new Set(options));
}

function formatUserIsMultipleForForm(field: TFieldDefinition): boolean {
  if (field.field_type !== "user") return false;
  return getSelectionMode(field.options) === "multiple";
}

/** 已有属性 → 表单初值（编辑态） */
export function fieldToFormState(field: TFieldDefinition): TFieldFormState {
  return {
    name: field.name ?? "",
    description: field.description ?? "",
    field_type: field.field_type,
    text_is_paragraph: formatTextIsParagraphForForm(field),
    number_default_value: formatNumberFieldDefaultForForm(field),
    select_options: formatSelectOptionsForForm(field),
    select_is_multiple: formatSelectIsMultipleForForm(field),
    select_default_value: formatSelectDefaultValueForForm(field),
    select_default_values: formatSelectDefaultValuesForForm(field),
    user_is_multiple: formatUserIsMultipleForForm(field),
    is_required: field.is_required === true,
    is_active: field.is_active !== false,
  };
}

/** 切换字段类型：清掉只属于旧类型的表单项 */
export function changeFieldType(form: TFieldFormState, fieldType: TTypeExtraField["field_type"]): TFieldFormState {
  return {
    ...form,
    field_type: fieldType,
    ...(fieldType !== "text" ? { text_is_paragraph: false } : {}),
    ...(fieldType !== "number" ? { number_default_value: "" } : {}),
    ...(!isSelectFieldType(fieldType)
      ? { select_default_value: "", select_default_values: [], select_is_multiple: false }
      : {}),
    ...(fieldType !== "user" ? { user_is_multiple: false } : {}),
  };
}

/** 删掉第 index 个下拉选项，被删的选项若是默认值一并清掉；至少留一个空行 */
export function removeSelectOption(form: TFieldFormState, index: number): TFieldFormState {
  const removedOption = (form.select_options[index] ?? "").trim();
  const nextOptions = form.select_options.filter((_, optionIndex) => optionIndex !== index);
  return {
    ...form,
    select_options: nextOptions.length > 0 ? nextOptions : [""],
    select_default_value: form.select_default_value === removedOption ? "" : form.select_default_value,
    select_default_values: form.select_default_values.filter((value) => value !== removedOption),
  };
}

export type TFieldPayloadBase = Omit<TTypeExtraFieldPayload, "issue_type_id">;

/**
 * 表单 → 请求体（新建再补 issue_type_id）。校验不过返回给用户看的错误文案。
 * 项目设置的行内表单与模板中心的属性弹窗共用，校验口径只有这一份。
 */
export function buildFieldPayload(fieldForm: TFieldFormState): { error: string } | { payload: TFieldPayloadBase } {
  const name = fieldForm.name.trim();

  let numberDefaultPayload: number | null | undefined;
  if (fieldForm.field_type === "number") {
    const parsed = parseNumberFieldDefaultPayload(fieldForm.number_default_value);
    if (!parsed.ok) return { error: "默认值必须是有效数字，或留空表示不设默认值。" };
    numberDefaultPayload = parsed.value;
  }

  let selectOptionsPayload: { choices: string[]; selection_mode: "single" | "multiple" } | undefined;
  let selectDefaultPayload: string | string[] | null | undefined;
  if (isSelectFieldType(fieldForm.field_type)) {
    const filledOptions = fieldForm.select_options.map((option) => option.trim()).filter(Boolean);
    const selectOptions = getNormalizedSelectOptions(fieldForm.select_options);
    if (selectOptions.length === 0) return { error: "下拉菜单至少需要添加一个选项。" };
    if (filledOptions.length !== selectOptions.length) return { error: "下拉菜单选项不能重复。" };

    selectOptionsPayload = {
      choices: selectOptions,
      selection_mode: fieldForm.select_is_multiple ? "multiple" : "single",
    };
    selectDefaultPayload = fieldForm.select_is_multiple
      ? fieldForm.select_default_values.filter((value) => selectOptions.includes(value))
      : selectOptions.includes(fieldForm.select_default_value)
        ? fieldForm.select_default_value
        : null;
  }

  const textOptionsPayload =
    fieldForm.field_type === "text" ? { text_mode: fieldForm.text_is_paragraph ? "paragraph" : "single_line" } : undefined;

  const userOptionsPayload =
    fieldForm.field_type === "user" ? { selection_mode: fieldForm.user_is_multiple ? "multiple" : "single" } : undefined;

  return {
    payload: {
      name,
      description: fieldForm.description.trim(),
      field_type: fieldForm.field_type,
      is_required: fieldForm.is_required,
      is_active: fieldForm.is_active,
      ...(fieldForm.field_type === "text" ? { options: textOptionsPayload } : {}),
      ...(fieldForm.field_type === "number" ? { default_value: numberDefaultPayload ?? null } : {}),
      ...(isSelectFieldType(fieldForm.field_type)
        ? { options: selectOptionsPayload, default_value: selectDefaultPayload ?? null }
        : {}),
      ...(fieldForm.field_type === "user" ? { options: userOptionsPayload, default_value: null } : {}),
    },
  };
}

export function FieldTypeSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: TTypeExtraField["field_type"];
  onChange: (value: TTypeExtraField["field_type"]) => void;
  /** 为 true 时不可改类型（例如编辑已有属性） */
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  const [popoverWidth, setPopoverWidth] = useState<number | undefined>(undefined);
  const selectedOption = getFieldTypeOption(value);
  const SelectedIcon = selectedOption.icon;
  const filteredOptions = FIELD_TYPE_OPTIONS.filter((option) =>
    option.label.toLowerCase().includes(query.toLowerCase())
  );

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: "bottom-start",
    strategy: "fixed",
    modifiers: [
      {
        name: "preventOverflow",
        options: {
          padding: 12,
        },
      },
      {
        name: "offset",
        options: {
          offset: [0, 4],
        },
      },
    ],
  });

  useLayoutEffect(() => {
    if (isOpen && referenceElement) {
      setPopoverWidth(referenceElement.offsetWidth);
    }
  }, [isOpen, referenceElement]);

  useOutsideClickDetector(containerRef, () => setIsOpen(false), true);

  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
      setQuery("");
    }
  }, [disabled]);

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-xs font-medium text-secondary">属性类型</label>
      <button
        ref={setReferenceElement}
        type="button"
        disabled={disabled}
        title={disabled ? "编辑时不可修改属性类型" : undefined}
        className={`flex h-9 w-full items-center justify-between rounded-md border border-subtle bg-surface-1 px-3 text-left text-sm text-primary shadow-sm transition ${
          disabled ? "cursor-not-allowed opacity-60" : "hover:border-accent-primary/40"
        }`}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="flex items-center gap-2">
          <SelectedIcon className="size-3.5 text-tertiary" />
          {selectedOption.label}
        </span>
        <ChevronDown
          className={`size-3.5 text-tertiary transition-transform ${isOpen && !disabled ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen &&
        !disabled &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={setPopperElement}
            style={{ ...styles.popper, width: popoverWidth }}
            {...attributes.popper}
            data-prevent-outside-click
            className="z-50 rounded-lg border border-subtle bg-surface-1 p-2 shadow-raised-200"
          >
            <div className="mb-1.5 flex items-center gap-2 rounded-md border border-subtle px-2">
              <Search className="size-3.5 text-tertiary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="h-8 w-full bg-transparent text-xs outline-none placeholder:text-tertiary"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-primary transition hover:bg-layer-1-hover"
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                      setQuery("");
                    }}
                  >
                    <Icon className="size-3.5 text-tertiary" />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

/** 下拉单选：含「不设置」与上方选项列表，样式与 FieldTypeSelect 一致 */
export function SelectExtraFieldDefaultSingle({
  value,
  options,
  onChange,
  label = "默认值",
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  /** 传 null 不渲染自带的标签（外面自己排标签时） */
  label?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  const [popoverWidth, setPopoverWidth] = useState<number | undefined>(undefined);

  const rows = useMemo(() => [{ key: "", label: "不设置" }, ...options.map((o) => ({ key: o, label: o }))], [options]);
  const filteredRows = useMemo(
    () => rows.filter((row) => row.label.toLowerCase().includes(query.toLowerCase())),
    [rows, query]
  );
  const selectedLabel = value === "" ? "不设置" : value;

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: "bottom-start",
    strategy: "fixed",
    modifiers: [
      { name: "preventOverflow", options: { padding: 12 } },
      { name: "offset", options: { offset: [0, 4] } },
    ],
  });

  useLayoutEffect(() => {
    if (isOpen && referenceElement) {
      setPopoverWidth(referenceElement.offsetWidth);
    }
  }, [isOpen, referenceElement]);

  useOutsideClickDetector(containerRef, () => setIsOpen(false), true);

  return (
    <div ref={containerRef} className="relative">
      {label !== null && <label className="mb-1 block text-xs font-medium text-secondary">{label}</label>}
      <button
        ref={setReferenceElement}
        type="button"
        className="hover:border-accent-primary/40 flex h-9 w-full items-center justify-between gap-2 rounded-md border border-subtle bg-surface-1 px-3 text-left text-sm text-primary shadow-sm transition"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
        <ChevronDown className={`size-3.5 shrink-0 text-tertiary transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={setPopperElement}
            style={{ ...styles.popper, width: popoverWidth }}
            {...attributes.popper}
            data-prevent-outside-click
            className="z-50 rounded-lg border border-subtle bg-surface-1 p-2 shadow-raised-200"
          >
            <div className="mb-1.5 flex items-center gap-2 rounded-md border border-subtle px-2">
              <Search className="size-3.5 text-tertiary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="h-8 w-full bg-transparent text-xs outline-none placeholder:text-tertiary"
              />
            </div>
            <div className="max-h-48 overflow-y-auto">
              {filteredRows.map((row) => (
                <button
                  key={row.key === "" ? "__unset__" : row.key}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left text-sm text-primary transition hover:bg-layer-1-hover"
                  onClick={() => {
                    onChange(row.key);
                    setIsOpen(false);
                    setQuery("");
                  }}
                >
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  {value === row.key ? <Check className="size-3.5 shrink-0 text-accent-primary" /> : null}
                </button>
              ))}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

/** 多选下拉：按钮展示已选摘要，面板内勾选选项，顺序与上方选项列表一致 */
export function SelectExtraFieldDefaultMultiple({
  values,
  options,
  onChange,
  label = "默认值",
}: {
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
  /** 传 null 不渲染自带的标签（外面自己排标签时） */
  label?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  const [popoverWidth, setPopoverWidth] = useState<number | undefined>(undefined);

  const filteredOptions = useMemo(
    () => options.filter((o: string) => o.toLowerCase().includes(query.toLowerCase())),
    [options, query]
  );

  const buttonSummary = useMemo(() => {
    if (values.length === 0) return "不设置";
    return values.join("、");
  }, [values]);

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: "bottom-start",
    strategy: "fixed",
    modifiers: [
      { name: "preventOverflow", options: { padding: 12 } },
      { name: "offset", options: { offset: [0, 4] } },
    ],
  });

  useLayoutEffect(() => {
    if (isOpen && referenceElement) {
      setPopoverWidth(referenceElement.offsetWidth);
    }
  }, [isOpen, referenceElement]);

  useOutsideClickDetector(containerRef, () => setIsOpen(false), true);

  const toggleOption = (opt: string) => {
    const set = new Set(values);
    if (set.has(opt)) set.delete(opt);
    else set.add(opt);
    onChange(options.filter((o: string) => set.has(o)));
  };

  return (
    <div ref={containerRef} className="relative">
      {label !== null && <label className="mb-1 block text-xs font-medium text-secondary">{label}</label>}
      <button
        ref={setReferenceElement}
        type="button"
        className="hover:border-accent-primary/40 flex h-9 w-full items-center justify-between gap-2 rounded-md border border-subtle bg-surface-1 px-3 text-left text-sm text-primary shadow-sm transition"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="min-w-0 flex-1 truncate" title={values.length > 0 ? buttonSummary : undefined}>
          {buttonSummary}
        </span>
        <ChevronDown className={`size-3.5 shrink-0 text-tertiary transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={setPopperElement}
            style={{ ...styles.popper, width: popoverWidth }}
            {...attributes.popper}
            data-prevent-outside-click
            className="z-50 rounded-lg border border-subtle bg-surface-1 p-2 shadow-raised-200"
          >
            <div className="mb-1.5 flex items-center gap-2 rounded-md border border-subtle px-2">
              <Search className="size-3.5 text-tertiary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="h-8 w-full bg-transparent text-xs outline-none placeholder:text-tertiary"
              />
            </div>
            {values.length > 0 && (
              <button
                type="button"
                className="mb-1.5 w-full rounded-md px-2 py-1.5 text-left text-xs text-secondary transition hover:bg-layer-1-hover hover:text-primary"
                onClick={() => onChange([])}
              >
                清除已选默认值
              </button>
            )}
            <div className="max-h-48 overflow-y-auto">
              {filteredOptions.map((opt: string) => {
                const checked = values.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-primary transition hover:bg-layer-1-hover"
                    onClick={() => toggleOption(opt)}
                  >
                    {checked ? (
                      <Check className="size-3.5 shrink-0 text-accent-primary" />
                    ) : (
                      <span className="size-3.5 shrink-0 rounded border border-subtle" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate">{opt}</span>
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export function InlineFieldForm({
  form,
  isSubmitting,
  submitLabel = "创建",
  fieldTypeLocked = false,
  onChange,
  onCancel,
  onSubmit,
}: {
  form: TFieldFormState;
  isSubmitting: boolean;
  submitLabel?: string;
  /** 编辑已有属性时为 true，禁止修改属性类型 */
  fieldTypeLocked?: boolean;
  onChange: (form: TFieldFormState) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const selectOptions = getNormalizedSelectOptions(form.select_options);

  return (
    <div className="grid grid-cols-1 gap-0 divide-y divide-subtle rounded-lg border border-subtle bg-surface-1 md:grid-cols-[1fr_360px] md:divide-x md:divide-y-0">
      <div className="flex min-h-32 flex-col p-4">
        <Input
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          placeholder="标题"
          mode="true-transparent"
          className="text-lg! font-normal! text-secondary"
          autoFocus
        />
        <TextArea
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
          placeholder="描述"
          mode="true-transparent"
          className="mt-1 min-h-16 resize-none text-sm text-secondary"
        />
        <div className="mt-auto flex items-center gap-4 border-t border-subtle pt-3 text-xs text-secondary">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_required}
              onChange={(e) => onChange({ ...form, is_required: e.target.checked })}
              className="size-3.5 rounded border border-subtle"
            />
            必填属性
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => onChange({ ...form, is_active: e.target.checked })}
              className="size-3.5 rounded border border-subtle"
            />
            活动
          </label>
        </div>
      </div>
      <div className="flex min-h-0 flex-col gap-4 p-4">
        <div className="flex flex-col gap-3">
          <FieldTypeSelect
            value={form.field_type}
            disabled={fieldTypeLocked}
            onChange={(fieldType) => onChange(changeFieldType(form, fieldType))}
          />
          {form.field_type === "text" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">属性</label>
              <div className="flex items-center gap-4 text-xs text-secondary">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={!form.text_is_paragraph}
                    onChange={() => onChange({ ...form, text_is_paragraph: false })}
                    className="size-3.5"
                  />
                  单行
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={form.text_is_paragraph}
                    onChange={() => onChange({ ...form, text_is_paragraph: true })}
                    className="size-3.5"
                  />
                  段落
                </label>
              </div>
            </div>
          )}
          {form.field_type === "number" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">默认值</label>
              <Input
                type="number"
                inputMode="decimal"
                value={form.number_default_value}
                onChange={(e) => onChange({ ...form, number_default_value: e.target.value })}
                placeholder="可选，留空表示无默认值"
                className="w-full"
              />
            </div>
          )}
          {isSelectFieldType(form.field_type) && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-secondary">属性</label>
                <div className="flex items-center gap-4 text-xs text-secondary">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      checked={!form.select_is_multiple}
                      onChange={() => onChange({ ...form, select_is_multiple: false, select_default_values: [] })}
                      className="size-3.5"
                    />
                    单选
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      checked={form.select_is_multiple}
                      onChange={() => onChange({ ...form, select_is_multiple: true, select_default_value: "" })}
                      className="size-3.5"
                    />
                    多选
                  </label>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-secondary">选项</label>
                <div className="space-y-2">
                  {form.select_options.map((option, index) => (
                    <div key={index} className="flex min-w-0 items-center gap-2">
                      <Input
                        value={option}
                        onChange={(e) => {
                          const nextOptions = [...form.select_options];
                          nextOptions[index] = e.target.value;
                          onChange({ ...form, select_options: nextOptions });
                        }}
                        placeholder="添加选项"
                        className="min-w-0 flex-1"
                      />
                      {form.select_options.length > 1 && (
                        <button
                          type="button"
                          className="rounded p-1 text-tertiary transition hover:bg-layer-1-hover hover:text-danger-primary"
                          onClick={() => onChange(removeSelectOption(form, index))}
                          aria-label="删除选项"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent-primary"
                  onClick={() => onChange({ ...form, select_options: [...form.select_options, ""] })}
                >
                  <Plus className="size-3" />
                  添加选项
                </button>
              </div>

              {selectOptions.length > 0 &&
                (!form.select_is_multiple ? (
                  <SelectExtraFieldDefaultSingle
                    value={form.select_default_value}
                    options={selectOptions}
                    onChange={(select_default_value) => onChange({ ...form, select_default_value })}
                  />
                ) : (
                  <SelectExtraFieldDefaultMultiple
                    values={form.select_default_values}
                    options={selectOptions}
                    onChange={(select_default_values) => onChange({ ...form, select_default_values })}
                  />
                ))}
            </div>
          )}
          {form.field_type === "user" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">属性</label>
              <div className="flex items-center gap-4 text-xs text-secondary">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={!form.user_is_multiple}
                    onChange={() => onChange({ ...form, user_is_multiple: false })}
                    className="size-3.5"
                  />
                  单选
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={form.user_is_multiple}
                    onChange={() => onChange({ ...form, user_is_multiple: true })}
                    className="size-3.5"
                  />
                  多选
                </label>
              </div>
            </div>
          )}
        </div>
        <div className="mt-auto flex justify-end gap-2 border-t border-subtle pt-3">
          <Button variant="neutral-primary" size="sm" onClick={onCancel} disabled={isSubmitting}>
            取消
          </Button>
          <Button variant="primary" size="sm" onClick={onSubmit} loading={isSubmitting} disabled={!form.name.trim()}>
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
