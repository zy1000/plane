import type { TDataDictionaryErrorCode } from "@plane/types";

export const DATA_DICTIONARY_KEY_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

const ERROR_I18N_SUFFIX: Record<TDataDictionaryErrorCode, string> = {
  DATA_DICTIONARY_KEY_INVALID: "key_invalid",
  DATA_DICTIONARY_KEY_ALREADY_EXISTS: "key_already_exists",
  DATA_DICTIONARY_NAME_ALREADY_EXISTS: "name_already_exists",
  DATA_DICTIONARY_ITEM_ALREADY_EXISTS: "item_already_exists",
  DATA_DICTIONARY_SYSTEM_PROTECTED: "system_protected",
  DATA_DICTIONARY_ITEM_IN_USE: "item_in_use",
};

/** 字段级错误：表单就地显示在对应输入框下方，Root 不再弹 toast */
const FIELD_ERROR_CODES = new Set<string>([
  "DATA_DICTIONARY_KEY_INVALID",
  "DATA_DICTIONARY_KEY_ALREADY_EXISTS",
  "DATA_DICTIONARY_NAME_ALREADY_EXISTS",
  "DATA_DICTIONARY_ITEM_ALREADY_EXISTS",
]);

const isErrorCode = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("DATA_DICTIONARY_");

/** 从后端错误对象里抽错误码：{code} / {error} / {detail} / {field: [code]} 任一形态 */
export const extractDataDictionaryErrorCode = (error: unknown): string | null => {
  if (!error || typeof error !== "object") return null;
  const payload = error as Record<string, unknown>;
  for (const candidate of [payload.code, payload.error, payload.detail]) {
    if (isErrorCode(candidate)) return candidate;
  }
  // DRF 字段错误形态：{ key: ["DATA_DICTIONARY_KEY_ALREADY_EXISTS"] }
  for (const value of Object.values(payload)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (isErrorCode(first)) return first;
  }
  return null;
};

/** 错误码 → i18n key（workspace_settings.settings.data_dictionaries.errors.*），未知返回 null */
export const getDataDictionaryErrorI18nKey = (code: string | null): string | null => {
  if (!code || !(code in ERROR_I18N_SUFFIX)) return null;
  return `workspace_settings.settings.data_dictionaries.errors.${ERROR_I18N_SUFFIX[code as TDataDictionaryErrorCode]}`;
};

export const isDataDictionaryFieldErrorCode = (code: string | null): boolean =>
  Boolean(code && FIELD_ERROR_CODES.has(code));

/** 只对字段级错误返回 i18n key；其余错误 Root 已统一 toast，表单不用再处理 */
export const getDataDictionaryFieldErrorI18nKey = (error: unknown): string | null => {
  const code = extractDataDictionaryErrorCode(error);
  return isDataDictionaryFieldErrorCode(code) ? getDataDictionaryErrorI18nKey(code) : null;
};
