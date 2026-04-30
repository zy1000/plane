import { useCallback, useEffect, useState } from "react";
// services
import { ProjectIssueTypeService, type TIssueType, projectIssueTypesCache } from "@/services/project/project-issue-type.service";

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "msg" in error && typeof error.msg === "string") return error.msg;
  return fallback;
};

export const useProjectIssueTypes = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const [issueTypes, setIssueTypes] = useState<TIssueType[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectIssueTypeService = new ProjectIssueTypeService();

  const fetchIssueTypes = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;

    // 首先检查缓存
    const cacheKey = projectId;
    const cachedTypes = projectIssueTypesCache.get(cacheKey);
    
    if (cachedTypes) {
      // 如果缓存中有数据，直接使用
      setIssueTypes(Object.values(cachedTypes));
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const types = await projectIssueTypeService.fetchProjectIssueTypes(workspaceSlug, projectId);
      setIssueTypes(types);
      
      // 更新缓存
      const typesMap = types.reduce((acc, type) => {
        acc[type.id] = type;
        return acc;
      }, {} as Record<string, TIssueType>);
      projectIssueTypesCache.set(cacheKey, typesMap);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to fetch issue types"));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, projectId]);

  const forceFetchIssueTypes = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;

    // 首先检查缓存
    const cacheKey = projectId;
    
    setIsLoading(true);
    setError(null);

    try {
      const types = await projectIssueTypeService.fetchProjectIssueTypes(workspaceSlug, projectId, true);
      setIssueTypes(types);
      
      // 更新缓存
      const typesMap = types.reduce((acc, type) => {
        acc[type.id] = type;
        return acc;
      }, {} as Record<string, TIssueType>);
      projectIssueTypesCache.set(cacheKey, typesMap);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to fetch issue types"));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, projectId]);

  const fetchIssueType = useCallback(
    async (issueTypeId: string) => {
      if (!workspaceSlug || !projectId) return;

      const issueType = await projectIssueTypeService.fetchProjectIssueType(workspaceSlug, projectId, issueTypeId);
      setIssueTypes((prev) => {
        const existingIssueTypes = prev ?? [];
        const exists = existingIssueTypes.some((type) => type.id === issueTypeId);

        return exists
          ? existingIssueTypes.map((type) => (type.id === issueTypeId ? issueType : type))
          : [...existingIssueTypes, issueType];
      });
      return issueType;
    },
    [workspaceSlug, projectId]
  );

  const createIssueType = useCallback(
    async (data: Partial<TIssueType>) => {
      if (!workspaceSlug || !projectId) return;

      const createdIssueType = await projectIssueTypeService.createProjectIssueType(workspaceSlug, projectId, data);
      setIssueTypes((prev) => [...(prev ?? []), createdIssueType]);
      projectIssueTypesCache.set(projectId, {
        ...(projectIssueTypesCache.get(projectId) ?? {}),
        [createdIssueType.id]: createdIssueType,
      });
      return createdIssueType;
    },
    [workspaceSlug, projectId]
  );

  const updateIssueType = useCallback(
    async (issueTypeId: string, data: Partial<TIssueType>) => {
      if (!workspaceSlug || !projectId) return;

      const updatedIssueType = await projectIssueTypeService.updateProjectIssueType(
        workspaceSlug,
        projectId,
        issueTypeId,
        data
      );
      setIssueTypes((prev) => prev?.map((issueType) => (issueType.id === issueTypeId ? updatedIssueType : issueType)));
      projectIssueTypesCache.set(projectId, {
        ...(projectIssueTypesCache.get(projectId) ?? {}),
        [issueTypeId]: updatedIssueType,
      });
      return updatedIssueType;
    },
    [workspaceSlug, projectId]
  );

  const deleteIssueType = useCallback(
    async (issueTypeId: string) => {
      if (!workspaceSlug || !projectId) return;

      await projectIssueTypeService.deleteProjectIssueType(workspaceSlug, projectId, issueTypeId);
      setIssueTypes((prev) => prev?.filter((issueType) => issueType.id !== issueTypeId));
      const cache = projectIssueTypesCache.get(projectId);
      if (cache) {
        delete cache[issueTypeId];
        projectIssueTypesCache.set(projectId, cache);
      }
    },
    [workspaceSlug, projectId]
  );

  useEffect(() => {
    fetchIssueTypes();
  }, [fetchIssueTypes]);


  return {
    issueTypes,
    isLoading,
    error,
    refetch: fetchIssueTypes,
    forceRefetch: forceFetchIssueTypes,
    fetchIssueType,
    createIssueType,
    updateIssueType,
    deleteIssueType,
  };
};