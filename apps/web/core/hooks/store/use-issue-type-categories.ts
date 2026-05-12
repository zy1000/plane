/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import type { TIssueTypeCategory } from "@plane/types";
import { IssueTypeCategoryService } from "@/services/issue-type-category.service";

const issueTypeCategoryService = new IssueTypeCategoryService();

export const useIssueTypeCategories = (workspaceSlug: string | undefined) => {
  const [categories, setCategories] = useState<TIssueTypeCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    if (!workspaceSlug) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await issueTypeCategoryService.list(workspaceSlug);
      setCategories(data);
    } catch {
      setError("获取工作项类别失败");
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug]);

  const createCategory = useCallback(
    async (data: Partial<TIssueTypeCategory>): Promise<TIssueTypeCategory> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      const created = await issueTypeCategoryService.create(workspaceSlug, data);
      setCategories((prev) => [...prev, created]);
      return created;
    },
    [workspaceSlug]
  );

  const updateCategory = useCallback(
    async (categoryId: string, data: Partial<TIssueTypeCategory>): Promise<TIssueTypeCategory> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      const updated = await issueTypeCategoryService.update(workspaceSlug, categoryId, data);
      setCategories((prev) => prev.map((c) => (c.id === categoryId ? updated : c)));
      return updated;
    },
    [workspaceSlug]
  );

  const deleteCategory = useCallback(
    async (categoryId: string): Promise<void> => {
      if (!workspaceSlug) throw new Error("缺少 workspaceSlug");
      await issueTypeCategoryService.deleteCategory(workspaceSlug, categoryId);
      setCategories((prev) => prev.filter((c) => c.id !== categoryId));
    },
    [workspaceSlug]
  );

  return {
    categories,
    isLoading,
    error,
    fetchCategories,
    createCategory,
    updateCategory,
    deleteCategory,
  };
};
