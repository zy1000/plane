import { useCallback, useEffect, useMemo, useState } from "react";
import type { TCreateStageTypePayload, TStageType, TUpdateStageTypePayload } from "@plane/types";
import { StageTypeService } from "@/services/stage-type.service";

const service = new StageTypeService();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load stage types.";
  }
  return "Unable to load stage types.";
};

/** 后端返回已按 sort_order 排好；本地乐观更新后再排一次，拖拽落点立刻正确 */
const sortStageTypes = (stageTypes: TStageType[]) =>
  [...stageTypes].sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));

export const useStageTypes = (workspaceSlug: string | undefined) => {
  const [stageTypes, setStageTypes] = useState<TStageType[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upsertStageType = useCallback((stageType: TStageType) => {
    setStageTypes((current) => {
      const index = current.findIndex((item) => item.id === stageType.id);
      const next = index === -1 ? [...current, stageType] : current.map((item) => (item.id === stageType.id ? stageType : item));
      return sortStageTypes(next);
    });
  }, []);

  const fetchStageTypes = useCallback(async () => {
    if (!workspaceSlug) return [];
    setIsLoading(true);
    setError(null);
    try {
      const response = await service.list(workspaceSlug);
      setStageTypes(sortStageTypes(response));
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void fetchStageTypes().catch(() => undefined);
  }, [fetchStageTypes]);

  const createStageType = useCallback(
    async (payload: TCreateStageTypePayload) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        const response = await service.create(workspaceSlug, payload);
        upsertStageType(response);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [upsertStageType, workspaceSlug]
  );

  const updateStageType = useCallback(
    async (stageTypeId: string, payload: TUpdateStageTypePayload) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        const response = await service.update(workspaceSlug, stageTypeId, payload);
        upsertStageType(response);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [upsertStageType, workspaceSlug]
  );

  const deleteStageType = useCallback(
    async (stageTypeId: string) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        await service.deleteStageType(workspaceSlug, stageTypeId);
        setStageTypes((current) => current.filter((item) => item.id !== stageTypeId));
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  /**
   * 拖拽排序：先按新顺序乐观改本地，再把完整 id 列表发给后端；失败就拉一次列表回滚。
   * 只改 sort_order，不动别的字段。
   */
  const reorderStageTypes = useCallback(
    async (orderedIds: string[]) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      const previous = stageTypes;
      const byId = new Map(stageTypes.map((item) => [item.id, item]));
      const next = orderedIds.flatMap((id, index) => {
        const item = byId.get(id);
        return item ? [{ ...item, sort_order: (index + 1) * 10000 }] : [];
      });
      setStageTypes(next);
      try {
        await service.reorder(workspaceSlug, orderedIds);
      } catch (requestError) {
        setStageTypes(previous);
        throw requestError;
      }
    },
    [stageTypes, workspaceSlug]
  );

  /** 评审模板等消费方要的 `{ id, label }` 形状 —— 阶段的显示名就是类型名 */
  const stageOptions = useMemo(
    () => stageTypes.map((stageType) => ({ id: stageType.id, label: stageType.name })),
    [stageTypes]
  );

  return {
    stageTypes,
    stageOptions,
    isLoading,
    isMutating,
    error,
    fetchStageTypes,
    createStageType,
    updateStageType,
    deleteStageType,
    reorderStageTypes,
  };
};
