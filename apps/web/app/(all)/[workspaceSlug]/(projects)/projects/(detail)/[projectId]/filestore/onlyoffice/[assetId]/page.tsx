"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Alert, Button } from "antd";
import { PROJECT_ASSET_VIEW_PERMISSION_KEY } from "@plane/constants";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { useUserPermissions } from "@/hooks/store/user";
import { FilestoreService } from "@/services/filestore.service";

function FilestoreOnlyOfficePage() {
  const { workspaceSlug, projectId, assetId } = useParams<{ workspaceSlug: string; projectId: string; assetId: string }>();
  const { workspaceUserInfo, allowProjectPermissionKeys } = useUserPermissions();
  const service = useMemo(() => new FilestoreService(), []);
  const canViewFilestore = allowProjectPermissionKeys(
    [PROJECT_ASSET_VIEW_PERMISSION_KEY],
    workspaceSlug?.toString(),
    projectId?.toString()
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [docKey, setDocKey] = useState<string>("");
  const [dirty, setDirty] = useState(false);

  const editorRef = useRef<any>(null);
  const containerHostRef = useRef<HTMLDivElement>(null);
  const editorRunIdRef = useRef(0);
  const docKeyRef = useRef<string>("");
  const dirtyRef = useRef<boolean>(false);
  const forceSaveInFlightRef = useRef<boolean>(false);
  const lastForceSaveAtRef = useRef<number>(0);

  const containerId = useMemo(() => {
    const id = String(assetId ?? "").trim();
    return id ? `onlyoffice-editor-${id}` : "onlyoffice-editor";
  }, [assetId]);

  const destroyEditor = useCallback(() => {
    try {
      editorRef.current?.destroyEditor?.();
    } catch {
    } finally {
      editorRef.current = null;
      containerHostRef.current?.replaceChildren();
    }
  }, []);

  const createEditorContainer = useCallback(() => {
    const host = containerHostRef.current;
    if (!host) return null;

    host.replaceChildren();
    const container = document.createElement("div");
    container.id = containerId;
    container.className = "h-full w-full";
    host.appendChild(container);
    return container;
  }, [containerId]);

  useEffect(() => {
    docKeyRef.current = docKey;
  }, [docKey]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const loadOnlyOfficeScript = useCallback(async (documentServerUrl: string) => {
    const url = String(documentServerUrl || "").replace(/\/+$/, "");
    if (!url) throw new Error("document_server_url 为空");

    const w = window as any;
    if (w.DocsAPI?.DocEditor) return;

    const scriptId = `onlyoffice-docsapi-${encodeURIComponent(url)}`;
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    const existingPromise = w.__onlyofficeScriptPromises?.[scriptId];
    if (existingPromise) return existingPromise;

    const p: Promise<void> = new Promise<void>((resolve, reject) => {
      const script = existing ?? document.createElement("script");
      script.id = scriptId;
      script.src = `${url}/web-apps/apps/api/documents/api.js`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("OnlyOffice 脚本加载失败"));
      if (!existing) document.body.appendChild(script);
    });

    w.__onlyofficeScriptPromises = w.__onlyofficeScriptPromises ?? {};
    w.__onlyofficeScriptPromises[scriptId] = p;
    return p;
  }, []);

  const triggerForceSave = useCallback(
    async (source: "editor_request_save" | "editor_state_saved" | "interval") => {
      if (!workspaceSlug || !projectId || !assetId) return;
      if (source === "interval" && !dirtyRef.current) return;
      if (forceSaveInFlightRef.current) return;

      const now = Date.now();
      if (now - lastForceSaveAtRef.current < 1500) return;
      lastForceSaveAtRef.current = now;

      const key = docKeyRef.current;
      if (!key) return;

      forceSaveInFlightRef.current = true;
      try {
        await service.forceSaveOnlyOffice(String(workspaceSlug), String(projectId), String(assetId), key);
      } finally {
        forceSaveInFlightRef.current = false;
      }
    },
    [assetId, projectId, service, workspaceSlug]
  );

  const initEditor = useCallback(
    async (serverUrl: string, config: Record<string, any>, runId: number) => {
      await loadOnlyOfficeScript(serverUrl);
      if (editorRunIdRef.current !== runId) return;

      const w = window as any;
      if (!w.DocsAPI?.DocEditor) throw new Error("DocsAPI 未加载");

      destroyEditor();
      const mountEl = createEditorContainer();
      if (!mountEl) throw new Error(`编辑器挂载节点未就绪: #${containerId}`);

      const enrichedConfig: Record<string, any> = {
        ...config,
        events: {
          ...(config?.events ?? {}),
          onDocumentReady: () => {
            setError("");
          },
          onDocumentStateChange: (event: any) => {
            const nextDirty = Boolean(event?.data);
            const wasDirty = dirtyRef.current;
            setDirty(nextDirty);
            dirtyRef.current = nextDirty;
            if (wasDirty && !nextDirty) void triggerForceSave("editor_state_saved");
          },
          onRequestSave: () => {
            void triggerForceSave("editor_request_save");
          },
          onError: (event: any) => {
            const code = event?.data?.errorCode;
            const desc = event?.data?.errorDescription;
            setError(`编辑器错误: ${code ?? ""}${desc ? ` ${desc}` : ""}`.trim());
          },
        },
      };

      editorRef.current = new w.DocsAPI.DocEditor(containerId, enrichedConfig);
    },
    [containerId, createEditorContainer, destroyEditor, loadOnlyOfficeScript, triggerForceSave]
  );

  const refresh = useCallback(async () => {
    if (!workspaceSlug || !projectId || !assetId) return;
    const runId = editorRunIdRef.current + 1;
    editorRunIdRef.current = runId;
    setLoading(true);
    setError("");
    try {
      const res = await service.getOnlyOfficeConfig(String(workspaceSlug), String(projectId), String(assetId));
      const serverUrl = String(res?.document_server_url ?? "");
      const config = (res?.config ?? {}) as Record<string, any>;
      const key = String(config?.document?.key ?? "");
      setDocKey(key);
      docKeyRef.current = key;
      await initEditor(serverUrl, config, runId);
    } catch (e: any) {
      if (editorRunIdRef.current !== runId) return;
      setError(e?.detail || e?.message || "加载编辑器失败");
    } finally {
      if (editorRunIdRef.current === runId) setLoading(false);
    }
  }, [assetId, initEditor, projectId, service, workspaceSlug]);

  useEffect(() => {
    void refresh();
    return () => {
      editorRunIdRef.current += 1;
      destroyEditor();
      docKeyRef.current = "";
      dirtyRef.current = false;
      forceSaveInFlightRef.current = false;
      lastForceSaveAtRef.current = 0;
    };
  }, [destroyEditor, refresh]);

  useEffect(() => {
    const t = window.setInterval(() => {
      if (!dirtyRef.current) return;
      void triggerForceSave("interval");
    }, 60000);
    return () => window.clearInterval(t);
  }, [triggerForceSave]);

  if (workspaceUserInfo && workspaceSlug && projectId && !canViewFilestore) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  return (
    <div className="fixed inset-0 z-50 bg-surface-1">
      {error && (
        <div className="absolute left-0 right-0 top-0 z-20 p-3">
          <Alert
            type="error"
            showIcon
            message="编辑器加载/运行异常"
            description={
              <div className="flex items-center justify-between gap-3">
                <span className="break-all">{error}</span>
                <Button size="small" onClick={() => void refresh()} disabled={loading}>
                  重试
                </Button>
              </div>
            }
          />
        </div>
      )}
      <div className="absolute inset-0">
        {loading && <div className="absolute inset-0 z-10 bg-white/60" />}
        <div ref={containerHostRef} className="h-full w-full" />
      </div>
    </div>
  );
}

export default observer(FilestoreOnlyOfficePage);

