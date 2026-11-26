/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Alert } from "antd";
import { FilestoreService } from "@/services/filestore.service";

type TOnlyOfficePreviewContentProps = {
  workspaceSlug: string;
  /** 不传 = 需求级附件：走工作区级只读预览端点（那类资产没有 project_id） */
  projectId?: string;
  assetId: string;
  /** 预览区要有确定的高度，由宿主给（弹窗、独立预览页各自的可用高度不同） */
  style?: CSSProperties;
};

/**
 * OnlyOffice 只读预览的本体：挂载即加载，卸载即销毁。
 * 预览弹窗（OnlyOfficePreviewModal）与文件模块的独立预览页共用。
 */
export const OnlyOfficePreviewContent = (props: TOnlyOfficePreviewContentProps) => {
  const { workspaceSlug, projectId, assetId, style } = props;
  const service = useMemo(() => new FilestoreService(), []);
  const editorRef = useRef<any>(null);
  const containerHostRef = useRef<HTMLDivElement>(null);
  const previewRunIdRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const containerId = useMemo(() => `onlyoffice-preview-${assetId}`, [assetId]);

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

  const destroyEditor = useCallback(() => {
    try {
      editorRef.current?.destroyEditor?.();
    } catch {
      // ignore
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

  const initPreview = useCallback(
    async (runId: number) => {
      if (!workspaceSlug || !assetId) return;
      setLoading(true);
      setError("");
      try {
        const res = projectId
          ? await service.getOnlyOfficeConfig(workspaceSlug, projectId, assetId, "view")
          : await service.getRequirementAssetOnlyOfficePreviewConfig(workspaceSlug, assetId);
        const serverUrl = String(res?.document_server_url ?? "");
        const config = (res?.config ?? {}) as Record<string, any>;
        await loadOnlyOfficeScript(serverUrl);

        if (previewRunIdRef.current !== runId) return;

        destroyEditor();
        const mountEl = createEditorContainer();
        if (!mountEl) throw new Error(`编辑器挂载节点未就绪: #${containerId}`);

        const w = window as any;
        if (!w.DocsAPI?.DocEditor) throw new Error("DocsAPI 未加载");

        editorRef.current = new w.DocsAPI.DocEditor(containerId, {
          ...config,
          events: {
            ...(config?.events ?? {}),
            onDocumentReady: () => setError(""),
            onError: (event: any) => {
              const code = event?.data?.errorCode;
              const desc = event?.data?.errorDescription;
              setError(`预览错误: ${code ?? ""}${desc ? ` ${desc}` : ""}`.trim());
            },
          },
        });
      } catch (e: any) {
        if (previewRunIdRef.current !== runId) return;
        setError(e?.detail || e?.message || e?.error || "加载预览失败");
      } finally {
        if (previewRunIdRef.current === runId) setLoading(false);
      }
    },
    [assetId, containerId, createEditorContainer, destroyEditor, loadOnlyOfficeScript, projectId, service, workspaceSlug]
  );

  useEffect(() => {
    const runId = previewRunIdRef.current + 1;
    previewRunIdRef.current = runId;
    void initPreview(runId);
    return () => {
      previewRunIdRef.current += 1;
      destroyEditor();
    };
  }, [destroyEditor, initPreview]);

  return (
    <div className="relative" style={style}>
      {error && (
        <div className="absolute left-0 right-0 top-0 z-20 p-3">
          <Alert type="error" showIcon message="预览异常" description={error} />
        </div>
      )}
      {loading && <div className="absolute inset-0 z-10 bg-white/60" />}
      <div ref={containerHostRef} className="h-full w-full" />
    </div>
  );
};
