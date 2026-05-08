/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ProjectIssueTypeService,
  getCachedTypeExtraFields,
  type TTypeExtraField,
} from "@/services/project/project-issue-type.service";

const projectIssueTypeService = new ProjectIssueTypeService();

/**
 * Fetches all active type extra fields for a project (across all issue types).
 *
 * Uses module-level SWR semantics: serves stale cache immediately, then revalidates.
 * Returns null while loading with no cached data, [] when definitely empty.
 */
export const useProjectTypeExtraFields = (
  workspaceSlug: string | undefined,
  projectId: string | undefined
) => {
  const getInitialFields = (): TTypeExtraField[] | null => {
    if (!workspaceSlug || !projectId) return [];
    const cached = getCachedTypeExtraFields(workspaceSlug, projectId);
    if (cached !== undefined) return cached.filter((f) => f.is_active !== false);
    return null;
  };

  const [fields, setFields] = useState<TTypeExtraField[] | null>(getInitialFields);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prevSlugRef = useRef<string | undefined>(undefined);
  const prevProjectRef = useRef<string | undefined>(undefined);

  const fetchFields = useCallback(async () => {
    if (!workspaceSlug || !projectId) {
      setFields([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await projectIssueTypeService.fetchTypeExtraFields(workspaceSlug, projectId);
      setFields(result.filter((f) => f.is_active !== false));
    } catch {
      setError("获取自定义字段失败");
      setFields([]);
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, projectId]);

  useEffect(() => {
    const slugChanged = workspaceSlug !== prevSlugRef.current;
    const projectChanged = projectId !== prevProjectRef.current;
    prevSlugRef.current = workspaceSlug;
    prevProjectRef.current = projectId;

    if (!workspaceSlug || !projectId) {
      setFields([]);
      return;
    }

    if (slugChanged || projectChanged) {
      // Reset immediately so stale data from previous project doesn't linger
      const cached = getCachedTypeExtraFields(workspaceSlug, projectId);
      if (cached !== undefined) {
        setFields(cached.filter((f) => f.is_active !== false));
      } else {
        setFields(null);
      }
    }

    fetchFields();
  }, [fetchFields, workspaceSlug, projectId]);

  return { fields, isLoading, error, refetch: fetchFields };
};
