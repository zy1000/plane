import { EProductDictionaryKey } from "@plane/types";
import type { TProductExtendedFieldKey } from "@plane/types";

/** 产品字典字段 → 对应的系统字典 key */
export const PRODUCT_DICTIONARY_FIELDS = {
  stage: EProductDictionaryKey.STAGE,
  category: EProductDictionaryKey.CATEGORY,
  status: EProductDictionaryKey.STATUS,
  hardware_level: EProductDictionaryKey.HARDWARE_LEVEL,
  structure_level: EProductDictionaryKey.STRUCTURE_LEVEL,
  software_level: EProductDictionaryKey.SOFTWARE_LEVEL,
} as const;

export type TProductDictionaryFieldKey = keyof typeof PRODUCT_DICTIONARY_FIELDS;

/** 创建接口必填、但 DB 可空（存量产品可能为 null）的扩展字段 */
export const PRODUCT_REQUIRED_EXTENDED_FIELDS: TProductExtendedFieldKey[] = [
  "code",
  "stage",
  "category",
  "status",
  "hardware_level",
  "structure_level",
  "software_level",
  "start_date",
  "project_lead",
  "test_lead",
];

/** 扩展字段区覆盖的全部字段，顺序即表单展示顺序 */
export const PRODUCT_EXTENDED_FIELD_KEYS: TProductExtendedFieldKey[] = [
  "code",
  "model_number",
  "external_model",
  "stage",
  "category",
  "status",
  "hardware_level",
  "structure_level",
  "software_level",
  "start_date",
  "o_phase_close_date",
  "v_phase_close_date",
  "project_lead",
  "test_lead",
  "reviewers",
];
