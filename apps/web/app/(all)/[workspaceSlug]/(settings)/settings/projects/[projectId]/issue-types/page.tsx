/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FC, FormEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { observer } from "mobx-react";
import { usePopper } from "react-popper";
import * as LucideIcons from "lucide-react";
import {
  AlignLeft,
  CalendarDays,
  Check,
  ChevronDown,
  CircleDot,
  GripVertical,
  Hash,
  Layers,
  Layers3,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  ToggleLeft,
  Trash2,
  Type,
  Users,
} from "lucide-react";
// plane imports
import { PROJECT_SETTINGS } from "@plane/constants";
import { useOutsideClickDetector } from "@plane/hooks";
import { useTranslation } from "@plane/i18n";
import { LUCIDE_ICONS_LIST } from "@plane/propel/emoji-icon-picker";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore, Button, EModalPosition, EModalWidth, Input, ModalCore, TextArea, ToggleSwitch } from "@plane/ui";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useProjectIssueTypeFields } from "@/hooks/store/use-project-issue-type-fields";
import { useProjectIssueTypes } from "@/hooks/store/use-project-issue-types";
import { useUserPermissions } from "@/hooks/store/user";
import type { TIssueType, TTypeExtraField, TTypeExtraFieldPayload } from "@/services/project/project-issue-type.service";
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
type TLucideIcon = FC<{ className?: string; strokeWidth?: number }>;

const DEFAULT_FIELD_TYPE_OPTION: TFieldTypeOption = { value: "text", label: "文本", rowLabel: "单行", icon: AlignLeft };
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

const TYPE_ICON_BACKGROUND = "#FFFFFF";
const DEFAULT_TYPE_ICON_OPTION = { name: "Layers3", icon: Layers3, color: "#2563EB", background: TYPE_ICON_BACKGROUND };
const TYPE_ICON_OPTIONS = [
  DEFAULT_TYPE_ICON_OPTION,
  { name: "CircleDot", icon: CircleDot, color: "#7C3AED", background: TYPE_ICON_BACKGROUND },
  { name: "Type", icon: Type, color: "#059669", background: TYPE_ICON_BACKGROUND },
];
const TYPE_ICON_COLOR_OPTIONS = [
  "#0284C7",
  "#E11D48",
  "#EF4444",
  "#F97316",
  "#0F766E",
  "#3B82F6",
  "#4F46E5",
  "#6D28D9",
  "#6B7280",
];
const TYPE_ICON_ALIASES: Record<string, TLucideIcon> = {
  layers: Layers3,
  target: CircleDot,
  type: Type,
};

const isSelectFieldType = (fieldType: TTypeExtraField["field_type"]) => fieldType === "select";

/**
 * 从 options 解析选择模式：select / user 共用 options.selection_mode 表达单/多选。
 * 兼容老字段中可能出现的 selectionMode / multiple: true 写法。
 */
const getSelectionMode = (options: TTypeExtraField["options"]): "single" | "multiple" => {
  if (!options || typeof options !== "object" || Array.isArray(options)) return "single";
  const raw = (options as { selection_mode?: unknown; selectionMode?: unknown; multiple?: unknown });
  const selectionMode = raw.selection_mode ?? raw.selectionMode;
  if (selectionMode === "multiple" || selectionMode === "multi") return "multiple";
  if (raw.multiple === true) return "multiple";
  return "single";
};

const getFieldTypeOption = (fieldType: TTypeExtraField["field_type"]) =>
  FIELD_TYPE_OPTIONS.find((option) => option.value === fieldType) ?? DEFAULT_FIELD_TYPE_OPTION;

/** 字段行展示文案：仅 select 多选会替换为「多选」，其余沿用属性类型原始 rowLabel。 */
const getFieldRowLabel = (field: TTypeExtraField): string => {
  if (field.field_type === "select" && getSelectionMode(field.options) === "multiple") return "多选";
  return getFieldTypeOption(field.field_type).rowLabel;
};

