/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import type { TDataDictionary } from "@plane/types";
import { useDataDictionaries } from "@/hooks/store/use-data-dictionaries";
import { PROJECT_FORM_DICTIONARY_KEYS } from "./constants";
import type { TProjectFormDictionaryKey } from "./constants";

export type TProjectDictionaries = {
  workspaceSlug: string;
  isLoading: boolean;
  get: (key: TProjectFormDictionaryKey) => TDataDictionary | undefined;
  /** 字典已加载、但还没有任何可选值（或该工作区根本没这个系统字典 —— 同名撞车等异常） */
  isEmpty: (key: TProjectFormDictionaryKey) => boolean;
};

/**
 * 一次拉全量字典给项目表单的 4 个字典下拉（含项目代号）共用。
 * useDataDictionaries 是局部 state，每个调用方各拉一次 —— 所以只在表单根调用，结果作为 prop 传给分区。
 */
export const useProjectDictionaries = (workspaceSlug: string, enabled = true): TProjectDictionaries => {
  const { isLoading, getDictionaryByKey } = useDataDictionaries(workspaceSlug, { autoFetch: enabled });
  const get = useCallback(
    (key: TProjectFormDictionaryKey) => getDictionaryByKey(PROJECT_FORM_DICTIONARY_KEYS[key]),
    [getDictionaryByKey]
  );
  const isEmpty = useCallback(
    (key: TProjectFormDictionaryKey) => {
      if (!enabled || isLoading) return false;
      const dictionary = get(key);
      return dictionary === undefined || dictionary.items.length === 0;
    },
    [enabled, isLoading, get]
  );
  return { workspaceSlug, isLoading, get, isEmpty };
};
