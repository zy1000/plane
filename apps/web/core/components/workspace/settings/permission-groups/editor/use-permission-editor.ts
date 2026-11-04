/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";

/** 编辑器的值：与后端 roles/<id>/permissions/ 的请求体同形（工作区组、项目组通用） */
export type TPermissionEditorValue = {
  permission_keys: string[];
  /** {key: [不适用的类型 id]} */
  type_limits: Record<string, string[]>;
};

export type TCheckState = "none" | "some" | "all";

/**
 * 编辑器的纯逻辑：勾 / 取消一批 key、类型限定、整段替换（复制自…）。
 * 去掉一个 key 时它的类型限定一起丢掉 —— 重新勾上应当回到「全部类型」，不该冒出上次的排除清单。
 */
export const usePermissionEditor = (value: TPermissionEditorValue, onChange: (next: TPermissionEditorValue) => void) => {
  const keySet = useMemo(() => new Set(value.permission_keys), [value.permission_keys]);

  const apply = useCallback(
    (add: string[], remove: string[]) => {
      const next = new Set(value.permission_keys);
      add.forEach((key) => next.add(key));
      remove.forEach((key) => next.delete(key));
      const typeLimits: Record<string, string[]> = {};
      for (const [key, ids] of Object.entries(value.type_limits ?? {})) {
        if (next.has(key) && ids.length > 0) typeLimits[key] = ids;
      }
      onChange({ permission_keys: [...next], type_limits: typeLimits });
    },
    [value, onChange]
  );

  const stateOf = useCallback(
    (keys: string[]): TCheckState => {
      if (keys.length === 0) return "none";
      const checked = keys.filter((key) => keySet.has(key)).length;
      if (checked === 0) return "none";
      return checked === keys.length ? "all" : "some";
    },
    [keySet]
  );

  /** 全勾了就全取消，否则全勾上（分组 / 模块 / 表头的三态复选框都这样） */
  const toggleKeys = useCallback(
    (keys: string[]) => {
      if (keys.length === 0) return;
      if (keys.every((key) => keySet.has(key))) apply([], keys);
      else apply(keys, []);
    },
    [keySet, apply]
  );

  const setTypeExclusions = useCallback(
    (key: string, excludedIds: string[]) => {
      const typeLimits = { ...(value.type_limits ?? {}) };
      if (excludedIds.length > 0) typeLimits[key] = [...new Set(excludedIds)];
      else delete typeLimits[key];
      onChange({ permission_keys: value.permission_keys, type_limits: typeLimits });
    },
    [value, onChange]
  );

  /** 「复制自…」：把这一段（当前 scope 的 key）换成来源组的同一段，其它段不动 */
  const replaceKeys = useCallback(
    (scopeKeys: string[], source: TPermissionEditorValue) => {
      const scope = new Set(scopeKeys);
      const kept = value.permission_keys.filter((key) => !scope.has(key));
      const copied = source.permission_keys.filter((key) => scope.has(key));
      const typeLimits: Record<string, string[]> = {};
      for (const [key, ids] of Object.entries(value.type_limits ?? {})) {
        if (!scope.has(key) && kept.includes(key) && ids.length > 0) typeLimits[key] = ids;
      }
      for (const [key, ids] of Object.entries(source.type_limits ?? {})) {
        if (scope.has(key) && copied.includes(key) && ids.length > 0) typeLimits[key] = ids;
      }
      onChange({ permission_keys: [...kept, ...copied], type_limits: typeLimits });
    },
    [value, onChange]
  );

  return { keySet, stateOf, toggleKeys, setKeys: apply, setTypeExclusions, replaceKeys };
};
