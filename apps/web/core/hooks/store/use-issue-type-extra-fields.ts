/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { TIssueTypeExtraField } from "@plane/types";
import {
  ProjectIssueTypeService,
  getCachedTypeExtraFields,
  type TTypeExtraField,
} from "@/services/project/project-issue-type.service";

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "msg" in error && typeof (error as { msg?: unknown }).msg === "string")
    return (error as { msg: string }).msg;
  return fallback;
};

const sortAndFilterFields = (raw: TTypeExtraField[] | TIssueTypeExtraField[] | undefined): TTypeExtraField[] => {
  if (!raw) return [];
  return [...raw]
    .filter((f) => f.is_active !== false)
    .sort((a, b) => {
      const sa = (a.sort_order ?? 0);
      const sb = (b.sort_order ?? 0);
      return sa - sb;
    }) as TTypeExtraField[];
};

/**
 * 按 (workspaceSlug, projectId, issueTypeId) 获取该工作项类型的自定义字段定义。
 *
 * 优先使用 embeddedFields（随 issue detail 一起返回的数据），无需再发请求；
 * 未提供时走 SWR：命中 service 缓存则立即渲染并后台 revalidate，否则发起请求。
 *
 * 返回值三态：
 *   null     — 尚不确定（未提供 embedded 且缓存未命中，请求还在路上）
 *   []       — 确定该类型没有自定义字段
 *   [...]    — 字段列表
 */
export const useIssueTypeExtraFields = (
  workspaceSlug: string | undefined,
  projectId: string | null | undefined,
  issueTypeId: string | null | undefined,
  embeddedFields?: TIssueTypeExtraField[] | null,
  options?: { lite?: boolean }
) => {
  const lite = options?.lite;

  const getInitialFields = (): TTypeExtraField[] | null => {
    // embedded data from issue detail response — use it directly
    if (embeddedFields != null) return sortAndFilterFields(embeddedFields);
    // try the module-level cache for immediate render
    if (workspaceSlug && projectId && issueTypeId) {
      const cached = getCachedTypeExtraFields(workspaceSlug, projectId, issueTypeId, lite);
      if (cached !== undefined) return sortAndFilterFields(cached);
    }
    return null;
  };

  const [fields, setFields] = useState<TTypeExtraField[] | null>(getInitialFields);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // keep a ref to compare embeddedFields identity and avoid infinite re-renders
  const prevEmbeddedRef = useRef<TIssueTypeExtraField[] | null | undefined>(undefined);

  const projectIssueTypeService = new ProjectIssueTypeService();

  const fetchFields = useCallback(async () => {
    if (!workspaceSlug || !projectId || !issueTypeId) {
      setFields([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await projectIssueTypeService.fetchTypeExtraFields(workspaceSlug, projectId, issueTypeId, lite);
      setFields(sortAndFilterFields(result));
    } catch (err) {
      setError(getErrorMessage(err, "获取自定义字段失败"));
      setFields([]);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, projectId, issueTypeId, lite]);

  useEffect(() => {
    // if embedded data was just provided (or changed), sync it synchronously and skip request
    if (embeddedFields !== undefined) {
      const changed = embeddedFields !== prevEmbeddedRef.current;
      prevEmbeddedRef.current = embeddedFields;
      if (embeddedFields != null) {
        if (changed) setFields(sortAndFilterFields(embeddedFields));
        return; // embedded present — no request needed
      }
    }

    if (!workspaceSlug || !projectId || !issueTypeId) {
      setFields([]);
      return;
    }

    // SWR: show stale cache immediately, then revalidate in background
    const cached = getCachedTypeExtraFields(workspaceSlug, projectId, issueTypeId, lite);
    if (cached !== undefined) {
      setFields(sortAndFilterFields(cached));
    }

    fetchFields();
  }, [fetchFields, embeddedFields, workspaceSlug, projectId, issueTypeId, lite]);

  return {
    fields,
    isLoading,
    error,
    refetch: fetchFields,
  };
};
