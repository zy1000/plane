/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react";
import { usePopper } from "react-popper";
import {
  AlignLeft,
  CalendarDays,
  Check,
  ChevronDown,
  GripVertical,
  Hash,
  Layers,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ToggleLeft,
  Trash2,
  Users,
} from "lucide-react";
// plane imports
import { PROJECT_SETTINGS } from "@plane/constants";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import {
  AlertModalCore,
  Button,
  EModalPosition,
  EModalWidth,
  Input,
  ModalCore,
  TextArea,
  ToggleSwitch,
} from "@plane/ui";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import {
  getRandomTypeIconOption,
  getTypeIconOption,
  TypeIcon,
  TypeIconPicker,
  toTypeIconProps,
} from "@/components/common/type-icon-picker";
import type { TTypeIconOption } from "@/components/common/type-icon-picker";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { IssueTypeCategorySelect } from "@/components/workspace/settings/issue-type-categories/issue-type-category-select";
// hooks
import { useIssueTypeCategories } from "@/hooks/store/use-issue-type-categories";
import { useProject } from "@/hooks/store/use-project";
import { useProjectIssueTypeFields } from "@/hooks/store/use-project-issue-type-fields";
import { useProjectIssueTypes } from "@/hooks/store/use-project-issue-types";
import { useUserPermissions } from "@/hooks/store/user";
import type {
  TIssueType,
  TTypeExtraField,
  TTypeExtraFieldPayload,
} from "@/services/project/project-issue-type.service";
// local imports
import type { Route } from "./+types/page";
import { IssueTypesProjectSettingsHeader } from "./header";

/** 与 ModalCore 离场动画（duration-200）对齐，关闭后再清空编辑态，避免关闭过程中闪成「创建」表单 */
const WORK_ITEM_TYPE_MODAL_LEAVE_MS = 220;

type TFieldTypeOption = {
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
const FIELD_TYPE_OPTIONS: TFieldTypeOption[] = [
  DEFAULT_FIELD_TYPE_OPTION,
  { value: "number", label: "数字", rowLabel: "数字", icon: Hash },
  SELECT_FIELD_TYPE_OPTION,
  { value: "boolean", label: "布尔值", rowLabel: "布尔值", icon: ToggleLeft },
  { value: "date", label: "日期", rowLabel: "日期", icon: CalendarDays },
  { value: "user", label: "成员选择器", rowLabel: "成员", icon: Users },
];

const isSelectFieldType = (fieldType: TTypeExtraField["field_type"]) => fieldType === "select";

const getTextMode = (options: TTypeExtraField["options"]): "single_line" | "paragraph" => {
  if (!options || typeof options !== "object" || Array.isArray(options)) return "single_line";
  return (options as { text_mode?: unknown }).text_mode === "paragraph" ? "paragraph" : "single_line";
};

function formatTextIsParagraphForForm(field: TTypeExtraField): boolean {
  return field.field_type === "text" && getTextMode(field.options) === "paragraph";
}

/**
 * 从 options 解析选择模式：select / user 共用 options.selection_mode 表达单/多选。
 * 兼容老字段中可能出现的 selectionMode / multiple: true 写法。
 */
const getSelectionMode = (options: TTypeExtraField["options"]): "single" | "multiple" => {
  if (!options || typeof options !== "object" || Array.isArray(options)) return "single";
  const raw = options as { selection_mode?: unknown; selectionMode?: unknown; multiple?: unknown };
  const selectionMode = raw.selection_mode ?? raw.selectionMode;
  if (selectionMode === "multiple" || selectionMode === "multi") return "multiple";
  if (raw.multiple === true) return "multiple";
  return "single";
};

const getFieldTypeOption = (fieldType: TTypeExtraField["field_type"]) =>
  FIELD_TYPE_OPTIONS.find((option) => option.value === fieldType) ?? DEFAULT_FIELD_TYPE_OPTION;

/** 字段行展示文案 */
const getFieldRowLabel = (field: TTypeExtraField): string => {
  if (field.field_type === "text") return getTextMode(field.options) === "paragraph" ? "段落" : "单行";
  if (field.field_type === "select" && getSelectionMode(field.options) === "multiple") return "多选";
  return getFieldTypeOption(field.field_type).rowLabel;
};

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return fallback;
  if ("msg" in error && typeof error.msg === "string") return error.msg;
  if ("detail" in error && typeof error.detail === "string") return error.detail;

  const [firstValue] = Object.values(error as Record<string, unknown>);
  if (typeof firstValue === "string") return firstValue;
  if (Array.isArray(firstValue) && typeof firstValue[0] === "string") return firstValue[0];

  return fallback;
};

