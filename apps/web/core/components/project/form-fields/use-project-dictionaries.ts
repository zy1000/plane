/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import type { TDataDictionary } from "@plane/types";
import { useDataDictionaries } from "@/hooks/store/use-data-dictionaries";
import { PROJECT_DICTIONARY_FIELDS } from "./constants";
import type { TProjectDictionaryFieldKey } from "./constants";

export type TProjectDictionaries = {
  workspaceSlug: string;
  isLoading: boolean;
  get: (key: TProjectDictionaryFieldKey) => TDataDictionary | undefined;
  /** 字典已加载、但还没有任何可选值 */
  isEmpty: (key: TProjectDictionaryFieldKey) => boolean;
};

/**
 * 一次拉全量字典给项目表单的 3 个字典下拉共用。
 * useDataDictionaries 是局部 state，每个调用方各拉一次 —— 所以只在表单根调用，结果作为 prop 传给分区。
 */
export const useProjectDictionaries = (workspaceSlug: string, enabled = true): TProjectDictionaries => {
  const { isLoading, getDictionaryByKey } = useDataDictionaries(workspaceSlug, { autoFetch: enabled });
  const get = useCallback(
    (key: TProjectDictionaryFieldKey) => getDictionaryByKey(PROJECT_DICTIONARY_FIELDS[key]),
    [getDictionaryByKey]
  );
  const isEmpty = useCallback(
    (key: TProjectDictionaryFieldKey) => {
      const dictionary = get(key);
      return dictionary !== undefined && dictionary.items.length === 0;
    },
    [get]
  );
  return { workspaceSlug, isLoading, get, isEmpty };
};
