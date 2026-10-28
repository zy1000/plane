/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { AlignLeft, CalendarDays, CircleChevronDown, Hash, ToggleLeft, Type, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
// plane imports
import { cn } from "@plane/utils";
// components
import { TypeIcon } from "@/components/common/type-icon-picker";
import type { TTypeIconProps } from "@/components/common/type-icon-picker";
// local imports
import { getSelectChoices, getSelectionMode, getTextMode } from "./field-form";
import type { TFieldDefinition } from "./field-form";

/**
 * 字段的只读展示（类型图标、类型名、选项摘要、默认值、类型标签）：通用字段库页与「从字段库添加」弹窗共用。
 */

/** 按字段类型筛选的分类，文本的单行 / 多行合成一类；顺序即筛选项顺序 */
export const FIELD_KIND_FILTERS: { value: TFieldDefinition["field_type"]; label: string }[] = [
  { value: "select", label: "下拉" },
  { value: "text", label: "文本" },
  { value: "user", label: "人员" },
  { value: "date", label: "日期" },
  { value: "number", label: "数字" },
  { value: "boolean", label: "是/否" },
];

const isParagraph = (field: TFieldDefinition) => field.field_type === "text" && getTextMode(field.options) === "paragraph";
const isMultiple = (field: TFieldDefinition) => getSelectionMode(field.options) === "multiple";

export const getFieldKindIcon = (field: TFieldDefinition): LucideIcon => {
  switch (field.field_type) {
    case "select":
      return CircleChevronDown;
    case "text":
      return isParagraph(field) ? AlignLeft : Type;
    case "user":
      return Users;
    case "date":
      return CalendarDays;
    case "number":
      return Hash;
    case "boolean":
      return ToggleLeft;
    default:
      return Type;
  }
};

export const getFieldKindLabel = (field: TFieldDefinition): string => {
  switch (field.field_type) {
    case "select":
      return isMultiple(field) ? "下拉多选" : "下拉单选";
    case "text":
      return isParagraph(field) ? "多行文本" : "单行文本";
    case "user":
      return "人员";
    case "date":
      return "日期";
    case "number":
      return "数字";
    case "boolean":
      return "是/否";
    default:
      return "文本";
  }
};

/** 选项多于这个数时只列前几项，后面跟「等 N 项」 */
const SUMMARY_MAX_CHOICES = 6;
const SUMMARY_HEAD_CHOICES = 5;

/** 选项摘要：下拉列选项，人员写单 / 多选；其他类型没有选项，返回空串 */
export const getFieldOptionsSummary = (field: TFieldDefinition): string => {
  if (field.field_type === "select") {
    const choices = getSelectChoices(field);
    if (choices.length <= SUMMARY_MAX_CHOICES) return choices.join(" · ");
    return `${choices.slice(0, SUMMARY_HEAD_CHOICES).join(" · ")} 等 ${choices.length} 项`;
  }
  if (field.field_type === "user") return isMultiple(field) ? "多选" : "单选";
  return "";
};

/** 默认值的展示文案，没有默认值返回空串 */
export const getFieldDefaultLabel = (field: TFieldDefinition): string => {
  const value = field.default_value;
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.map((item) => String(item)).join("、");
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "";
};

export function FieldKindIcon({ field, className }: { field: TFieldDefinition; className?: string }) {
  const Icon = getFieldKindIcon(field);
  return (
    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg bg-layer-1 text-secondary", className)}>
      <Icon className="size-4" />
    </span>
  );
}

export function RequiredMark() {
  return <span className="shrink-0 text-12 whitespace-nowrap text-danger-primary">必填</span>;
}

/** 工作项类型的小标签：类型图标 + 名称 */
export function IssueTypeTag({
  name,
  icon,
  className,
}: {
  name: string;
  icon?: TTypeIconProps | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[26px] max-w-full shrink-0 items-center gap-1.5 rounded-md bg-layer-1 pr-2 pl-1.5 text-13 whitespace-nowrap text-secondary",
        className
      )}
    >
      <TypeIcon iconProps={icon} className="size-4 rounded" iconClassName="size-3.5" />
      <span className="truncate">{name}</span>
    </span>
  );
}