const StatusBadge = ({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: "neutral" | "danger" | "blue" | "success";
}) => {
  const toneClassName = {
    neutral: "border border-subtle bg-surface-2 text-secondary",
    danger: "border-0 bg-danger-subtle/35 text-danger-primary",
    blue: "border border-accent-primary/30 bg-accent-primary/10 text-accent-primary",
    success: "border-0 bg-success-subtle/35 text-success-primary",
  }[tone];

  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${toneClassName}`}>
      {children}
    </span>
  );
};

type TMoreMenuItem = {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  tone?: "default" | "danger";
  onClick: () => void;
};

function MoreMenu({ items, title = "更多操作" }: { items: TMoreMenuItem[]; title?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);

  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    placement: "bottom-end",
    strategy: "fixed",
    modifiers: [
      { name: "preventOverflow", options: { padding: 12 } },
      { name: "offset", options: { offset: [0, 4] } },
    ],
  });

  useOutsideClickDetector(containerRef, () => setIsOpen(false), true);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={setReferenceElement}
        type="button"
        className="rounded-md p-1.5 text-tertiary transition hover:bg-layer-1-hover hover:text-primary"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        title={title}
      >
        <MoreHorizontal className="size-4" />
      </button>
      {isOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={setPopperElement}
            style={styles.popper}
            {...attributes.popper}
            data-prevent-outside-click
            className="z-50 min-w-36 overflow-hidden rounded-md border border-subtle bg-surface-1 p-1 shadow-raised-200"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                disabled={item.disabled}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition ${
                  item.tone === "danger"
                    ? "text-danger-primary hover:bg-danger-subtle"
                    : "text-primary hover:bg-layer-1-hover"
                } ${item.disabled ? "cursor-not-allowed opacity-50" : ""}`}
                onClick={() => {
                  if (item.disabled) return;
                  setIsOpen(false);
                  item.onClick();
                }}
              >
                {item.icon}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}

const WorkItemTypeIcon = ({ issueType, className = "" }: { issueType?: Partial<TIssueType>; className?: string }) => (
  <TypeIcon iconProps={issueType?.logo_props?.icon} className={className} />
);

type TDeleteTarget = { kind: "issueType"; issueType: TIssueType } | { kind: "field"; field: TTypeExtraField };

