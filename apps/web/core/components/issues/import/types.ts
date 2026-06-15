/**
 * 工作项导入相关的前端类型定义。
 *
 * 字段 key 必须与后端 `plane.utils.issue_import.IMPORT_FIELD_DEFINITIONS` 保持一致。
 */

export type ImportFieldKey =
  | "name"
  | "type"
  | "description"
  | "priority"
  | "assignees"
  | "labels"
  | "module"
  | "cycle"
  | "release"
  | "start_date"
  | "target_date"
  | "parent"
  | "requirement_item";

export type ImportFieldDefinition = {
  key: ImportFieldKey;
  label: string;
  required: boolean;
};

export const IGNORE_FIELD = "__ignore__";

export type FieldMapping = Record<string, ImportFieldKey | typeof IGNORE_FIELD>;

export type InspectResponse = {
  headers: string[];
  suggested_mapping: FieldMapping;
  row_count: number;
};

export type ValidationRow = {
  row_number: number;
  title: string;
  passed: boolean;
  duplicate: boolean;
  errors: string[];
  warnings: string[];
  error_reason: string;
  warning_reason: string;
};

export type ValidationResponse = {
  total_count: number;
  passed_count: number;
  duplicate_count: number;
  all_passed: boolean;
  results: ValidationRow[];
};

export type BulkImportFailure = {
  row_number: number;
  title: string;
  error: string;
};

export type BulkImportSkipped = {
  row_number: number;
  title: string;
  reason: string;
};

export type BulkImportResponse = {
  total_count: number;
  success_count: number;
  created_ids: string[];
  skipped_count: number;
  skipped: BulkImportSkipped[];
  failed: BulkImportFailure[];
};

export type ImportStep = "upload" | "validate";