const getLucideIcon = (iconName?: string) =>
  iconName
    ? (TYPE_ICON_ALIASES[iconName] ??
      (LucideIcons as Record<string, TLucideIcon | undefined>)[iconName] ??
      DEFAULT_TYPE_ICON_OPTION.icon)
    : DEFAULT_TYPE_ICON_OPTION.icon;

const isUtilityClass = (value?: string) => !!value && !value.startsWith("#") && !value.startsWith("rgb") && !value.startsWith("hsl");

const getTypeIconOption = (issueType?: Partial<TIssueType>) => {
  const iconProps = issueType?.logo_props?.icon;
  return {
    name: iconProps?.name ?? DEFAULT_TYPE_ICON_OPTION.name,
    icon: getLucideIcon(iconProps?.name),
    color: iconProps?.color ?? DEFAULT_TYPE_ICON_OPTION.color,
    background: TYPE_ICON_BACKGROUND,
  };
};

type TTypeIconOption = ReturnType<typeof getTypeIconOption>;

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

const StatusBadge = ({ children, tone = "neutral" }: { children: string; tone?: "neutral" | "danger" | "blue" }) => {
  const toneClassName = {
    neutral: "border-subtle bg-surface-2 text-secondary",
    danger: "border-danger-strong/40 bg-danger-subtle text-danger-primary",
    blue: "border-accent-primary/30 bg-accent-primary/10 text-accent-primary",
  }[tone];

  return (
    <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${toneClassName}`}>
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

const WorkItemTypeIcon = ({ issueType, className = "" }: { issueType?: Partial<TIssueType>; className?: string }) => {
  const iconOption = getTypeIconOption(issueType);
  const Icon = iconOption.icon;
  const colorClassName = isUtilityClass(iconOption.color) ? iconOption.color : "";
  const iconStyle = colorClassName ? undefined : { color: iconOption.color };

  return (
    <span
      className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${colorClassName} ${className}`}
      style={iconStyle}
    >
      <Icon className="size-4" />
    </span>
  );
};

