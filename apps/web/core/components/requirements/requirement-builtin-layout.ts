import type {
  TRequirementBuiltinFieldConfig,
  TRequirementBuiltinSortableKey,
  TRequirementField,
} from "@plane/types";
import { REQUIREMENT_BUILTIN_COLUMNS } from "./requirement-builtin-fields";

/**
 * 内置字段布局的解析层：把配置接口下发的 builtin_fields（顺序 + 纳入标准库）与
 * 展示元数据注册表 REQUIREMENT_BUILTIN_COLUMNS 合并，产出有序列描述符。
 *
 * 这是前端的**唯一回退点**：拿不到配置（旧缓存、新建类型）时回退为 canonical
 * 顺序 = 现状「内置在前、自定义在后」。所有消费点必须经这里，不要再直接拿注册表
 * 的数组顺序当列序。
 */

export type TBuiltinColumnMeta = (typeof REQUIREMENT_BUILTIN_COLUMNS)[number];

/** 标题列的展示元数据。标题与编号一样锁定在最前，不参与布局归并 */
export const REQUIREMENT_BUILTIN_TITLE_COLUMN = REQUIREMENT_BUILTIN_COLUMNS.find(
  (column) => column.key === "title"
)!;

/** 可排序的内置列注册表（7 项，不含 title），canonical 顺序 */
const ORDERABLE_BUILTIN_COLUMNS = REQUIREMENT_BUILTIN_COLUMNS.filter(
  (column) => column.key !== "title"
);

/** 与后端 SORT_ORDER_STEP 一致；缺省 sort_order 用 STEP/8 保证内置恒在第一个自定义字段(1000)之前 */
const SORT_ORDER_STEP = 1000;

export type TResolvedBuiltinEntry = {
  key: TRequirementBuiltinSortableKey;
  show_in_library: boolean;
  sort_order: number;
  /** 注册表条目：labelKey / icon / width / isContent 等展示元数据 */
  column: TBuiltinColumnMeta;
};

/**
 * 归一化布局：丢未知 key、补缺失 key（canonical 位 + 缺省纳入库）、status 强制不
 * 纳入，按 sort_order 升序。恒返回 7 项。configs 缺失 ⇒ canonical 序（现状顺序）。
 */
export const resolveBuiltinLayout = (
  configs?: TRequirementBuiltinFieldConfig[] | null
): TResolvedBuiltinEntry[] => {
  const byKey = new Map<string, TRequirementBuiltinFieldConfig>();
  for (const config of configs ?? []) {
    if (!byKey.has(config.key)) byKey.set(config.key, config);
  }
  const resolved = ORDERABLE_BUILTIN_COLUMNS.map((column, index) => {
    const config = byKey.get(column.key);
    const showInLibrary =
      column.libraryLock === "out"
        ? false
        : column.libraryLock === "in"
          ? true
          : (config?.show_in_library ?? column.showInLibrary);
    return {
      key: column.key as TRequirementBuiltinSortableKey,
      show_in_library: showInLibrary,
      sort_order:
        typeof config?.sort_order === "number"
          ? config.sort_order
          : ((index + 1) * SORT_ORDER_STEP) / 8,
      column,
    };
  });
  // sort 是稳定排序：同 sort_order 保持 canonical 序
  resolved.sort((a, b) => a.sort_order - b.sort_order);
  return resolved;
};

/** 这批需求行该显示哪些内置属性列（不含 title）。标准库藏掉未纳入的 */
export const resolveBuiltinColumns = (
  entityKind: "product" | "library",
  configs?: TRequirementBuiltinFieldConfig[] | null
): TResolvedBuiltinEntry[] => {
  const layout = resolveBuiltinLayout(configs);
  return entityKind === "library" ? layout.filter((entry) => entry.show_in_library) : layout;
};

export type TRequirementColumnDescriptor =
  | { kind: "builtin"; entry: TResolvedBuiltinEntry }
  | { kind: "field"; field: TRequirementField };

/**
 * 统一列流：内置属性列与自定义根字段按 sort_order 双指针稳定合并。
 * 相等时**内置在前** —— 旧客户端保存过的自定义 sort_order 可能与内置撞值，
 * 后端解析器与 Excel 归并是同一条规则。fields 需已按 sort_order 升序（接口即如此）。
 */
export const mergeBuiltinAndFields = (
  entityKind: "product" | "library",
  configs: TRequirementBuiltinFieldConfig[] | null | undefined,
  fields: TRequirementField[]
): TRequirementColumnDescriptor[] => {
  const builtins = resolveBuiltinColumns(entityKind, configs);
  const descriptors: TRequirementColumnDescriptor[] = [];
  let builtinIndex = 0;
  for (const field of fields) {
    const fieldSortOrder = field.sort_order ?? 0;
    while (
      builtinIndex < builtins.length &&
      builtins[builtinIndex].sort_order <= fieldSortOrder
    ) {
      descriptors.push({ kind: "builtin", entry: builtins[builtinIndex] });
      builtinIndex += 1;
    }
    descriptors.push({ kind: "field", field });
  }
  for (; builtinIndex < builtins.length; builtinIndex += 1) {
    descriptors.push({ kind: "builtin", entry: builtins[builtinIndex] });
  }
  return descriptors;
};
