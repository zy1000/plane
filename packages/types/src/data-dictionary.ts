/**
 * 工作区级数据字典：字典头（DataDictionary）+ 字典值（DataDictionaryItem）。
 * 10 个系统字典由后端预置（is_system=true，key 不可改、不可删）：产品的阶段/类别/状态/研发等级、项目的所属BU/状态/类型引用其值，
 * 项目代号（Project.code，字符串列）按 label 取自 project_code。
 */

export enum EProductDictionaryKey {
  STAGE = "product_stage",
  CATEGORY = "product_category",
  STATUS = "product_status",
  HARDWARE_LEVEL = "product_hardware_level",
  STRUCTURE_LEVEL = "product_structure_level",
  SOFTWARE_LEVEL = "product_software_level",
}

/** 项目引用的 4 个系统字典（CODE 不是 FK：Project.code 存的是它某个值的 label） */
export enum EProjectDictionaryKey {
  BUSINESS_UNIT = "project_business_unit",
  STATUS = "project_status",
  PROJECT_TYPE = "project_type",
  CODE = "project_code",
}

export type TDataDictionaryItem = {
  id: string;
  dictionary: string;
  label: string;
  /** 预设色 key（见 @plane/constants 的 DATA_DICTIONARY_COLOR_KEYS）或 #rrggbb 小写；空串 = 未指定 */
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

/** 产品 / 项目 `*_detail`：id / label / dictionary / color，外加所属字典的彩色开关（列表页拿不到字典头） */
export type TDataDictionaryItemLite = Pick<TDataDictionaryItem, "id" | "label" | "dictionary" | "color"> & {
  is_colored: boolean;
};

export type TDataDictionary = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  /** 开启后该字典的值在所有使用处渲染成彩色标签；关着时一律纯文本 */
  is_colored: boolean;
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

export type TUpdateDataDictionaryPayload = Partial<{
  name: string;
  description: string | null;
  is_colored: boolean;
}>;

export type TCreateDataDictionaryItemPayload = {
  label: string;
  color?: string;
};

export type TUpdateDataDictionaryItemPayload = {
  label?: string;
  color?: string;
  sort_order?: number;
};

export type TDataDictionaryErrorCode =
  | "DATA_DICTIONARY_KEY_INVALID"
  | "DATA_DICTIONARY_KEY_ALREADY_EXISTS"
  | "DATA_DICTIONARY_NAME_ALREADY_EXISTS"
  | "DATA_DICTIONARY_ITEM_ALREADY_EXISTS"
  | "DATA_DICTIONARY_SYSTEM_PROTECTED"
  | "DATA_DICTIONARY_ITEM_IN_USE";
