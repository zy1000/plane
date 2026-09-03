/**
 * 两份行快照 → 「变了的字段」列表，带旧值 / 新值。
 *
 * 历史行要直接回答「改成了什么」，所以不再只报字段名（旧 diffSnapshotFieldNames 只给名字，
 * 用户看到「修改了描述、字段2」却不知道改成了什么）。
 *
 * 行顺序与评审页的 ChangeRequestRequirementDiff 一致：标题 → 内置内容列与自定义字段按
 * sort_order 归并 → 需求级附件 → 子表单。这样从行面板点开「完整对比」时顺序不会跳。
 */
import { isEqual } from "lodash-es";
import type {
  TRequirementBuiltinFieldConfig,
  TRequirementBuiltinKey,
  TRequirementChangeSnapshot,
  TRequirementField,
  TRequirementValue,
} from "@plane/types";
import {
  mergeBuiltinAndFields,
  REQUIREMENT_BUILTIN_TITLE_COLUMN,
  type TBuiltinColumnMeta,
} from "@/components/requirements/requirement-builtin-layout";

export type TSnapshotDiffRow = {
  /** 内置列 key / 字段 id / "attachments" */
  key: string;
  kind: "builtin" | "custom" | "attachments" | "form";
  label: string;
  before: TRequirementValue | undefined;
  after: TRequirementValue | undefined;
  columnKey?: TRequirementBuiltinKey;
  /** custom / form 的字段定义；data 里有值但字段树里找不到（字段已永久删除）时为 undefined */
  field?: TRequirementField;
  /** 描述与富文本字段：面板走行内文字 diff，不是整值替换 */
  isRichText: boolean;
};

export type TSnapshotDiffMode = "create" | "update" | "delete" | "unavailable";

export type TSnapshotDiff = {
  mode: TSnapshotDiffMode;
  /** 只含变了的行；create 只列有值的行，delete 只列曾有值的行 */
  rows: TSnapshotDiffRow[];
  count: number;
  labels: string[];
};

export const EMPTY_SNAPSHOT_DIFF: TSnapshotDiff = { mode: "unavailable", rows: [], count: 0, labels: [] };

/** undefined / null / "" / [] 视为同一个「空」—— 没填与被清空在历史里不该算一次变化 */
const isEmptyValue = (value: unknown) =>
  value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);

const valuesDiffer = (before: unknown, after: unknown) => {
  if (isEmptyValue(before) && isEmptyValue(after)) return false;
  return !isEqual(before ?? null, after ?? null);
};

export const diffSnapshotFields = (
  before: TRequirementChangeSnapshot | null | undefined,
  after: TRequirementChangeSnapshot | null | undefined,
  source: { fields: TRequirementField[]; builtinLayout?: TRequirementBuiltinFieldConfig[] | null },
  labelOf: (key: string) => string
): TSnapshotDiff => {
  const mode: TSnapshotDiffMode = before && after ? "update" : after ? "create" : before ? "delete" : "unavailable";
  if (mode === "unavailable") return EMPTY_SNAPSHOT_DIFF;
  const left = (before ?? {}) as Partial<TRequirementChangeSnapshot>;
  const right = (after ?? {}) as Partial<TRequirementChangeSnapshot>;
  const leftData = left.data ?? {};
  const rightData = right.data ?? {};

  const rows: TSnapshotDiffRow[] = [];
  const pushBuiltin = (column: TBuiltinColumnMeta) => {
    const key = column.key;
    const oldValue = left[key] as TRequirementValue | undefined;
    const newValue = right[key] as TRequirementValue | undefined;
    if (!valuesDiffer(oldValue, newValue)) return;
    rows.push({
      key,
      kind: "builtin",
      label: labelOf(column.labelKey),
      before: oldValue,
      after: newValue,
      columnKey: key,
      isRichText: key === "description_html",
    });
  };
  const pushField = (field: TRequirementField) => {
    const oldValue = leftData[field.id];
    const newValue = rightData[field.id];
    if (!valuesDiffer(oldValue, newValue)) return;
    rows.push({
      key: field.id,
      kind: field.field_type === "form" ? "form" : "custom",
      label: field.name,
      before: oldValue,
      after: newValue,
      field,
      isRichText: field.field_type === "rich_text",
    });
  };

  pushBuiltin(REQUIREMENT_BUILTIN_TITLE_COLUMN);
  const scalarFields = source.fields.filter((field) => field.field_type !== "form");
  for (const descriptor of mergeBuiltinAndFields("product", source.builtinLayout, scalarFields)) {
    if (descriptor.kind === "builtin") {
      if (descriptor.entry.column.isContent) pushBuiltin(descriptor.entry.column);
    } else {
      pushField(descriptor.field);
    }
  }
  // data 里有、字段树里没有的 id：仍然报出来，标签回落 id —— 藏掉会让「修改了 N 处」对不上数
  const known = new Set(source.fields.map((field) => field.id));
  for (const fieldId of new Set([...Object.keys(leftData), ...Object.keys(rightData)])) {
    if (known.has(fieldId)) continue;
    const oldValue = leftData[fieldId];
    const newValue = rightData[fieldId];
    if (!valuesDiffer(oldValue, newValue)) continue;
    rows.push({ key: fieldId, kind: "custom", label: fieldId, before: oldValue, after: newValue, isRichText: false });
  }
  // 需求级附件算内容但不是内置列；上线前的旧快照没有这个键，按空数组比
  if (valuesDiffer(left.attachments ?? [], right.attachments ?? [])) {
    rows.push({
      key: "attachments",
      kind: "attachments",
      label: labelOf("requirement_detail.attachments.title"),
      before: left.attachments ?? [],
      after: right.attachments ?? [],
      isRichText: false,
    });
  }
  for (const field of source.fields) {
    if (field.field_type === "form") pushField(field);
  }

  return { mode, rows, count: rows.length, labels: rows.map((row) => row.label) };
};
