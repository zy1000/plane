import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FilestoreService, type TOnlyOfficeStatusResponse } from "@/services/filestore.service";

export type TOnlyOfficeSaveStatus = "已保存" | "未保存" | "保存中" | "保存失败";

type TUseOnlyOfficeSaveArgs = {
  workspaceSlug?: string;
  projectId?: string;
  assetId?: string;
  docKey?: string;
  enabled: boolean;
};

const SAVE_POLL_INTERVAL_MS = 1500;
const SAVE_POLL_ATTEMPTS = 20;
const AUTO_SAVE_INTERVAL_MS = 60000;
const DOCUMENT_SYNC_INTERVAL_MS = 250;
const DOCUMENT_SYNC_ATTEMPTS = 40;

const wait = (duration: number) => new Promise((resolve) => window.setTimeout(resolve, duration));

export const useOnlyOfficeSave = ({ workspaceSlug, projectId, assetId, docKey, enabled }: TUseOnlyOfficeSaveArgs) => {
  const service = useMemo(() => new FilestoreService(), []);
  const [saveStatus, setSaveStatus] = useState<TOnlyOfficeSaveStatus>("已保存");
  const [saveError, setSaveError] = useState("");

  const editGenerationRef = useRef(0);
  const persistedGenerationRef = useRef(0);
  const documentDirtyRef = useRef(false);
  const inFlightPromiseRef = useRef<Promise<boolean> | null>(null);
  const lifecycleIdRef = useRef(0);
  const contextRef = useRef({ workspaceSlug, projectId, assetId, docKey, enabled });
  contextRef.current = { workspaceSlug, projectId, assetId, docKey, enabled };

  const configure = useCallback((context: Partial<TUseOnlyOfficeSaveArgs>) => {
    contextRef.current = { ...contextRef.current, ...context };
  }, []);

  const reset = useCallback(() => {
    lifecycleIdRef.current += 1;
    editGenerationRef.current = 0;
    persistedGenerationRef.current = 0;
    documentDirtyRef.current = false;
    inFlightPromiseRef.current = null;
    setSaveError("");
    setSaveStatus("已保存");
  }, []);

  useEffect(() => {
    reset();
  }, [assetId, docKey, reset]);

  useEffect(
    () => () => {
      lifecycleIdRef.current += 1;
      contextRef.current.enabled = false;
    },
    []
  );

  const pollSaveRequest = useCallback(
    async (saveRequestId: string, lifecycleId: number): Promise<boolean> => {
      const context = contextRef.current;
      const activeWorkspaceSlug = context.workspaceSlug;
      const activeProjectId = context.projectId;
      const activeAssetId = context.assetId;
      const activeDocKey = context.docKey;
      if (!activeWorkspaceSlug || !activeProjectId || !activeAssetId || !activeDocKey) return false;

      const pollAttempt = async (attempt: number, lastError: unknown): Promise<boolean> => {
        if (lifecycleIdRef.current !== lifecycleId) return false;
        if (attempt >= SAVE_POLL_ATTEMPTS) {
          const detail = (lastError as any)?.error || (lastError as any)?.detail || (lastError as any)?.message || "";
          throw new Error(detail ? `等待 OnlyOffice 保存回调超时：${detail}` : "等待 OnlyOffice 保存回调超时");
        }

        let response: TOnlyOfficeStatusResponse;
        try {
          response = await service.getOnlyOfficeStatus(activeWorkspaceSlug, activeProjectId, activeAssetId, {
            docKey: activeDocKey,
            saveRequestId,
          });
        } catch (error: any) {
          await wait(SAVE_POLL_INTERVAL_MS);
          return pollAttempt(attempt + 1, error);
        }
        const requestState = response.session?.save_request;
        if (requestState?.status === "saved" || requestState?.status === "no_changes") return true;
        if (requestState?.status === "failed") {
          throw new Error(requestState.error || response.session?.last_error || "保存失败");
        }
        await wait(SAVE_POLL_INTERVAL_MS);
        return pollAttempt(attempt + 1, null);
      };

      return pollAttempt(0, null);
    },
    [service]
  );

  const waitForDocumentSync = useCallback(async (lifecycleId: number, attempt = 0): Promise<boolean> => {
    if (lifecycleIdRef.current !== lifecycleId) return false;
    if (!documentDirtyRef.current) return true;
    if (attempt >= DOCUMENT_SYNC_ATTEMPTS) return false;
    await wait(DOCUMENT_SYNC_INTERVAL_MS);
    return waitForDocumentSync(lifecycleId, attempt + 1);
  }, []);

  const runSaveCycle = useCallback(
    async (targetGeneration: number): Promise<boolean> => {
      const context = contextRef.current;
      if (!context.enabled || !context.workspaceSlug || !context.projectId || !context.assetId || !context.docKey)
        return true;

      const lifecycleId = lifecycleIdRef.current;
      setSaveStatus("保存中");
      setSaveError("");
      if (!(await waitForDocumentSync(lifecycleId))) {
        if (lifecycleIdRef.current !== lifecycleId) return false;
        setSaveError("编辑器仍在同步最新修改，请稍后重试保存");
        setSaveStatus("保存失败");
        return false;
      }
      try {
        const response = await service.forceSaveOnlyOffice(
          context.workspaceSlug,
          context.projectId,
          context.assetId,
          context.docKey
        );
        if (response.status === "accepted") await pollSaveRequest(response.save_request_id, lifecycleId);
        if (lifecycleIdRef.current !== lifecycleId) return false;
        persistedGenerationRef.current = Math.max(persistedGenerationRef.current, targetGeneration);
        if (editGenerationRef.current <= persistedGenerationRef.current) {
          documentDirtyRef.current = false;
          setSaveStatus("已保存");
        } else {
          setSaveStatus("未保存");
        }
        return true;
      } catch (error: any) {
        if (lifecycleIdRef.current !== lifecycleId) return false;
        setSaveError(error?.error || error?.detail || error?.message || "保存失败");
        setSaveStatus("保存失败");
        return false;
      }
    },
    [pollSaveRequest, service, waitForDocumentSync]
  );

  const flush = useCallback(
    async (force = false): Promise<boolean> => {
      if (!contextRef.current.enabled) return true;
      if (!force && editGenerationRef.current <= persistedGenerationRef.current && !documentDirtyRef.current) {
        return true;
      }

      if (inFlightPromiseRef.current) {
        const completed = await inFlightPromiseRef.current;
        if (!completed) return false;
        if (editGenerationRef.current <= persistedGenerationRef.current) return true;
      }

      const targetGeneration = editGenerationRef.current;
      const savePromise = runSaveCycle(targetGeneration);
      inFlightPromiseRef.current = savePromise;
      const completed = await savePromise;
      if (inFlightPromiseRef.current === savePromise) inFlightPromiseRef.current = null;
      if (!completed) return false;

      if (editGenerationRef.current > persistedGenerationRef.current) {
        return flush(false);
      }
      return true;
    },
    [runSaveCycle]
  );

  const onDocumentStateChange = useCallback(
    (dirty: boolean) => {
      const wasDirty = documentDirtyRef.current;
      documentDirtyRef.current = dirty;
      if (dirty) {
        if (!wasDirty) editGenerationRef.current += 1;
        setSaveStatus("未保存");
        return;
      }
      if (editGenerationRef.current > persistedGenerationRef.current) void flush();
    },
    [flush]
  );

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      if (editGenerationRef.current > persistedGenerationRef.current) void flush();
    }, AUTO_SAVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, flush]);

  useEffect(() => {
    if (!enabled) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!contextRef.current.enabled || editGenerationRef.current <= persistedGenerationRef.current) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [enabled]);

  return {
    saveStatus,
    saveError,
    hasUnconfirmedChanges:
      editGenerationRef.current > persistedGenerationRef.current ||
      saveStatus === "保存中" ||
      saveStatus === "保存失败",
    onDocumentStateChange,
    flush,
    reset,
    configure,
  };
};