function WorkItemTypeIconPicker({
  value,
  isOpen,
  onChange,
  onToggle,
}: {
  value: TTypeIconOption;
  isOpen: boolean;
  onChange: (value: TTypeIconOption) => void;
  onToggle: (isOpen: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const Icon = value.icon;
  const selectedColor = value.color;
  const filteredIcons = useMemo(
    () => LUCIDE_ICONS_LIST.filter((icon) => icon.name.toLowerCase().includes(query.trim().toLowerCase())),
    [query]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  useOutsideClickDetector(containerRef, () => onToggle(false), true);

  const handleColorChange = (color: string) => onChange({ ...value, color, background: TYPE_ICON_BACKGROUND });

  const handleIconChange = (iconName: string, icon: TLucideIcon) => {
    onChange({ ...value, name: iconName, icon });
    onToggle(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-primary transition hover:bg-layer-1-hover"
        onClick={() => onToggle(!isOpen)}
        aria-label="选择图标"
      >
        <Icon className="size-5" style={{ color: selectedColor }} strokeWidth={2} />
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 w-80 rounded-lg border border-subtle bg-surface-1 p-3 shadow-raised-200">
          <div className="mb-3 flex h-9 items-center gap-2 rounded-lg bg-surface-2 px-3">
            <Search className="size-4 text-tertiary" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="h-full w-full bg-transparent text-sm text-primary outline-none placeholder:text-tertiary"
            />
          </div>
          <p className="mb-2 text-xs text-secondary">Choose icon color</p>
          <div className="mb-4 flex flex-wrap gap-2">
            {TYPE_ICON_COLOR_OPTIONS.map((color) => {
              const isSelected = color === selectedColor;
              return (
                <button
                  key={color}
                  type="button"
                  className="flex size-5 items-center justify-center rounded-full"
                  style={{ backgroundColor: color }}
                  onClick={() => handleColorChange(color)}
                  aria-label="选择图标颜色"
                >
                  {isSelected && <Check className="size-3 text-white" />}
                </button>
              );
            })}
            <label className="relative flex size-5 cursor-pointer items-center justify-center rounded-full border border-subtle conical-gradient">
              <input
                type="color"
                value={selectedColor}
                onChange={(e) => handleColorChange(e.target.value)}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
                aria-label="自定义图标颜色"
              />
            </label>
          </div>
          <p className="mb-2 text-xs text-secondary">Pick icon</p>
          <div className="grid max-h-44 grid-cols-8 gap-1 overflow-y-auto pr-1">
            {filteredIcons.map((icon) => {
              const IconOption = icon.element as TLucideIcon;
              return (
                <button
                  key={icon.name}
                  type="button"
                  className="flex size-8 items-center justify-center rounded-md text-tertiary transition hover:bg-layer-1-hover hover:text-primary"
                  onClick={() => handleIconChange(icon.name, IconOption)}
                  title={icon.name}
                >
                  <IconOption className="size-4" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

type TDeleteTarget =
  | { kind: "issueType"; issueType: TIssueType }
  | { kind: "field"; field: TTypeExtraField };

type TFieldFormState = {
  name: string;
  description: string;
  field_type: TTypeExtraField["field_type"];
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

  const rawOptions = (options as { choices?: unknown; options?: unknown; values?: unknown }).choices ??
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
}: {
  value: TTypeExtraField["field_type"];
  onChange: (value: TTypeExtraField["field_type"]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);
  const [popperElement, setPopperElement] = useState<HTMLDivElement | null>(null);
  const [popoverWidth, setPopoverWidth] = useState<number | undefined>(undefined);
  const selectedOption = getFieldTypeOption(value);
  const SelectedIcon = selectedOption.icon;
  const filteredOptions = FIELD_TYPE_OPTIONS.filter((option) => option.label.toLowerCase().includes(query.toLowerCase()));

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

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1 block text-xs font-medium text-secondary">属性类型</label>
      <button
        ref={setReferenceElement}
        type="button"
        className="flex h-9 w-full items-center justify-between rounded-md border border-subtle bg-surface-1 px-3 text-left text-sm text-primary shadow-sm transition hover:border-accent-primary/40"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="flex items-center gap-2">
          <SelectedIcon className="size-3.5 text-tertiary" />
          {selectedOption.label}
        </span>
        <ChevronDown className={`size-3.5 text-tertiary transition-transform ${isOpen ? "rotate-180" : ""}`} />
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

function InlineFieldForm({
  form,
  isSubmitting,
  submitLabel = "创建",
  onChange,
  onCancel,
  onSubmit,
}: {
  form: TFieldFormState;
  isSubmitting: boolean;
  submitLabel?: string;
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
            onChange={(fieldType) =>
              onChange({
                ...form,
                field_type: fieldType,
                ...(fieldType !== "number" ? { number_default_value: "" } : {}),
                ...(!isSelectFieldType(fieldType)
                  ? { select_default_value: "", select_default_values: [], select_is_multiple: false }
                  : {}),
                ...(fieldType !== "user" ? { user_is_multiple: false } : {}),
              })
            }
          />
          {form.field_type === "number" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-secondary">默认值</label>
              <Input
                type="number"
                inputMode="decimal"
                value={form.number_default_value}
                onChange={(e) => onChange({ ...form, number_default_value: e.target.value })}
                placeholder="可选，留空表示无默认值"
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
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={option}
                        onChange={(e) => {
                          const nextOptions = [...form.select_options];
                          nextOptions[index] = e.target.value;
                          onChange({ ...form, select_options: nextOptions });
                        }}
                        placeholder="添加选项"
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
                              select_default_values: form.select_default_values.filter((value) => value !== removedOption),
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

              {selectOptions.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-secondary">默认值</label>
                  {!form.select_is_multiple ? (
                    <div className="space-y-1.5 text-xs text-secondary">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          checked={!form.select_default_value}
                          onChange={() => onChange({ ...form, select_default_value: "" })}
                          className="size-3.5"
                        />
                        不设置
                      </label>
                      {selectOptions.map((option) => (
                        <label key={option} className="flex items-center gap-2">
                          <input
                            type="radio"
                            checked={form.select_default_value === option}
                            onChange={() => onChange({ ...form, select_default_value: option })}
                            className="size-3.5"
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1.5 text-xs text-secondary">
                      {selectOptions.map((option) => (
                        <label key={option} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={form.select_default_values.includes(option)}
                            onChange={(e) =>
                              onChange({
                                ...form,
                                select_default_values: e.target.checked
                                  ? [...form.select_default_values, option]
                                  : form.select_default_values.filter((value) => value !== option),
                              })
                            }
                            className="size-3.5"
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
}: {
  isOpen: boolean;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<TIssueType>) => Promise<void>;
  editingIssueType?: TIssueType | null;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [iconOption, setIconOption] = useState<TTypeIconOption>(TYPE_ICON_OPTIONS[1] ?? DEFAULT_TYPE_ICON_OPTION);

  useEffect(() => {
    if (!isOpen) return;
    if (editingIssueType) {
      setName(editingIssueType.name ?? "");
      setDescription(editingIssueType.description ?? "");
      setIconOption(getTypeIconOption(editingIssueType));
    } else {
      setName("");
      setDescription("");
      setIconOption(TYPE_ICON_OPTIONS[1] ?? DEFAULT_TYPE_ICON_OPTION);
    }
    setIsIconPickerOpen(false);
  }, [isOpen, editingIssueType?.id]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;

    await onSubmit({
      name: name.trim(),
      description: description.trim(),
      logo_props: {
        icon: {
          name: iconOption.name,
          color: iconOption.color,
          background_color: iconOption.background,
        },
      },
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
        <div className="relative mt-4 flex items-center gap-2">
          <WorkItemTypeIconPicker
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
          <Button variant="primary" size="sm" type="submit" loading={isSubmitting} disabled={isSubmitting}>
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
  const { fields, isLoading: fieldsLoading, createField, updateField, deleteField } = useProjectIssueTypeFields(
    workspaceSlug,
    projectId
  );
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
  const pageTitle = currentProjectDetails?.name ? `${currentProjectDetails.name} - ${t(settingsDetails.i18n_label)}` : undefined;
  const canView = allowProjectPermissionKeys(settingsDetails.permissionKeys ?? [], workspaceSlug, projectId);
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
    setAddingFieldFor(issueTypeId);
    setEditingField(undefined);
    setFieldForm(DEFAULT_FIELD_FORM);
  };

  const openEditFieldForm = (field: TTypeExtraField) => {
    setAddingFieldFor(field.issue_type_id);
    setEditingField(field);
    setFieldForm({
      name: field.name ?? "",
      description: field.description ?? "",
      field_type: field.field_type,
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
    () => (issueTypes?.length ? [...issueTypes].map((t) => t.id).sort().join(",") : ""),
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
    if (!editingIssueType) return;
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
    if (issueType.is_default) return;

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
    if (issueType.is_default) return;
    setDeleteTarget({ kind: "issueType", issueType });
  };

  const handleSubmitField = async (issueTypeId: string) => {
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
        message: getApiErrorMessage(error, editingField ? "无法更新自定义属性，请稍后重试。" : "无法创建自定义属性，请检查名称是否重复。"),
      });
    } finally {
      setIsFieldSubmitting(false);
    }
  };

  const requestDeleteField = (field: TTypeExtraField) => {
    setDeleteTarget({ kind: "field", field });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
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

  const handleToggleField = async (field: TTypeExtraField) => {
    try {
      await updateField(field.id, { is_active: field.is_active === false });
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "更新失败",
        message: getApiErrorMessage(error, "无法更新属性状态，请稍后重试。"),
      });
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
              >
                {t("project_settings.issue_types.add")}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-subtle">
              {issueTypes?.map((issueType) => {
                const isExpanded = expandedId === issueType.id;
                const typeFields = fieldsByIssueTypeId[issueType.id] ?? [];
                const fieldsForList =
                  editingField && addingFieldFor === issueType.id
                    ? typeFields.filter((f) => f.id !== editingField.id)
                    : typeFields;

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
                          <span className="block truncate text-xs text-secondary">{issueType.description.trim()}</span>
                        ) : null}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-3">
                      {issueType.is_default ? (
                        <StatusBadge tone="blue">默认</StatusBadge>
                      ) : issueType.is_active === false ? (
                        <StatusBadge tone="danger">已禁用</StatusBadge>
                      ) : null}
                      {!issueType.is_default && (
                        <ToggleSwitch
                          value={issueType.is_active !== false}
                          onChange={(value) => handleToggleIssueType(issueType, value)}
                          size="sm"
                        />
                      )}
                      <MoreMenu
                        items={[
                          {
                            label: t("edit"),
                            icon: <Pencil className="size-3.5 shrink-0 text-tertiary" strokeWidth={2} />,
                            onClick: () => {
                              setEditingIssueType(issueType);
                              setIsTypeModalOpen(true);
                            },
                          },
                          {
                            label: "删除",
                            disabled: issueType.is_default,
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

                            {fieldsForList.length > 0 && (
                              <div className="mb-4 space-y-2">
                                {fieldsForList.map((field) => (
                                    <div
                                      key={field.id}
                                      className="flex items-center gap-3 rounded-md border border-strong px-3 py-2.5 text-sm transition hover:border-primary/40 hover:bg-layer-1-hover"
                                    >
                                      <GripVertical className="size-4 shrink-0 text-tertiary" />
                                      <span className="min-w-0 flex-1 truncate font-medium text-primary">{field.name}</span>
                                      <span className="text-xs text-secondary">{getFieldRowLabel(field)}</span>
                                      {field.is_active === false && <StatusBadge tone="danger">已禁用</StatusBadge>}
                                      <MoreMenu
                                        items={[
                                          {
                                            label: "编辑",
                                            icon: <Pencil className="size-3.5 shrink-0 text-tertiary" strokeWidth={2} />,
                                            onClick: () => openEditFieldForm(field),
                                          },
                                          {
                                            label: field.is_active === false ? "启用属性" : "禁用属性",
                                            onClick: () => handleToggleField(field),
                                          },
                                          {
                                            label: "删除",
                                            tone: "danger",
                                            icon: <Trash2 className="size-3.5 shrink-0" strokeWidth={2} />,
                                            onClick: () => requestDeleteField(field),
                                          },
                                        ]}
                                      />
                                    </div>
                                  ))}
                              </div>
                            )}

                            {addingFieldFor === issueType.id ? (
                              <div ref={inlineFormRef}>
                              <InlineFieldForm
                                form={fieldForm}
                                isSubmitting={isFieldSubmitting}
                                submitLabel={editingField ? "更新" : "创建"}
                                onChange={setFieldForm}
                                onCancel={resetFieldForm}
                                onSubmit={() => handleSubmitField(issueType.id)}
                              />
                              </div>
                            ) : (
                              <Button
                                variant="neutral-primary"
                                size="sm"
                                prependIcon={<Plus className="size-3" />}
                                onClick={() => openCreateFieldForm(issueType.id)}
                              >
                                添加新属性
                              </Button>
                            )}
                            {fieldsLoading && <p className="mt-2 text-xs text-secondary">正在同步属性...</p>}
                          </div>
                        ) : (
                          <div className="mb-3 flex w-full flex-col items-center justify-center rounded-md bg-surface-1 py-10 text-center">
                            <div className="flex size-14 items-center justify-center rounded-lg border border-accent-primary/40 bg-accent-primary/10 text-accent-primary">
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
