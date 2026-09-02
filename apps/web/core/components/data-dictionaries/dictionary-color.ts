import type { CSSProperties } from "react";
import { DEFAULT_DATA_DICTIONARY_COLOR, isDataDictionaryColorKey } from "@plane/constants";
import type { TDataDictionaryItemLite } from "@plane/types";
import { hexToHsl } from "@plane/utils";

type TColoredItem = Pick<TDataDictionaryItemLite, "color"> & Partial<Pick<TDataDictionaryItemLite, "is_colored">>;

export const isCustomDictionaryColor = (color: string) => color.startsWith("#");

/**
 * 字典值该以什么颜色渲染：字典没开彩色 → null（纯文本）；开了 → 值自己的颜色，没指定则灰。
 * 开关优先取字典头；产品 / 项目列表只有 `*_detail`、没有字典头，就用 Lite 上冗余的 is_colored。
 */
export const resolveDictionaryItemColor = (
  item: TColoredItem | null | undefined,
  dictionary?: { is_colored: boolean } | null
): string | null => {
  if (!item) return null;
  const isColored = dictionary?.is_colored ?? item.is_colored ?? false;
  if (!isColored) return null;
  return item.color || DEFAULT_DATA_DICTIONARY_COLOR;
};

/**
 * 预设色走 globals.css 里的 `.dict-color-<key>`；自定义 hex 走 `.dict-color-custom` + 内联 h / s 变量，
 * 底色 / 文字色由 CSS 按主题派生，JS 只算一次 hsl。
 */
export const getDictionaryColorProps = (color: string): { className: string; style?: CSSProperties } => {
  if (isDataDictionaryColorKey(color)) return { className: `dict-color-${color}` };
  if (isCustomDictionaryColor(color)) {
    const hex = color.toLowerCase();
    const { h, s } = hexToHsl(hex);
    return {
      className: "dict-color-custom",
      style: { "--dict-h": h, "--dict-s": s, "--dict-dot": hex } as CSSProperties,
    };
  }
  return { className: `dict-color-${DEFAULT_DATA_DICTIONARY_COLOR}` };
};
