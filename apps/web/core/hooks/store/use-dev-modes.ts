import { useCallback, useEffect, useState } from "react";
import type { TCreateDevModePayload, TDevMode, TUpdateDevModePayload } from "@plane/types";
import { DevModeService } from "@/services/dev-mode.service";

const service = new DevModeService();

export const getDevModeErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as Record<string, unknown>;
    const message = payload.error ?? payload.detail;
    if (typeof message === "string") return message;
    // DRF 的字段级错误：{ name: ["DEV_MODE_NAME_ALREADY_EXISTS"] }
    const first = Object.values(payload)[0];
    if (Array.isArray(first) && typeof first[0] === "string") return first[0];
  }
  return "Something went wrong.";
};

/** 研发模式列表：模板中心「研发模式」页签的数据源 */
export const useDevModes = (workspaceSlug: string | undefined) => {
  const [devModes, setDevModes] = useState<TDevMode[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDevModes = useCallback(async () => {
    if (!workspaceSlug) return [];
    setIsLoading(true);
    setError(null);
    try {
      const response = await service.list(workspaceSlug);
      setDevModes(response);
      return response;
    } catch (requestError) {
      setError(getDevModeErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void fetchDevModes().catch(() => undefined);
  }, [fetchDevModes]);

  const upsert = useCallback((devMode: TDevMode) => {
    setDevModes((current) => {
      const index = current.findIndex((item) => item.id === devMode.id);
      if (index === -1) return [...current, devMode];
      const next = [...current];
      // PATCH 的响应不带 annotate 出来的计数，保留本地已有的那几个数字
      next[index] = { ...next[index], ...devMode };
      return next;
    });
  }, []);

  const createDevMode = useCallback(
    async (payload: TCreateDevModePayload) => {
      if (!workspaceSlug) return undefined;
      setIsMutating(true);
      try {
        const created = await service.create(workspaceSlug, payload);
        upsert(created);
        return created;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, upsert]
  );

  const updateDevMode = useCallback(
    async (devModeId: string, payload: TUpdateDevModePayload) => {
      if (!workspaceSlug) return undefined;
      setIsMutating(true);
      try {
        const updated = await service.update(workspaceSlug, devModeId, payload);
        upsert(updated);
        return updated;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, upsert]
  );

  const deleteDevMode = useCallback(
    async (devModeId: string) => {
      if (!workspaceSlug) return;
      setIsMutating(true);
      try {
        await service.deleteDevMode(workspaceSlug, devModeId);
        setDevModes((current) => current.filter((item) => item.id !== devModeId));
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  return {
    devModes,
    isLoading,
    isMutating,
    error,
    fetchDevModes,
    createDevMode,
    updateDevMode,
    deleteDevMode,
  };
};

export type TDevModesStore = ReturnType<typeof useDevModes>;