type TFieldFormState = {
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

const DEFAULT_FIELD_FORM: TFieldFormState = {
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

function formatNumberFieldDefaultForForm(field: TTypeExtraField): string {
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

function formatSelectOptionsForForm(field: TTypeExtraField): string[] {
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

function formatSelectDefaultValueForForm(field: TTypeExtraField): string {
  if (field.field_type !== "select") return "";
  if (getSelectionMode(field.options) === "multiple") return "";
  return typeof field.default_value === "string" ? field.default_value : "";
}

function formatSelectDefaultValuesForForm(field: TTypeExtraField): string[] {
  if (field.field_type !== "select") return [];
  if (getSelectionMode(field.options) !== "multiple") return [];
  return Array.isArray(field.default_value) ? field.default_value.map((value) => String(value)) : [];
}

function formatSelectIsMultipleForForm(field: TTypeExtraField): boolean {
  if (field.field_type !== "select") return false;
  return getSelectionMode(field.options) === "multiple";
}

function getNormalizedSelectOptions(values: string[]) {
  const options = values.map((value) => value.trim()).filter(Boolean);
  return Array.from(new Set(options));
}

function formatUserIsMultipleForForm(field: TTypeExtraField): boolean {
  if (field.field_type !== "user") return false;
  return getSelectionMode(field.options) === "multiple";
}

function FieldTypeSelect({
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
function SelectExtraFieldDefaultSingle({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
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
      <label className="mb-1 block text-xs font-medium text-secondary">默认值</label>
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
function SelectExtraFieldDefaultMultiple({
  values,
  options,
  onChange,
}: {
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
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
      <label className="mb-1 block text-xs font-medium text-secondary">默认值</label>
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

function InlineFieldForm({
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
            onChange={(fieldType) =>
              onChange({
                ...form,
                field_type: fieldType,
                ...(fieldType !== "text" ? { text_is_paragraph: false } : {}),
                ...(fieldType !== "number" ? { number_default_value: "" } : {}),
                ...(!isSelectFieldType(fieldType)
                  ? { select_default_value: "", select_default_values: [], select_is_multiple: false }
                  : {}),
                ...(fieldType !== "user" ? { user_is_multiple: false } : {}),
              })
            }
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
                          onClick={() => {
                            const removedOption = option.trim();
                            const nextOptions = form.select_options.filter((_, optionIndex) => optionIndex !== index);
                            onChange({
                              ...form,
                              select_options: nextOptions.length > 0 ? nextOptions : [""],
                              select_default_value:
                                form.select_default_value === removedOption ? "" : form.select_default_value,
                              select_default_values: form.select_default_values.filter(
                                (value) => value !== removedOption
                              ),
                            });
                          }}
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

function WorkItemTypeModal({
  isOpen,
  isSubmitting,
  onClose,
  onSubmit,
  editingIssueType,
  workspaceSlug,
}: {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<TIssueType>) => Promise<void>;
  editingIssueType?: TIssueType | null;
  workspaceSlug: string;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [iconOption, setIconOption] = useState<TTypeIconOption>(getRandomTypeIconOption);
  const [categoryId, setCategoryId] = useState<number | string | null>(null);
  const { categories, isLoading: isCategoriesLoading, fetchCategories } = useIssueTypeCategories(workspaceSlug);

  useEffect(() => {
    if (!isOpen) return;
    if (editingIssueType) {
      setName(editingIssueType.name ?? "");
      setDescription(editingIssueType.description ?? "");
      setIconOption(getTypeIconOption(editingIssueType?.logo_props?.icon));
      setCategoryId(editingIssueType.category_id ?? null);
    } else {
      setName("");
      setDescription("");
      setIconOption(getRandomTypeIconOption());
      setCategoryId(null);
    }
    setIsIconPickerOpen(false);
    fetchCategories();
  }, [isOpen, editingIssueType?.id, fetchCategories]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    if (categoryId === null || categoryId === undefined || categoryId === "") {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "校验失败",
        message: "请选择工作项类型的类别。",
      });
      return;
    }

    await onSubmit({
      name: name.trim(),
      description: description.trim(),
      logo_props: { icon: toTypeIconProps(iconOption) },
      category_id: categoryId,
    });
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={onClose}
      position={EModalPosition.CENTER}
      width={EModalWidth.XXL}
      className="overflow-visible border border-subtle"
    >
      <form onSubmit={handleSubmit} className="p-5">
        <h3 className="text-lg font-semibold text-primary">
          {editingIssueType ? t("project_settings.issue_types.edit_title") : "创建工作项类型"}
        </h3>
        <div className="relative mt-4 flex items-end gap-2">
          <TypeIconPicker
            value={iconOption}
            isOpen={isIconPickerOpen}
            onChange={setIconOption}
            onToggle={setIsIconPickerOpen}
          />
          <div className="min-w-0 flex-1 rounded-lg border border-subtle bg-surface-1">
            <Input
              name="issue-type-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="为此工作项类型取一个独特的名称"
              mode="true-transparent"
              className="h-9 w-full px-2.5 py-0 text-sm leading-normal"
              required
              maxLength={255}
              pattern=".*\S.*"
              title="请输入工作项类型名称"
              autoFocus
            />
          </div>
          <div className="flex w-44 shrink-0 flex-col gap-1">
            <label className="text-xs font-medium text-secondary">
              类别<span className="ml-0.5 text-danger-primary">*</span>
            </label>
            <IssueTypeCategorySelect
              value={categoryId}
              categories={categories}
              isLoading={isCategoriesLoading}
              onChange={setCategoryId}
            />
          </div>
        </div>
        <TextArea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="描述此工作项类型的用途和使用时机。"
          className="mt-3 min-h-24 resize-none rounded-lg border border-subtle bg-surface-1 text-sm"
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="neutral-primary" size="sm" onClick={onClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            type="submit"
            loading={isSubmitting}
            disabled={
              isSubmitting || !name.trim() || categoryId === null || categoryId === undefined || categoryId === ""
            }
          >
            {editingIssueType ? t("update") : t("project_settings.issue_types.add")}
          </Button>
        </div>
      </form>
    </ModalCore>
  );
}

function IssueTypesSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  // store
  const { currentProjectDetails } = useProject();
  const { workspaceUserInfo, allowProjectPermissionKeys } = useUserPermissions();
  const {
    issueTypes,
    isLoading: issueTypesLoading,
    createIssueType,
    updateIssueType,
    deleteIssueType,
  } = useProjectIssueTypes(workspaceSlug, projectId);
  const {
    fields,
    isLoading: fieldsLoading,
    createField,
    updateField,
    deleteField,
  } = useProjectIssueTypeFields(workspaceSlug, projectId);
  // translation
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | undefined>();
  const [addingFieldFor, setAddingFieldFor] = useState<string | undefined>();
  const [editingField, setEditingField] = useState<TTypeExtraField | undefined>();
  const [fieldForm, setFieldForm] = useState<TFieldFormState>(DEFAULT_FIELD_FORM);
  const [isFieldSubmitting, setIsFieldSubmitting] = useState(false);
  const inlineFormRef = useRef<HTMLDivElement>(null);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [editingIssueType, setEditingIssueType] = useState<TIssueType | undefined>();
  const [isTypeSubmitting, setIsTypeSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TDeleteTarget | undefined>();
  const [isDeleting, setIsDeleting] = useState(false);
  const { categories: issueTypeCategories, fetchCategories: fetchIssueTypeCategories } =
    useIssueTypeCategories(workspaceSlug);

  const issueTypeCategoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of issueTypeCategories) {
      map.set(String(c.id), c.name);
    }
    return map;
  }, [issueTypeCategories]);

  useEffect(() => {
    if (!workspaceSlug) return;
    void fetchIssueTypeCategories();
  }, [workspaceSlug, fetchIssueTypeCategories]);

  useEffect(() => {
    if (isTypeModalOpen) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setEditingIssueType(undefined);
    }, WORK_ITEM_TYPE_MODAL_LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [isTypeModalOpen]);
  // derived values
  const settingsDetails = PROJECT_SETTINGS.issue_types;
  const pageTitle = currentProjectDetails?.name
    ? `${currentProjectDetails.name} - ${t(settingsDetails.i18n_label)}`
    : undefined;
  const canView = allowProjectPermissionKeys(settingsDetails.permissionKeys ?? [], workspaceSlug, projectId);
  const canEdit = allowProjectPermissionKeys(settingsDetails.editPermissionKeys ?? [], workspaceSlug, projectId);
  const fieldsByIssueTypeId = useMemo(() => {
    const groupedFields: Record<string, TTypeExtraField[]> = {};
    (fields ?? []).forEach((field) => {
      if (!groupedFields[field.issue_type_id]) groupedFields[field.issue_type_id] = [];
      groupedFields[field.issue_type_id].push(field);
    });
    return groupedFields;
  }, [fields]);

  const resetFieldForm = () => {
    setAddingFieldFor(undefined);
    setEditingField(undefined);
    setFieldForm(DEFAULT_FIELD_FORM);
  };

  const openCreateFieldForm = (issueTypeId: string) => {
    if (!canEdit) return;
    setAddingFieldFor(issueTypeId);
    setEditingField(undefined);
    setFieldForm(DEFAULT_FIELD_FORM);
  };

  const openEditFieldForm = (field: TTypeExtraField) => {
    if (!canEdit) return;
    setAddingFieldFor(field.issue_type_id);
    setEditingField(field);
    setFieldForm({
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
    });
  };

  useEffect(() => {
    if (!addingFieldFor) return;
    inlineFormRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [addingFieldFor]);

  const issueTypeIdsKey = useMemo(
    () =>
      issueTypes?.length
        ? [...issueTypes]
            .map((t) => t.id)
            .sort()
            .join(",")
        : "",
    [issueTypes]
  );

  useEffect(() => {
    if (!issueTypes?.length) {
      setExpandedId(undefined);
      return;
    }
    setExpandedId((prev) => {
      if (prev !== undefined && issueTypes.some((t) => t.id === prev)) return prev;
      return undefined;
    });
  }, [issueTypeIdsKey, issueTypes]);

  const handleCreateIssueType = async (data: Partial<TIssueType>) => {
    if (!canEdit) return;
    setIsTypeSubmitting(true);
    try {
      const createdIssueType = await createIssueType(data);
      if (createdIssueType) {
        setExpandedId(createdIssueType.id);
        setIsTypeModalOpen(false);
      }
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "创建失败",
        message: getApiErrorMessage(error, "无法创建工作项类型，请稍后重试。"),
      });
    } finally {
      setIsTypeSubmitting(false);
    }
  };

  const handleUpdateIssueType = async (data: Partial<TIssueType>) => {
    if (!editingIssueType || !canEdit) return;
    setIsTypeSubmitting(true);
    try {
      await updateIssueType(editingIssueType.id, data);
      setIsTypeModalOpen(false);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "更新失败",
        message: getApiErrorMessage(error, "无法更新工作项类型，请稍后重试。"),
      });
    } finally {
      setIsTypeSubmitting(false);
    }
  };

  const handleToggleIssueType = async (issueType: TIssueType, isActive: boolean) => {
    if (issueType.is_default || !canEdit) return;

    try {
      await updateIssueType(issueType.id, { is_active: isActive });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "更新失败",
        message: getApiErrorMessage(error, "无法更新工作项类型状态，请稍后重试。"),
      });
    }
  };

  const requestDeleteIssueType = (issueType: TIssueType) => {
    if (issueType.is_default || !canEdit) return;
    setDeleteTarget({ kind: "issueType", issueType });
  };

  const handleSubmitField = async (issueTypeId: string) => {
    if (!canEdit) return;
    const name = fieldForm.name.trim();
    if (!name) return;

    let numberDefaultPayload: number | null | undefined;
    if (fieldForm.field_type === "number") {
      const parsed = parseNumberFieldDefaultPayload(fieldForm.number_default_value);
      if (!parsed.ok) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "校验失败",
          message: "默认值必须是有效数字，或留空表示不设默认值。",
        });
        return;
      }
      numberDefaultPayload = parsed.value;
    }

    let selectOptionsPayload: { choices: string[]; selection_mode: "single" | "multiple" } | undefined;
    let selectDefaultPayload: string | string[] | null | undefined;
    if (isSelectFieldType(fieldForm.field_type)) {
      const filledOptions = fieldForm.select_options.map((option) => option.trim()).filter(Boolean);
      const selectOptions = getNormalizedSelectOptions(fieldForm.select_options);

      if (selectOptions.length === 0) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "校验失败",
          message: "下拉菜单至少需要添加一个选项。",
        });
        return;
      }

      if (filledOptions.length !== selectOptions.length) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "校验失败",
          message: "下拉菜单选项不能重复。",
        });
        return;
      }

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
      fieldForm.field_type === "text"
        ? { text_mode: fieldForm.text_is_paragraph ? "paragraph" : "single_line" }
        : undefined;

    const userOptionsPayload =
      fieldForm.field_type === "user"
        ? {
            selection_mode: fieldForm.user_is_multiple ? "multiple" : "single",
          }
        : undefined;

    setIsFieldSubmitting(true);
    try {
      if (editingField) {
        await updateField(editingField.id, {
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
        });
      } else {
        const payload: TTypeExtraFieldPayload = {
          issue_type_id: issueTypeId,
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
        };
        await createField(payload);
      }
      resetFieldForm();
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: editingField ? "更新失败" : "创建失败",
        message: getApiErrorMessage(
          error,
          editingField ? "无法更新自定义属性，请稍后重试。" : "无法创建自定义属性，请检查名称是否重复。"
        ),
      });
    } finally {
      setIsFieldSubmitting(false);
    }
  };

  const requestDeleteField = (field: TTypeExtraField) => {
    if (!canEdit) return;
    setDeleteTarget({ kind: "field", field });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget || !canEdit) return;
    setIsDeleting(true);
    try {
      if (deleteTarget.kind === "issueType") {
        await deleteIssueType(deleteTarget.issueType.id);
        if (expandedId === deleteTarget.issueType.id) setExpandedId(undefined);
      } else {
        await deleteField(deleteTarget.field.id);
        if (editingField?.id === deleteTarget.field.id) resetFieldForm();
      }
      setDeleteTarget(undefined);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "删除失败",
        message: getApiErrorMessage(
          error,
          deleteTarget.kind === "issueType"
            ? "该工作项类型可能正在使用中，暂时无法删除。"
            : "无法删除自定义属性，请稍后重试。"
        ),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<IssueTypesProjectSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className="w-full">
        <SettingsHeading
          title={t("project_settings.issue_types.heading")}
          description={t("project_settings.issue_types.description")}
          control={
            <Button
              variant="primary"
              size="sm"
              prependIcon={<Plus className="size-3.5" />}
              onClick={() => {
                setEditingIssueType(undefined);
                setIsTypeModalOpen(true);
              }}
              disabled={!canEdit}
            >
              {t("project_settings.issue_types.add")}
            </Button>
          }
        />

        <div className="mt-6 w-full">
          {issueTypesLoading ? (
            <div className="rounded-lg border border-subtle p-6 text-sm text-secondary">正在加载工作项类型...</div>
          ) : !issueTypes?.length ? (
            <div className="rounded-lg border border-dashed border-subtle px-6 py-12 text-center">
              <WorkItemTypeIcon className="mx-auto size-12" />
              <h3 className="mt-4 text-sm font-semibold text-primary">暂无工作项类型</h3>
              <p className="mt-1 text-sm text-secondary">创建第一个工作项类型后，可以继续添加专属属性。</p>
              <Button
                variant="primary"
                size="sm"
                className="mx-auto mt-4"
                onClick={() => {
                  setEditingIssueType(undefined);
                  setIsTypeModalOpen(true);
                }}
                disabled={!canEdit}
              >
                {t("project_settings.issue_types.add")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-subtle">
              {issueTypes?.map((issueType) => {
                const isExpanded = expandedId === issueType.id;
                const typeFields = fieldsByIssueTypeId[issueType.id] ?? [];
                const categoryDisplayName =
                  issueType.category_name?.trim() ||
                  (issueType.category_id !== null && issueType.category_id !== undefined && issueType.category_id !== ""
                    ? issueTypeCategoryNameById.get(String(issueType.category_id))
                    : undefined);

                return (
                  <div key={issueType.id} className="py-1.5 first:pt-0 last:pb-0">
                    <div
                      className={`-mx-3 rounded-md px-3 transition-colors ${
                        isExpanded ? "bg-layer-1-hover" : "hover:bg-layer-1-hover"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-4 py-3">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          onClick={() => setExpandedId(isExpanded ? undefined : issueType.id)}
                        >
                          <ChevronDown
                            className={`size-4 shrink-0 text-tertiary transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`}
                          />
                          <WorkItemTypeIcon issueType={issueType} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-primary">{issueType.name}</span>
                            {issueType.description?.trim() ? (
                              <span className="block truncate text-xs text-secondary">
                                {issueType.description.trim()}
                              </span>
                            ) : null}
                          </span>
                        </button>
                        <div className="flex shrink-0 items-center gap-3">
                          {categoryDisplayName ? <StatusBadge tone="neutral">{categoryDisplayName}</StatusBadge> : null}
                          {issueType.is_default ? <StatusBadge tone="blue">默认</StatusBadge> : null}
                          {issueType.is_active === false ? (
                            <StatusBadge tone="danger">已禁用</StatusBadge>
                          ) : !issueType.is_default ? (
                            <StatusBadge tone="success">活动</StatusBadge>
                          ) : null}
                          {!issueType.is_default && (
                            <ToggleSwitch
                              value={issueType.is_active !== false}
                              onChange={(value) => handleToggleIssueType(issueType, value)}
                              size="sm"
                              disabled={!canEdit}
                            />
                          )}
                          <MoreMenu
                            items={[
                              {
                                label: t("edit"),
                                icon: <Pencil className="size-3.5 shrink-0 text-tertiary" strokeWidth={2} />,
                                disabled: !canEdit,
                                onClick: () => {
                                  setEditingIssueType(issueType);
                                  setIsTypeModalOpen(true);
                                },
                              },
                              {
                                label: "删除",
                                disabled: issueType.is_default || !canEdit,
                                tone: "danger",
                                icon: <Trash2 className="size-3.5 shrink-0" strokeWidth={2} />,
                                onClick: () => requestDeleteIssueType(issueType),
                              },
                            ]}
                          />
                        </div>
                      </div>

                      <div
                        className={`grid transition-all duration-300 ease-in-out ${
                          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                        }`}
                      >
                        <div className="min-h-0 overflow-hidden">
                          <div className="border-t border-subtle">
                            {addingFieldFor === issueType.id || typeFields.length > 0 ? (
                              <div className="p-4">
                                <div className="mb-3 text-sm font-medium text-primary">属性</div>

                                {(typeFields.length > 0 || addingFieldFor === issueType.id) && (
                                  <div className="mb-4 space-y-2">
                                    {typeFields.map((field) => {
                                      const isEditingThisRow =
                                        addingFieldFor === issueType.id && editingField?.id === field.id;
                                      if (isEditingThisRow) {
                                        return (
                                          <div key={field.id} ref={inlineFormRef}>
                                            <InlineFieldForm
                                              form={fieldForm}
                                              isSubmitting={isFieldSubmitting}
                                              submitLabel="更新"
                                              fieldTypeLocked
                                              onChange={setFieldForm}
                                              onCancel={resetFieldForm}
                                              onSubmit={() => handleSubmitField(issueType.id)}
                                            />
                                          </div>
                                        );
                                      }
                                      return (
                                        <div
                                          key={field.id}
                                          className="hover:border-primary/40 flex items-center gap-3 rounded-md border border-strong px-3 py-2.5 text-sm transition hover:bg-layer-1-hover"
                                        >
                                          <GripVertical className="size-4 shrink-0 text-tertiary" />
                                          <span className="min-w-0 flex-1 truncate font-medium text-primary">
                                            {field.name}
                                          </span>
                                          <span className="text-xs text-secondary">{getFieldRowLabel(field)}</span>
                                          {field.is_active === false ? (
                                            <StatusBadge tone="danger">已禁用</StatusBadge>
                                          ) : (
                                            <StatusBadge tone="success">活动</StatusBadge>
                                          )}
                                          <MoreMenu
                                            items={[
                                              {
                                                label: "编辑",
                                                icon: (
                                                  <Pencil className="size-3.5 shrink-0 text-tertiary" strokeWidth={2} />
                                                ),
                                                disabled: !canEdit,
                                                onClick: () => openEditFieldForm(field),
                                              },
                                              {
                                                label: "删除",
                                                disabled: !canEdit,
                                                tone: "danger",
                                                icon: <Trash2 className="size-3.5 shrink-0" strokeWidth={2} />,
                                                onClick: () => requestDeleteField(field),
                                              },
                                            ]}
                                          />
                                        </div>
                                      );
                                    })}
                                    {addingFieldFor === issueType.id && !editingField && (
                                      <div ref={inlineFormRef}>
                                        <InlineFieldForm
                                          form={fieldForm}
                                          isSubmitting={isFieldSubmitting}
                                          submitLabel="创建"
                                          onChange={setFieldForm}
                                          onCancel={resetFieldForm}
                                          onSubmit={() => handleSubmitField(issueType.id)}
                                        />
                                      </div>
                                    )}
                                  </div>
                                )}

                                {addingFieldFor !== issueType.id && (
                                  <Button
                                    variant="neutral-primary"
                                    size="sm"
                                    prependIcon={<Plus className="size-3" />}
                                    onClick={() => openCreateFieldForm(issueType.id)}
                                    disabled={!canEdit}
                                  >
                                    添加新属性
                                  </Button>
                                )}
                                {fieldsLoading && <p className="mt-2 text-xs text-secondary">正在同步属性...</p>}
                              </div>
                            ) : (
                              <div className="mb-3 flex w-full flex-col items-center justify-center rounded-md bg-surface-1 py-10 text-center">
                                <div className="border-accent-primary/40 flex size-14 items-center justify-center rounded-lg border bg-accent-primary/10 text-accent-primary">
                                  <Layers className="size-7" strokeWidth={2} />
                                </div>
                                <h3 className="mt-4 text-sm font-semibold text-primary">添加自定义属性</h3>
                                <p className="mt-1 text-sm text-secondary">
                                  您为此工作项类型添加的新属性将显示在此处。
                                </p>
                                <Button
                                  variant="neutral-primary"
                                  size="sm"
                                  className="mt-4"
                                  prependIcon={<Plus className="size-3" />}
                                  onClick={() => openCreateFieldForm(issueType.id)}
                                  disabled={!canEdit}
                                >
                                  添加新属性
                                </Button>
                                {fieldsLoading && <p className="mt-2 text-xs text-secondary">正在同步属性...</p>}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <WorkItemTypeModal
          isOpen={isTypeModalOpen}
          isSubmitting={isTypeSubmitting}
          editingIssueType={editingIssueType}
          workspaceSlug={workspaceSlug}
          onClose={() => setIsTypeModalOpen(false)}
          onSubmit={async (data) => {
            if (editingIssueType) {
              await handleUpdateIssueType(data);
            } else {
              await handleCreateIssueType(data);
            }
          }}
        />
        <AlertModalCore
          isOpen={!!deleteTarget}
          isSubmitting={isDeleting}
          variant="danger"
          title={deleteTarget?.kind === "field" ? "删除自定义属性" : "删除工作项类型"}
          primaryButtonText={{ loading: "删除中", default: "删除" }}
          secondaryButtonText="取消"
          content={
            deleteTarget ? (
              <>
                确定要删除{deleteTarget.kind === "field" ? "自定义属性" : "工作项类型"}
                <span className="font-medium text-primary">
                  「{deleteTarget.kind === "field" ? deleteTarget.field.name : deleteTarget.issueType.name}」
                </span>
                吗？此操作不可撤销。
              </>
            ) : (
              ""
            )
          }
          handleClose={() => {
            if (!isDeleting) setDeleteTarget(undefined);
          }}
          handleSubmit={handleConfirmDelete}
        />
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(IssueTypesSettingsPage);
