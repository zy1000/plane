/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import type { TDataScopeEntry, TDataScopePreview } from "@plane/types";
import useDebounce from "@/hooks/use-debounce";
import { WorkspaceService } from "@/services/workspace.service";

const workspaceService = new WorkspaceService();

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? fallback;
  }
  return fallback;
};

/** 「按条件」的表达式有没有至少一条带值的条件（没有的话后端会 400，不必去问） */
const hasAnyCondition = (expression: unknown): boolean => {
  if (!expression || typeof expression !== "object") return false;
  const record = expression as Record<string, unknown>;
  if (Array.isArray(record.and)) return record.and.some((child) => hasAnyCondition(child));
  return Object.values(record).some((value) => (Array.isArray(value) ? value.length > 0 : value !== "" && value != null));
};

/**
 * 数据权限编辑器里一段白名单（项目或产品）的实时预览：草稿变了 400ms 后问后端「现在命中多少」。
 * 「全部」不问（就是全部）；「按条件」没有一条有效条件时也不问。
 */
export const useDataScopePreview = (
  workspaceSlug: string | undefined,
  kind: "projects" | "products",
  entry: TDataScopeEntry | undefined
) => {
  const debounced = useDebounce(entry, 400);
  const [preview, setPreview] = useState<TDataScopePreview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 「全部」也问一次：左侧大数字要总数，右侧列前几条
    if (!workspaceSlug || !debounced) {
      setPreview(null);
      setError(null);
      return;
    }
    if (debounced.mode === "filter" && !hasAnyCondition(debounced.filter)) {
      setPreview(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    workspaceService
      .previewWorkspaceRoleDataScope(workspaceSlug, kind, debounced)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((requestError) => {
        if (!cancelled) {
          setPreview(null);
          setError(getErrorMessage(requestError, "预览失败"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, kind, debounced]);

  return { preview, isLoading, error };
};

export const dataScopeEntryHasConditions = hasAnyCondition;
