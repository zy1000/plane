import { Calendar, Fingerprint, Hash, ListChecks, Ruler, Table2, ToggleLeft, Type } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { TStructuredFieldType } from "@/services/requirement-structure.service";

export type TFieldTypeMeta = {
  value: TStructuredFieldType;
  label: string;
  icon: LucideIcon;
  hint: string;
};

export const FIELD_TYPE_META: Record<TStructuredFieldType, TFieldTypeMeta> = {
  text: { value: "text", label: "文本", icon: Type, hint: "单行或多行文字" },
  number: { value: "number", label: "数值", icon: Hash, hint: "单个数字，可带单位" },
  number_range: { value: "number_range", label: "数值范围", icon: Ruler, hint: "最小值 ~ 最大值" },
  boolean: { value: "boolean", label: "是 / 否", icon: ToggleLeft, hint: "布尔开关" },
  date: { value: "date", label: "日期", icon: Calendar, hint: "选择日期" },
  select: { value: "select", label: "单选 / 多选", icon: ListChecks, hint: "从预设选项中选择" },
  auto_id: { value: "auto_id", label: "自动 ID", icon: Fingerprint, hint: "按前缀自动发号" },
  table: { value: "table", label: "子表", icon: Table2, hint: "嵌套一层的结构化子表" },
};

export const FIELD_TYPE_LIST: TFieldTypeMeta[] = [
  FIELD_TYPE_META.text,
  FIELD_TYPE_META.number,
  FIELD_TYPE_META.number_range,
  FIELD_TYPE_META.boolean,
  FIELD_TYPE_META.date,
  FIELD_TYPE_META.select,
  FIELD_TYPE_META.auto_id,
  FIELD_TYPE_META.table,
];
