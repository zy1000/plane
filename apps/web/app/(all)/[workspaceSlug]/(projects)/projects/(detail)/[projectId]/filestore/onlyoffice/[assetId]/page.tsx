"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Alert, Button, Tag } from "antd";
import { PROJECT_ASSET_EDIT_PERMISSION_KEY, PROJECT_ASSET_VIEW_PERMISSION_KEY } from "@plane/constants";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { useOnlyOfficeSave } from "@/hooks/use-onlyoffice-save";
import { useUserPermissions } from "@/hooks/store/user";
import { FilestoreService } from "@/services/filestore.service";

function FilestoreOnlyOfficePage() {
  const { workspaceSlug, projectId, assetId } = useParams<{
    workspaceSlug: string;
    projectId: string;
    assetId: string;
  }>();
  const { workspaceUserInfo, allowProjectPermissionKeys } = useUserPermissions();
  const service = useMemo(() => new FilestoreService(), []);
  const canViewFilestore = allowProjectPermissionKeys(
    [PROJECT_ASSET_VIEW_PERMISSION_KEY],
    workspaceSlug?.toString(),
    projectId?.toString()
  );
  // 该页面是 OnlyOffice 在线编辑入口，必须具备「编辑项目资产」权限才能打开。
  const canEditFilestore = allowProjectPermissionKeys(
    [PROJECT_ASSET_EDIT_PERMISSION_KEY],
    workspaceSlug?.toString(),
    projectId?.toString()
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [docKey, setDocKey] = useState<string>("");

  const editorRef = useRef<any>(null);
  const containerHostRef = useRef<HTMLDivElement>(null);
  const editorRunIdRef = useRef(0);
  const {
    saveStatus,
    saveError,
    onDocumentStateChange,
    flush: flushOnlyOfficeSave,
    reset: resetOnlyOfficeSave,
    configure: configureOnlyOfficeSave,
  } = useOnlyOfficeSave({
    workspaceSlug: String(workspaceSlug ?? ""),
    projectId: String(projectId ?? ""),
    assetId: String(assetId ?? ""),
    docKey,
    enabled: Boolean(docKey),
  });

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

  const requestCloseEditor = useCallback(async () => {
    const saved = await flushOnlyOfficeSave(true);
    if (!saved) return;

    configureOnlyOfficeSave({ enabled: false, assetId: "", docKey: "" });
    destroyEditor();
    window.close();
    window.setTimeout(() => {
      if (window.closed || !workspaceSlug || !projectId) return;
      window.location.assign(
        `/${encodeURIComponent(String(workspaceSlug))}/projects/${encodeURIComponent(String(projectId))}/filestore`
      );
    }, 100);
  }, [configureOnlyOfficeSave, destroyEditor, flushOnlyOfficeSave, projectId, workspaceSlug]);

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
            onDocumentStateChange(Boolean(event?.data));
          },
          onRequestClose: () => void requestCloseEditor(),
          onError: (event: any) => {
            const code = event?.data?.errorCode;
            const desc = event?.data?.errorDescription;
            setError(`编辑器错误: ${code ?? ""}${desc ? ` ${desc}` : ""}`.trim());
          },
        },
      };

      editorRef.current = new w.DocsAPI.DocEditor(containerId, enrichedConfig);
    },
    [containerId, createEditorContainer, destroyEditor, loadOnlyOfficeScript, onDocumentStateChange, requestCloseEditor]
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
      resetOnlyOfficeSave();
      configureOnlyOfficeSave({
        assetId: String(assetId),
        docKey: key,
        enabled: true,
      });
      setDocKey(key);
      await initEditor(serverUrl, config, runId);
    } catch (e: any) {
      if (editorRunIdRef.current !== runId) return;
      setError(e?.error || e?.detail || e?.message || "加载编辑器失败");
    } finally {
      if (editorRunIdRef.current === runId) setLoading(false);
    }
  }, [assetId, configureOnlyOfficeSave, initEditor, projectId, resetOnlyOfficeSave, service, workspaceSlug]);

  useEffect(() => {
    void refresh();
    return () => {
      editorRunIdRef.current += 1;
      configureOnlyOfficeSave({ enabled: false, assetId: "", docKey: "" });
      destroyEditor();
    };
  }, [configureOnlyOfficeSave, destroyEditor, refresh]);

  if (workspaceUserInfo && workspaceSlug && projectId && (!canViewFilestore || !canEditFilestore)) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  return (
    <div className="fixed inset-0 z-50 bg-surface-1">
      {(error || saveError) && (
        <div className="absolute top-0 right-0 left-0 z-20 p-3">
          <Alert
            type="error"
            showIcon
            message={error ? "编辑器加载/运行异常" : "文档保存失败"}
            description={
              <div className="flex items-center justify-between gap-3">
                <span className="break-all">{error || saveError}</span>
                {error && (
                  <Button size="small" onClick={() => void refresh()} disabled={loading}>
                    重试
                  </Button>
                )}
              </div>
            }
          />
        </div>
      )}
      <div className="pointer-events-none absolute right-4 bottom-4 z-20">
        <Tag
          color={
            saveStatus === "已保存"
              ? "green"
              : saveStatus === "保存中"
                ? "processing"
                : saveStatus === "保存失败"
                  ? "red"
                  : "default"
          }
        >
          {saveStatus}
        </Tag>
      </div>
      <div className="absolute inset-0">
        {loading && <div className="absolute inset-0 z-10 bg-white/60" />}
        <div ref={containerHostRef} className="h-full w-full" />
      </div>
    </div>
  );
}

export default observer(FilestoreOnlyOfficePage);
