/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import {
  TimesheetCategoryService,
  type TTimesheetCategory,
} from "@/services/issue/timesheet-category.service";

const service = new TimesheetCategoryService();

/**
 * 工时类别进程级缓存。
 *
 * - 类别字典全局共享、且极少变更，没必要每次组件挂载都请求一次；
 *   用模块级变量缓存响应 + pending Promise，并通过订阅让所有实例在加载完成后同步更新。
 * - 仍然暴露 `refetch` 用于在未来引入 CRUD 管理界面时手动失效。
 */

let cachedCategories: TTimesheetCategory[] | null = null;
let inflight: Promise<TTimesheetCategory[]> | null = null;

type TSubscriber = (value: TTimesheetCategory[]) => void;
const subscribers = new Set<TSubscriber>();

function notify(list: TTimesheetCategory[]) {
  for (const sub of subscribers) sub(list);
}

async function loadCategories(force: boolean): Promise<TTimesheetCategory[]> {
  if (!force && cachedCategories) return cachedCategories;
  if (!force && inflight) return inflight;
  inflight = service
    .list()
    .then((list) => {
      cachedCategories = [...list].sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.key.localeCompare(b.key);
      });
      notify(cachedCategories);
      return cachedCategories;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export const useTimesheetCategories = () => {
  const [categories, setCategories] = useState<TTimesheetCategory[]>(() => cachedCategories ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(() => cachedCategories === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const subscriber: TSubscriber = (list) => {
      if (mounted) setCategories(list);
    };
    subscribers.add(subscriber);

    if (cachedCategories) {
      setCategories(cachedCategories);
      setIsLoading(false);
    } else {
      setIsLoading(true);
      loadCategories(false)
        .then((list) => {
          if (!mounted) return;
          setCategories(list);
          setError(null);
        })
        .catch((err) => {
          if (!mounted) return;
          setError((err && (err.detail || err.message)) || "加载工时类别失败");
        })
        .finally(() => {
          if (mounted) setIsLoading(false);
        });
    }

    return () => {
      mounted = false;
      subscribers.delete(subscriber);
    };
  }, []);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await loadCategories(true);
      setCategories(list);
      setError(null);
      return list;
    } catch (err: any) {
      setError((err && (err.detail || err.message)) || "加载工时类别失败");
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getCategoryByKey = useCallback(
    (key: string | undefined | null): TTimesheetCategory | undefined => {
      if (!key) return undefined;
      return categories.find((c) => c.key === key);
    },
    [categories]
  );

  const getCategoryById = useCallback(
    (id: string | undefined | null): TTimesheetCategory | undefined => {
      if (!id) return undefined;
      return categories.find((c) => c.id === id);
    },
    [categories]
  );

  return {
    categories,
    isLoading,
    error,
    refetch,
    getCategoryByKey,
    getCategoryById,
  };
};
