import type { ImportFieldDefinition, ImportFieldKey } from "./types";

/**
 * 模板字段定义。与后端 `IMPORT_FIELD_DEFINITIONS` 一一对应，作为前端字段映射下拉的选项源。
 * 若后端字段调整，请同步修改本文件。
 */
export const IMPORT_FIELD_DEFINITIONS: ImportFieldDefinition[] = [
  { key: "name", label: "标题", required: true },
  { key: "type", label: "类型", required: true },
  { key: "description", label: "描述", required: false },
  { key: "priority", label: "优先级", required: false },
  { key: "assignees", label: "负责人", required: false },
  { key: "labels", label: "标签", required: false },
  { key: "module", label: "模块", required: false },
  { key: "cycle", label: "迭代", required: false },
  { key: "release", label: "发布", required: false },
  { key: "start_date", label: "开始日期", required: false },
  { key: "target_date", label: "截止日期", required: false },
  { key: "parent", label: "父工作项", required: false },
  { key: "requirement_item", label: "需求项（表格列）", required: false },
];

export const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  IMPORT_FIELD_DEFINITIONS.map((f) => [f.key, f.label])
);

/**
 * 允许同一字段被映射到多列的白名单。需与后端 `MULTI_MAP_FIELDS` 保持一致。
 */
export const MULTI_MAP_FIELDS: Set<ImportFieldKey> = new Set<ImportFieldKey>(["requirement_item"]);

/**
 * 已下线导入列：上传文件若仍含这些表头（来自旧模板或自定义文件），不在字段映射界面展示。
 */
export const EXCLUDED_IMPORT_COLUMNS: Set<string> = new Set(["估点"]);
