import { EProductDictionaryKey, EProjectDictionaryKey } from "@plane/types";
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

/** 表单里所有从字典取值的字段：6 个 FK + 项目代号（code 是字符串列，存字典值的 label 而不是 id，与 Project.code 同一本 project_code 字典） */
export const PRODUCT_FORM_DICTIONARY_KEYS = {
  ...PRODUCT_DICTIONARY_FIELDS,
  code: EProjectDictionaryKey.CODE,
} as const;

export type TProductDictionaryFieldKey = keyof typeof PRODUCT_DICTIONARY_FIELDS;
export type TProductFormDictionaryKey = keyof typeof PRODUCT_FORM_DICTIONARY_KEYS;

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
