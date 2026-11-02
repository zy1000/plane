import type { TLogoProps } from "./common";

/**
 * 产品分类：工作区级（如电表、水表），每个分类维护一组一级模块。
 *
 * 标准库可选一个分类（可不选）；选了之后库的第一层模块 = 分类的一级模块，由后端实时同步，
 * 库里不能对第一层增 / 改名 / 删，只能在其下建二、三级。
 */

export type TProductCategoryModule = {
  id: string;
  name: string;
  sort_order: number;
  /** 所有用该分类的库里，对应一级模块整棵子树下的条目数（需求数 + 用例数） */
  item_count: number;
};

/** 用这个分类的库类型：标准需求库 / 模板用例库 */
export type TProductCategoryLibraryKind = "requirement" | "case";

/** 正在用这个分类的库（标准需求库在前，模板用例库在后） */
export type TProductCategoryLibrary = {
  id: string;
  name: string;
  kind: TProductCategoryLibraryKind;
  /** 用例库为 null */
  requirement_type_detail: {
    id: string;
    name: string;
    logo_props?: Partial<TLogoProps>;
  } | null;
};

export type TProductCategory = {
  id: string;
  name: string;
  sort_order: number;
  /** 已按 sort_order 排好 */
  modules: TProductCategoryModule[];
  libraries: TProductCategoryLibrary[];
  created_at: string;
  updated_at: string;
};

export type TProductCategoryNamePayload = {
  name: string;
};

/** 删除分类被拦：409 PRODUCT_CATEGORY_IN_USE */
export type TProductCategoryInUseError = {
  error?: string;
  code: "PRODUCT_CATEGORY_IN_USE";
  libraries: { id: string; name: string; kind: TProductCategoryLibraryKind }[];
};

/** 删除一级模块被拦：409 PRODUCT_CATEGORY_MODULE_IN_USE，列出该模块下还有内容的库 */
export type TProductCategoryModuleInUseLibrary = {
  id: string;
  name: string;
  kind: TProductCategoryLibraryKind;
  child_count: number;
  item_count: number;
};

export type TProductCategoryModuleInUseError = {
  error?: string;
  code: "PRODUCT_CATEGORY_MODULE_IN_USE";
  libraries: TProductCategoryModuleInUseLibrary[];
};

/** 模块名最长 30 */
export const PRODUCT_CATEGORY_MODULE_NAME_MAX_LENGTH = 30;

/** 批量添加一级模块：已有 / 本次重复 / 超过 30 字的跳过 */
export type TProductCategoryModuleSkipReason = "exists" | "duplicate" | "too_long";

export type TProductCategoryBulkModulesResponse = {
  category: TProductCategory;
  created: string[];
  skipped: { name: string; reason: TProductCategoryModuleSkipReason }[];
};
