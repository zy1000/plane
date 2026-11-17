import { useCallback, useEffect, useState } from "react";
import type { TRequirementFieldDefinition, TRequirementFieldDefinitionPayload } from "@plane/types";
import { RequirementFieldLibraryService } from "@/services/requirement-field-library.service";

const service = new RequirementFieldLibraryService();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "无法加载通用字段库。";
  }
  return "无法加载通用字段库。";
};

const sortFields = (fields: TRequirementFieldDefinition[]) =>
  [...fields].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "zh-CN"));

/**
 * 工作区需求通用字段库（局部 state）：字段库页与需求类型配置页左栏共用。
 * workspaceSlug 传 undefined 时不拉；增删改后就地改本地列表，不整表重拉。
 */
export const useRequirementFieldLibrary = (workspaceSlug: string | undefined) => {
  const [fields, setFields] = useState<TRequirementFieldDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug));
  const [error, setError] = useState<string | null>(null);
  /** 至少拉回来过一次：区分「加载中」和「库是空的」 */
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchFields = useCallback(async () => {
    if (!workspaceSlug) return [];
    setIsLoading(true);
    setError(null);
    try {
      const response = await service.list(workspaceSlug);
      setFields(sortFields(response));
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void fetchFields().catch(() => undefined);
  }, [fetchFields]);

  const createField = useCallback(
    async (payload: TRequirementFieldDefinitionPayload) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      const created = await service.create(workspaceSlug, payload);
      setFields((current) => sortFields([...current, created]));
      return created;
    },
    [workspaceSlug]
  );

  const updateField = useCallback(
    async (fieldId: string, payload: TRequirementFieldDefinitionPayload) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      const updated = await service.update(workspaceSlug, fieldId, payload);
      setFields((current) => sortFields(current.map((field) => (field.id === fieldId ? updated : field))));
      return updated;
    },
    [workspaceSlug]
  );

  const deleteField = useCallback(
    async (fieldId: string) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      await service.remove(workspaceSlug, fieldId);
      setFields((current) => current.filter((field) => field.id !== fieldId));
    },
    [workspaceSlug]
  );

  /** 把类型里的私有字段转为通用字段；成功后新字段直接进本地列表 */
  const promoteField = useCallback(
    async (requirementTypeId: string, fieldId: string) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      const created = await service.promote(workspaceSlug, requirementTypeId, fieldId);
      setFields((current) => sortFields([...current.filter((field) => field.id !== created.id), created]));
      return created;
    },
    [workspaceSlug]
  );

  return { fields, isLoading, hasLoaded, error, fetchFields, createField, updateField, deleteField, promoteField };
};
