/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * 字典值预设色 key。与后端 serializers/data_dictionary.py 的 DATA_DICTIONARY_COLOR_KEYS 一致；
 * 每个 key 的亮 / 暗色值定义在 apps/web/styles/globals.css 的 `--dict-color-<key>-*` 变量里。
 */
export const DATA_DICTIONARY_COLOR_KEYS = [
  "gray",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "indigo",
  "purple",
  "pink",
] as const;

export type TDataDictionaryColorKey = (typeof DATA_DICTIONARY_COLOR_KEYS)[number];

/** 字典开了彩色但值没指定颜色时的兜底色 */
export const DEFAULT_DATA_DICTIONARY_COLOR: TDataDictionaryColorKey = "gray";

export const isDataDictionaryColorKey = (value: string): value is TDataDictionaryColorKey =>
  (DATA_DICTIONARY_COLOR_KEYS as readonly string[]).includes(value);
