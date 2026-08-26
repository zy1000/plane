/**
 * 工作区级数据字典：字典头（DataDictionary）+ 字典值（DataDictionaryItem）。
 * 6 个系统字典由后端预置（is_system=true，key 不可改、不可删），产品的阶段/类别/状态/研发等级引用其值。
 */

export enum EProductDictionaryKey {
  STAGE = "product_stage",
  CATEGORY = "product_category",
  STATUS = "product_status",
  HARDWARE_LEVEL = "product_hardware_level",
  STRUCTURE_LEVEL = "product_structure_level",
  SOFTWARE_LEVEL = "product_software_level",
}

export type TDataDictionaryItem = {
  id: string;
  dictionary: string;
  label: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** 产品 `*_detail` 只回 id / label / dictionary */
export type TDataDictionaryItemLite = Pick<TDataDictionaryItem, "id" | "label" | "dictionary">;

export type TDataDictionary = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  sort_order: number;
  /** 后端已按 sort_order 排好 */
  items: TDataDictionaryItem[];
  created_at: string;
  updated_at: string;
};

export type TCreateDataDictionaryPayload = {
  key: string;
  name: string;
  description?: string | null;
};

export type TUpdateDataDictionaryPayload = Partial<Pick<TCreateDataDictionaryPayload, "name" | "description">>;

export type TCreateDataDictionaryItemPayload = {
  label: string;
};

export type TUpdateDataDictionaryItemPayload = {
  label?: string;
  sort_order?: number;
};

export type TDataDictionaryErrorCode =
  | "DATA_DICTIONARY_KEY_INVALID"
  | "DATA_DICTIONARY_KEY_ALREADY_EXISTS"
  | "DATA_DICTIONARY_NAME_ALREADY_EXISTS"
  | "DATA_DICTIONARY_ITEM_ALREADY_EXISTS"
  | "DATA_DICTIONARY_SYSTEM_PROTECTED"
  | "DATA_DICTIONARY_ITEM_IN_USE";
