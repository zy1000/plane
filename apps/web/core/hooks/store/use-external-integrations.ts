import { useCallback, useEffect, useState } from "react";
import type { TExternalIntegration, TExternalIntegrationSyncError, TExternalIntegrationSyncResponse } from "@plane/types";
import { ExternalIntegrationService } from "@/services/external-integration.service";

const externalIntegrationService = new ExternalIntegrationService();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load integrations.";
  }
  return "Unable to load integrations.";
};

/**
 * 第三方集成设置页的局部 state（同 use-data-dictionaries 的路线，不进 root store）。
 * 传 undefined 的 workspaceSlug 表示不请求（无权限时）。
 */
export const useExternalIntegrations = (workspaceSlug: string | undefined) => {
  const [integrations, setIntegrations] = useState<TExternalIntegration[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug));
  const [error, setError] = useState<string | null>(null);
  // 按 key 记而不是全局 boolean：多个集成各自 loading
  const [syncingKey, setSyncingKey] = useState<string | null>(null);

  const fetchIntegrations = useCallback(async () => {
    if (!workspaceSlug) return [];
    setIsLoading(true);
    setError(null);
    try {
      const response = await externalIntegrationService.list(workspaceSlug);
      setIntegrations(response);
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void fetchIntegrations().catch(() => undefined);
  }, [fetchIntegrations]);

  const replaceIntegration = useCallback((next: TExternalIntegration) => {
    setIntegrations((current) => current.map((item) => (item.key === next.key ? next : item)));
  }, []);

  const syncIntegration = useCallback(
    async (key: string): Promise<TExternalIntegrationSyncResponse> => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setSyncingKey(key);
      try {
        const response = await externalIntegrationService.sync(workspaceSlug, key);
        replaceIntegration(response.integration);
        return response;
      } catch (requestError) {
        // 失败体里带更新后的集成（含 failed 快照）：先就地更新卡片，再抛给调用方 toast
        const payload = requestError as TExternalIntegrationSyncError | null;
        if (payload?.integration) replaceIntegration(payload.integration);
        throw requestError;
      } finally {
        setSyncingKey(null);
      }
    },
    [replaceIntegration, workspaceSlug]
  );

  return { integrations, isLoading, error, syncingKey, fetchIntegrations, syncIntegration };
};
