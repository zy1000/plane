import { PROJECT_STATUS_DEFAULT_COLORS } from "@plane/constants";
import type { TDataDictionaryItemLite } from "@plane/types";
import { resolveDictionaryItemColor } from "@/components/data-dictionaries";

/**
 * 项目状态的标签颜色：字典开了彩色就用字典里配的，否则按预置标签兜底（见 PROJECT_STATUS_DEFAULT_COLORS），
 * 都没有就灰。和其它字典字段不同，状态在项目列表里永远是彩色标签。
 */
export const resolveProjectStatusColor = (
  item: Pick<TDataDictionaryItemLite, "label" | "color"> & Partial<Pick<TDataDictionaryItemLite, "is_colored">>,
  dictionary?: { is_colored: boolean } | null
): string => resolveDictionaryItemColor(item, dictionary) ?? PROJECT_STATUS_DEFAULT_COLORS[item.label] ?? "gray";
