/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { Alert, Modal, Typography } from "antd";
import { FilestoreService } from "@/services/filestore.service";

type TOnlyOfficePreviewModalProps = {
  open: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  assetId: string;
  fileName?: string;
};

export const OnlyOfficePreviewModal = observer(function OnlyOfficePreviewModal(props: TOnlyOfficePreviewModalProps) {
  const { open, onClose, workspaceSlug, projectId, assetId, fileName } = props;
  const service = useMemo(() => new FilestoreService(), []);
  const editorRef = useRef<any>(null);
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

  const waitForElement = useCallback(async (id: string, timeoutMs = 4000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const el = document.getElementById(id);
      if (el) return el;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    return document.getElementById(id);
  }, []);

  const destroyEditor = useCallback(() => {
    try {
      editorRef.current?.destroyEditor?.();
    } catch {
      // ignore
    } finally {
      editorRef.current = null;
    }
  }, []);

  const initPreview = useCallback(async () => {
    if (!workspaceSlug || !projectId || !assetId) return;
    setLoading(true);
    setError("");
    try {
      const res = await service.getOnlyOfficeConfig(workspaceSlug, projectId, assetId, "view");
      const serverUrl = String(res?.document_server_url ?? "");
      const config = (res?.config ?? {}) as Record<string, any>;
      await loadOnlyOfficeScript(serverUrl);

      const mountEl = await waitForElement(containerId);
      if (!mountEl) throw new Error(`编辑器挂载节点未就绪: #${containerId}`);

      destroyEditor();
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
      setError(e?.detail || e?.message || e?.error || "加载预览失败");
    } finally {
      setLoading(false);
    }
  }, [assetId, containerId, destroyEditor, loadOnlyOfficeScript, projectId, service, waitForElement, workspaceSlug]);

  useEffect(() => {
    if (!open) {
      destroyEditor();
      setError("");
      return;
    }
    void initPreview();
    return () => {
      destroyEditor();
    };
  }, [destroyEditor, initPreview, open]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width="100vw"
      style={{ top: 0, paddingBottom: 0 }}
      styles={{ body: { padding: 0 } }}
      destroyOnClose
      title={
        <Typography.Text strong style={{ marginTop: -16, marginBottom: -16 }}>
          预览：{fileName ?? "文件"}
        </Typography.Text>
      }
    >
      <div className="relative" style={{ height: "calc(100vh - 56px)" }}>
        {error && (
          <div className="absolute left-0 right-0 top-0 z-20 p-3">
            <Alert type="error" showIcon message="预览异常" description={error} />
          </div>
        )}
        {loading && <div className="absolute inset-0 z-10 bg-white/60" />}
        <div id={containerId} className="h-full w-full" />
      </div>
    </Modal>
  );
});
