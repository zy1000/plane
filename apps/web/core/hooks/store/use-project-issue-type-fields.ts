import { useCallback, useEffect, useState } from "react";
// services
import {
  ProjectIssueTypeService,
  type TTypeExtraField,
  type TTypeExtraFieldPayload,
} from "@/services/project/project-issue-type.service";

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
      setError(err instanceof Error ? err.message : "Failed to fetch issue type fields");
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
