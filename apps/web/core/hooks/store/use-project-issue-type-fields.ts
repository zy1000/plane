import { useCallback, useEffect, useState } from "react";
// services
import {
  ProjectIssueTypeService,
  type TTypeExtraField,
  type TTypeExtraFieldPayload,
} from "@/services/project/project-issue-type.service";

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "msg" in error && typeof error.msg === "string") return error.msg;
  return fallback;
};

type TBoundFieldsListener = (createdFields: TTypeExtraField[]) => void;

/**
 * 同一作用域的字段列表可能同时有几个实例（项目设置、模板中心类型详情各自持有一份）。
 * 「从字段库添加」只拿得到作用域，拿不到具体实例，绑定成功后按作用域广播新建的行，各实例就地追加。
 */
const boundFieldsListeners = new Map<string, Set<TBoundFieldsListener>>();
const scopeListenerKey = (workspaceSlug: string, projectId: string) => `${workspaceSlug}:${projectId}`;

/** 把字段库字段批量绑定到某个类型；projectId 同 useProjectIssueTypeFields（项目 id 或方案作用域键） */
export const bindLibraryFieldsToIssueType = async (
  workspaceSlug: string,
  projectId: string,
  issueTypeId: string,
  libraryFieldIds: string[]
) => {
  const createdFields = await new ProjectIssueTypeService().bindLibraryFields(
    workspaceSlug,
    projectId,
    issueTypeId,
    libraryFieldIds
  );
  boundFieldsListeners.get(scopeListenerKey(workspaceSlug, projectId))?.forEach((listener) => listener(createdFields));
  return createdFields;
};

export const useProjectIssueTypeFields = (workspaceSlug: string | undefined, projectId: string | undefined) => {
  const [fields, setFields] = useState<TTypeExtraField[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const projectIssueTypeService = new ProjectIssueTypeService();

  const fetchFields = useCallback(async () => {
    if (!workspaceSlug || !projectId) return;

    setIsLoading(true);
    setError(null);

    try {
      const typeFields = await projectIssueTypeService.fetchTypeExtraFields(workspaceSlug, projectId);
      setFields(typeFields);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to fetch issue type fields"));
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, projectId]);

  const createField = useCallback(
    async (data: TTypeExtraFieldPayload) => {
      if (!workspaceSlug || !projectId) return;

      const createdField = await projectIssueTypeService.createTypeExtraField(workspaceSlug, projectId, data);
      setFields((prev) => [...(prev ?? []), createdField]);
      return createdField;
    },
    [workspaceSlug, projectId]
  );

  const updateField = useCallback(
    async (fieldId: string, data: Partial<TTypeExtraField>) => {
      if (!workspaceSlug || !projectId) return;

      const updatedField = await projectIssueTypeService.updateTypeExtraField(workspaceSlug, projectId, fieldId, data);
      setFields((prev) => prev?.map((field) => (field.id === fieldId ? updatedField : field)));
      return updatedField;
    },
    [workspaceSlug, projectId]
  );

  const deleteField = useCallback(
    async (fieldId: string) => {
      if (!workspaceSlug || !projectId) return;

      await projectIssueTypeService.deleteTypeExtraField(workspaceSlug, projectId, fieldId);
      setFields((prev) => prev?.filter((field) => field.id !== fieldId));
    },
    [workspaceSlug, projectId]
  );

  useEffect(() => {
    fetchFields();
  }, [fetchFields]);

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    const key = scopeListenerKey(workspaceSlug, projectId);
    const listener: TBoundFieldsListener = (createdFields) =>
      setFields((prev) => {
        if (!prev) return prev;
        const existingIds = new Set(prev.map((field) => field.id));
        return [...prev, ...createdFields.filter((field) => !existingIds.has(field.id))];
      });
    const listeners = boundFieldsListeners.get(key) ?? new Set<TBoundFieldsListener>();
    listeners.add(listener);
    boundFieldsListeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && boundFieldsListeners.get(key) === listeners) boundFieldsListeners.delete(key);
    };
  }, [workspaceSlug, projectId]);

  return {
    fields,
    isLoading,
    error,
    refetch: fetchFields,
    createField,
    updateField,
    deleteField,
  };
};
