/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TDataDictionaryItem } from "@plane/types";
import { DataDictionaryService } from "@/services/data-dictionary.service";

const dataDictionaryService = new DataDictionaryService();

/** 角色 = 数据字典 key 为 job_role 的值（与后端 utils/job_role.py 一致） */
export const JOB_ROLE_DICTIONARY_KEY = "job_role";

type TJobRolesState = { items: TDataDictionaryItem[]; isColored: boolean };

const cacheBySlug = new Map<string, TJobRolesState>();
const inFlightBySlug = new Map<string, Promise<TJobRolesState>>();

/** 角色页增删改排序后调用：之后打开的成员表、审批人选择等重新拉角色 */
export const clearJobRolesCache = (workspaceSlug: string) => {
  cacheBySlug.delete(workspaceSlug);
};

const loadJobRoles = (workspaceSlug: string) => {
  const pending = inFlightBySlug.get(workspaceSlug);
  if (pending) return pending;
  const request = dataDictionaryService
    .list(workspaceSlug)
    .then((dictionaries) => {
      const dictionary = dictionaries.find((item) => item.key === JOB_ROLE_DICTIONARY_KEY);
      const state = { items: dictionary?.items ?? [], isColored: Boolean(dictionary?.is_colored) };
      cacheBySlug.set(workspaceSlug, state);
      return state;
    })
    .finally(() => inFlightBySlug.delete(workspaceSlug));
  inFlightBySlug.set(workspaceSlug, request);
  return request;
};

/**
 * 角色（job_role）候选：成员表的「角色」列、编辑成员弹窗、筛选都用它。
 * 角色只用来「找人」（审批人、评审负责人候选），与权限组无关。按工作区缓存，同一页多处调用只请求一次。
 */
export const useJobRoles = (workspaceSlug: string | undefined) => {
  const [state, setState] = useState<TJobRolesState>(() =>
    workspaceSlug ? (cacheBySlug.get(workspaceSlug) ?? { items: [], isColored: false }) : { items: [], isColored: false }
  );
  const [isLoading, setIsLoading] = useState(() => Boolean(workspaceSlug && !cacheBySlug.has(workspaceSlug)));

  const fetchJobRoles = useCallback(async () => {
    if (!workspaceSlug) return;
    setIsLoading(true);
    try {
      setState(await loadJobRoles(workspaceSlug));
    } catch {
      // 字典读不到时角色列显示「未设置」，不打断页面
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void fetchJobRoles();
  }, [fetchJobRoles]);

  const jobRoleMap = useMemo(() => new Map(state.items.map((item) => [item.id, item])), [state.items]);

  return {
    jobRoles: state.items,
    /** 字典开了彩色显示时，角色标签按值的颜色渲染 */
    isColored: state.isColored,
    jobRoleMap,
    isLoading,
    fetchJobRoles,
  };
};
