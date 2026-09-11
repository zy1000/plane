/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useContext } from "react";
// context
import { TranslationContext } from "../context";
// types
import type { ILanguageOption, TLanguage } from "../types";

export type TTranslationStore = {
  t: (key: string, params?: Record<string, unknown>) => string;
  currentLocale: TLanguage;
  changeLanguage: (lng: TLanguage) => void;
  languages: ILanguageOption[];
};

/**
 * Provides the translation store to the application
 * @returns {TTranslationStore}
 * @returns {(key: string, params?: Record<string, any>) => string} t: method to translate the key with params
 * @returns {TLanguage} currentLocale - current locale language
 * @returns {(lng: TLanguage) => void} changeLanguage - method to change the language
 * @returns {ILanguageOption[]} languages - available languages
 * @throws {Error} if the TranslationProvider is not used
 */
export function useTranslation(): TTranslationStore {
  const store = useContext(TranslationContext);
  if (!store) {
    throw new Error("useTranslation must be used within a TranslationProvider");
  }

  // changeLanguage 保持引用稳定：store-wrapper 把它放进 useEffect 依赖，
  // 每次渲染换新函数会让每次路由切换都重跑 changeLanguage、清空整份翻译缓存
  // t 仍按上游做法每次渲染新建，避免依赖 [t] 的 useMemo 在切换语言后拿到旧文案
  const changeLanguage = useCallback((lng: TLanguage) => store.setLanguage(lng), [store]);

  return {
    t: store.t.bind(store),
    currentLocale: store.currentLocale,
    changeLanguage,
    languages: store.availableLanguages,
  };
}
