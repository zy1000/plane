import type { TStructuredDiffEntry, TStructuredField, TStructuredValue } from "@/services/requirement-structure.service";
import { formatFieldValue } from "./structured-field-cell";

/** 行快照：与后端 serialize_structured_row 对齐（去掉 sort_key）。moved 变更只带 after_row_key，不是快照。 */
type TRowSnapshot = {
  key: string;
  parent_row_key: string | null;
  table_field_key: string | null;
  display_id: string | null;
  sequence_number: number | null;
  values: Record<string, TStructuredValue>;
};

/** 一行内单个字段的对照结果，供评审逐字段展示。 */
export type TFieldChangeRow = {
  key: string;
  name: string;
  before: string;
  after: string;
  changed: boolean;
};

/** 只有增删改行才携带完整快照；moved 只有 {after_row_key}，据此判空。 */
function asSnapshot(value: unknown): TRowSnapshot | null {
  if (!value || typeof value !== "object") return null;
  if (!("values" in (value as Record<string, unknown>))) return null;
  return value as TRowSnapshot;
}

/** 取该行所在范围（主记录 / 某个子表）内可展示的字段，排除子表容器与自动编号，且与完整数据表一致只看启用字段。 */
function scopeFields(entry: TStructuredDiffEntry, fields: TStructuredField[]): TStructuredField[] {
  const displayable = fields.filter(
    (field) => field.is_active && field.field_type !== "table" && field.field_type !== "auto_id"
  );
  if (entry.scope === "root_row") {
    return displayable.filter((field) => !field.parent_key);
  }
  if (entry.scope === "child_row") {
    const snapshot = asSnapshot(entry.after_value) ?? asSnapshot(entry.before_value);
    const tableKey = snapshot?.table_field_key ?? null;
    return displayable.filter((field) => field.parent_key === tableKey);
  }
  return [];
}

/** 计算一行的字段级 before/after 文本，用于「变更前 → 变更后」对照。 */
export function getRowFieldChanges(entry: TStructuredDiffEntry, fields: TStructuredField[]): TFieldChangeRow[] {
  const before = asSnapshot(entry.before_value);
  const after = asSnapshot(entry.after_value);
  return scopeFields(entry, fields).map((field) => {
    const beforeText = before ? formatFieldValue(field, before.values?.[field.key]) : "";
    const afterText = after ? formatFieldValue(field, after.values?.[field.key]) : "";
    return { key: field.key, name: field.name, before: beforeText, after: afterText, changed: beforeText !== afterText };
  });
}

/** 供「完整数据」表高亮：返回该行本轮被修改的字段 key 集合（仅 modified 有意义）。 */
export function getChangedFieldKeys(entry: TStructuredDiffEntry, fields: TStructuredField[]): string[] {
  return getRowFieldChanges(entry, fields)
    .filter((row) => row.changed)
    .map((row) => row.key);
}
