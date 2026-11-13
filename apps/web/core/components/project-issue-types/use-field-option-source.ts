/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import { useParams } from "react-router";
// hooks
import { useDataDictionaries } from "@/hooks/store/use-data-dictionaries";
import { JOB_ROLE_DICTIONARY_KEY } from "@/hooks/store/use-job-roles";
// local imports
import type { TFieldFormState } from "./field-form";
import { replaceSelectOptions } from "./field-options-bulk-edit";

const normalizeOptions = (values: string[]) => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));

/**
 * 选择字段的「选项来源」：手动维护 / 数据字典。字段库弹窗与类型属性行内表单共用这份逻辑，展示各写各的。
 *
 * 引用字典后表单里的 select_options 就是字典值（选字典时整体替换，默认值和可选项联动里失效的引用一并清掉），
 * 所以默认值下拉、联动规则编辑器、预览都照旧读 select_options，不需要知道来源。
 */
export function useFieldOptionSource(
  form: TFieldFormState,
  onChange: (form: TFieldFormState) => void,
  workspaceSlugProp?: string
) {
  const { workspaceSlug: routeWorkspaceSlug } = useParams();
  const workspaceSlug = workspaceSlugProp ?? routeWorkspaceSlug?.toString();
  const isDictionarySource = form.field_type === "select" && form.option_source === "dictionary";
  // 字典列表带全部字典值，来源是数据字典时才拉
  const { dictionaries: allDictionaries, isLoading } = useDataDictionaries(workspaceSlug, {
    autoFetch: isDictionarySource,
  });
  // 「角色」字典在 设置 › 角色 维护，不作为选项来源
  const dictionaries = useMemo(
    () => allDictionaries.filter((dictionary) => dictionary.key !== JOB_ROLE_DICTIONARY_KEY),
    [allDictionaries]
  );
  const dictionary = form.dictionary_id ? dictionaries.find((item) => item.id === form.dictionary_id) : undefined;

  // 字典列表还没回来时先用字段上已保存的选项（后端按字典值填的）
  const values = useMemo(() => {
    if (!isDictionarySource || !form.dictionary_id) return [];
    return dictionary ? dictionary.items.map((item) => item.label) : normalizeOptions(form.select_options);
  }, [dictionary, form.dictionary_id, form.select_options, isDictionarySource]);

  /** 字段已保存的选项里不在所选字典内的：保存后已填这些值的工作项保留原值、不可再选 */
  const missingOptions = useMemo(() => {
    if (!isDictionarySource || !dictionary) return [];
    const available = new Set(values);
    return form.saved_options.filter((option) => !available.has(option));
  }, [dictionary, form.saved_options, isDictionarySource, values]);

  const setSource = useCallback(
    (source: TFieldFormState["option_source"]) => {
      if (source === form.option_source) return;
      if (source === "dictionary") {
        const manualOptions = normalizeOptions(form.select_options);
        onChange({
          ...form,
          option_source: "dictionary",
          dictionary_id: null,
          manual_options: manualOptions.length > 0 ? manualOptions : form.manual_options,
        });
        return;
      }
      // 切回手动维护：有切换前的手动选项就恢复，否则把当前字典值留作手动选项
      const restored = form.manual_options?.length ? form.manual_options : normalizeOptions(form.select_options);
      onChange({ ...replaceSelectOptions(form, restored), option_source: "manual", dictionary_id: null });
    },
    [form, onChange]
  );

  const selectDictionary = useCallback(
    (dictionaryId: string) => {
      const target = dictionaries.find((item) => item.id === dictionaryId);
      if (!target) return;
      onChange({
        ...replaceSelectOptions(
          form,
          target.items.map((item) => item.label)
        ),
        dictionary_id: target.id,
      });
    },
    [dictionaries, form, onChange]
  );

  const dictionaryPageHref = workspaceSlug
    ? `/${workspaceSlug}/settings/data-dictionaries${form.dictionary_id ? `?dictionary=${form.dictionary_id}` : ""}`
    : undefined;

  return {
    isDictionarySource,
    /** 可选的数据字典（已去掉「角色」） */
    dictionaries,
    isLoading,
    /** 当前引用的字典；列表未加载或字典已不存在时为 undefined */
    dictionary,
    /** 当前引用字典的值，按字典顺序 */
    values,
    missingOptions,
    dictionaryPageHref,
    setSource,
    selectDictionary,
  };
}
