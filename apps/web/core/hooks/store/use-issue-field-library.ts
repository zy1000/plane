import { useCallback, useEffect, useState } from "react";
import type { TIssueFieldLibraryItem, TIssueFieldLibraryPayload } from "@plane/types";
import { IssueFieldLibraryService } from "@/services/issue-field-library.service";

const service = new IssueFieldLibraryService();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "无法加载字段库。";
  }
  return "无法加载字段库。";
};

const sortFields = (fields: TIssueFieldLibraryItem[]) =>
  [...fields].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "zh-CN"));

/**
 * 工作区通用字段库（局部 state）：字段库页与「从字段库添加」弹窗共用。
 * workspaceSlug 传 undefined 时不拉（弹窗关着时）；增删改后就地改本地列表，不整表重拉。
 */
export const useIssueFieldLibrary = (workspaceSlug: string | undefined) => {
  const [fields, setFields] = useState<TIssueFieldLibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug));
  const [error, setError] = useState<string | null>(null);
  /** 至少拉回来过一次：弹窗里首次打开时区分「加载中」和「库是空的」 */
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
    async (payload: TIssueFieldLibraryPayload) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      const created = await service.create(workspaceSlug, payload);
      setFields((current) => sortFields([...current, created]));
      return created;
    },
    [workspaceSlug]
  );

  const updateField = useCallback(
    async (fieldId: string, payload: TIssueFieldLibraryPayload) => {
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

  return { fields, isLoading, hasLoaded, error, fetchFields, createField, updateField, deleteField };
};
