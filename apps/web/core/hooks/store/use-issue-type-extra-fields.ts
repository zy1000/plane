/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ProjectIssueTypeService,
  type TTypeExtraField,
} from "@/services/project/project-issue-type.service";

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "msg" in error && typeof (error as { msg?: unknown }).msg === "string")
    return (error as { msg: string }).msg;
  return fallback;
};

const sortAndFilterFields = (raw: TTypeExtraField[] | undefined): TTypeExtraField[] => {
  if (!raw) return [];
  return [...raw]
    .filter((f) => f.is_active !== false)
    .sort((a, b) => {
      const sa = a.sort_order ?? 0;
      const sb = b.sort_order ?? 0;
      return sa - sb;
    });
};

/**
 * 按 (workspaceSlug, projectId, issueTypeId) 拉取该工作项类型的自定义字段定义。
 * 用于创建/编辑工作项弹窗中动态渲染填写控件。
 */
export const useIssueTypeExtraFields = (
  workspaceSlug: string | undefined,
  projectId: string | null | undefined,
  issueTypeId: string | null | undefined
) => {
  const [fields, setFields] = useState<TTypeExtraField[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectIssueTypeService = new ProjectIssueTypeService();

  const fetchFields = useCallback(async () => {
    if (!workspaceSlug || !projectId || !issueTypeId) {
      setFields([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await projectIssueTypeService.fetchTypeExtraFields(workspaceSlug, projectId, issueTypeId);
      setFields(sortAndFilterFields(result));
    } catch (err) {
      setError(getErrorMessage(err, "获取自定义字段失败"));
      setFields([]);
    } finally {
      setIsLoading(false);
    }
    // projectIssueTypeService 是无状态封装，无需放入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, projectId, issueTypeId]);

  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

  return {
    fields,
    isLoading,
    error,
    refetch: fetchFields,
  };
};
