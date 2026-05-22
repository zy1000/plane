"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams, useSearchParams } from "next/navigation";
import {
  PROJECT_ASSET_DELETE_PERMISSION_KEY,
  PROJECT_ASSET_UPLOAD_PERMISSION_KEY,
  PROJECT_ASSET_VIEW_PERMISSION_KEY,
} from "@plane/constants";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { PageHead } from "@/components/core/page-title";
import { Alert, Button, Modal, Space, Table, Tag, Tooltip, Typography, message } from "antd";
import { ExportOutlined } from "@ant-design/icons";
import { formatCNDateTime } from "@/components/qa/cases/util";
import { AssetExplorer } from "@/components/asset-explorer";
import { XmindPreviewModal, type TXmindPreviewAsset } from "@/components/filestore/xmind-preview-modal";
import { useUserPermissions } from "@/hooks/store/user";
import { FilestoreService, type TFilestoreAsset } from "@/services/filestore.service";

const ONLYOFFICE_SUPPORTED_EXTS = ["doc", "docx", "odt", "rtf", "txt", "xls", "xlsx", "ods", "csv", "ppt", "pptx", "odp", "pdf"];
const XMIND_SUPPORTED_EXTS = ["xmind"];

type TFilestoreAssetLike = Pick<TFilestoreAsset, "id" | "attributes"> & {
  name?: string;
  filename?: string;
};
type TOnlyOfficeMode = "edit" | "view";

const getAssetFilename = (asset: TFilestoreAssetLike): string =>
  String(asset.attributes?.name ?? asset.name ?? asset.filename ?? "");

const isOnlyOfficeSupported = (filename?: string): boolean => {
  const ext = String(filename ?? "").split(".").pop()?.toLowerCase() ?? "";
  return ONLYOFFICE_SUPPORTED_EXTS.includes(ext);
};

const isXmindSupported = (filename?: string): boolean => {
  const ext = String(filename ?? "").split(".").pop()?.toLowerCase() ?? "";
  return XMIND_SUPPORTED_EXTS.includes(ext);
};

function FilestorePage() {
  const { workspaceSlug, projectId } = useParams<{ workspaceSlug: string; projectId: string }>();
  const searchParams = useSearchParams();
  const onlyofficeAssetId = searchParams.get("onlyofficeAssetId");
  const { workspaceUserInfo, allowProjectPermissionKeys } = useUserPermissions();
  const service = useMemo(() => new FilestoreService(), []);

  const canView = allowProjectPermissionKeys([PROJECT_ASSET_VIEW_PERMISSION_KEY], workspaceSlug, projectId);
  const canUpload = allowProjectPermissionKeys([PROJECT_ASSET_UPLOAD_PERMISSION_KEY], workspaceSlug, projectId);
  const canDelete = allowProjectPermissionKeys([PROJECT_ASSET_DELETE_PERMISSION_KEY], workspaceSlug, projectId);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<TOnlyOfficeMode>("edit");
  const [editorAsset, setEditorAsset] = useState<TFilestoreAssetLike | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [editorError, setEditorError] = useState("");
  const [editorConfig, setEditorConfig] = useState<Record<string, any> | null>(null);
  const [editorServerUrl, setEditorServerUrl] = useState("");
  const [docKey, setDocKey] = useState("");
  const [saveStatus, setSaveStatus] = useState<"已保存" | "未保存" | "保存中" | "保存失败">("已保存");
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versions, setVersions] = useState<Array<Record<string, any>>>([]);
  const [xmindPreviewOpen, setXmindPreviewOpen] = useState(false);
  const [xmindAsset, setXmindAsset] = useState<TXmindPreviewAsset | null>(null);

  const editorRef = useRef<any>(null);
  const forceSavingRef = useRef(false);
  const latestDocKeyRef = useRef("");
  const latestDirtyRef = useRef(false);
  const lastForceSaveAtRef = useRef(0);

  const editorContainerId = useMemo(() => {
    if (!editorAsset?.id) return "filestore-onlyoffice-editor";
    return `filestore-onlyoffice-editor-${editorAsset.id}`;
  }, [editorAsset?.id]);

  const closeEditor = useCallback(() => {
    try {
      editorRef.current?.destroyEditor?.();
    } catch {
    }
    editorRef.current = null;
    latestDocKeyRef.current = "";
    latestDirtyRef.current = false;
    forceSavingRef.current = false;
    setEditorOpen(false);
    setEditorMode("edit");
    setEditorAsset(null);
    setEditorConfig(null);
    setEditorServerUrl("");
    setDocKey("");
    setEditorError("");
    setSaveStatus("已保存");
  }, []);

  const loadOnlyOfficeScript = useCallback(async (serverUrl: string) => {
    const cleanUrl = String(serverUrl || "").replace(/\/+$/, "");
    if (!cleanUrl) throw new Error("document_server_url 为空");
    const w = window as any;
    if (w.DocsAPI?.DocEditor) return;

    const scriptId = `onlyoffice-docsapi-${encodeURIComponent(cleanUrl)}`;
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    await new Promise<void>((resolve, reject) => {
      const script = existing ?? document.createElement("script");
      script.id = scriptId;
      script.src = `${cleanUrl}/web-apps/apps/api/documents/api.js`;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("OnlyOffice 脚本加载失败"));
      if (!existing) document.body.appendChild(script);
    });
  }, []);

  const triggerForceSave = useCallback(
    async (source: "manual" | "request" | "saved" | "interval") => {
      if (!workspaceSlug || !projectId || !editorAsset?.id) return;
      if (source === "interval" && !latestDirtyRef.current) return;
      if (forceSavingRef.current) return;
      if (Date.now() - lastForceSaveAtRef.current < 1500) return;

      const currentDocKey = latestDocKeyRef.current;
      if (!currentDocKey) return;
      lastForceSaveAtRef.current = Date.now();
      forceSavingRef.current = true;
      setSaveStatus("保存中");
      try {
        await service.forceSaveOnlyOffice(String(workspaceSlug), String(projectId), String(editorAsset.id), currentDocKey);
      } catch (error: any) {
        setSaveStatus("保存失败");
        message.error(error?.detail || error?.message || "触发保存失败");
      } finally {
        forceSavingRef.current = false;
      }
    },
    [editorAsset?.id, projectId, service, workspaceSlug]
  );

  const waitForElement = useCallback(async (id: string, timeoutMs = 3000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const el = document.getElementById(id);
      if (el) return el;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    return document.getElementById(id);
  }, []);

  const initEditor = useCallback(
    async (serverUrl: string, config: Record<string, any>, containerId: string, mode: TOnlyOfficeMode) => {
      await loadOnlyOfficeScript(serverUrl);
      const w = window as any;
      if (!w.DocsAPI?.DocEditor) throw new Error("DocsAPI 未加载");

      const mountEl = await waitForElement(containerId);
      if (!mountEl) throw new Error(`编辑器挂载节点未就绪: #${containerId}`);

      try {
        editorRef.current?.destroyEditor?.();
      } catch {
      }
      const isViewMode = mode === "view";
      editorRef.current = new w.DocsAPI.DocEditor(containerId, {
        ...config,
        events: {
          ...(config.events ?? {}),
          onDocumentReady: () => setEditorError(""),
          onDocumentStateChange: isViewMode
            ? undefined
            : (event: any) => {
                const dirty = Boolean(event?.data);
                const wasDirty = latestDirtyRef.current;
                latestDirtyRef.current = dirty;
                if (dirty) setSaveStatus("未保存");
                if (wasDirty && !dirty) void triggerForceSave("saved");
              },
          onRequestSave: isViewMode ? undefined : () => void triggerForceSave("request"),
          onError: (event: any) => {
            const code = event?.data?.errorCode;
            const desc = event?.data?.errorDescription;
            setEditorError(`${isViewMode ? "预览" : "编辑器"}错误: ${code ?? ""}${desc ? ` ${desc}` : ""}`.trim());
          },
        },
      });
    },
    [loadOnlyOfficeScript, triggerForceSave, waitForElement]
  );

  const openEditor = useCallback(
    async (asset: TFilestoreAssetLike, mode: TOnlyOfficeMode = "edit") => {
      if (!workspaceSlug || !projectId || !asset?.id) return;
      setEditorAsset(asset);
      setEditorMode(mode);
      setEditorOpen(true);
      setEditorLoading(true);
      setEditorError("");
      try {
        const res = await service.getOnlyOfficeConfig(
          String(workspaceSlug),
          String(projectId),
          String(asset.id),
          mode
        );
        const config = (res?.config ?? {}) as Record<string, any>;
        const serverUrl = String(res?.document_server_url ?? "");
        const currentDocKey = String(config?.document?.key ?? "");
        setEditorConfig(config);
        setEditorServerUrl(serverUrl);
        setDocKey(currentDocKey);
        latestDocKeyRef.current = currentDocKey;
        const containerId = `filestore-onlyoffice-editor-${asset.id}`;
        await initEditor(serverUrl, config, containerId, mode);
      } catch (error: any) {
        setEditorError(error?.detail || error?.message || (mode === "view" ? "加载预览失败" : "加载编辑器失败"));
      } finally {
        setEditorLoading(false);
      }
    },
    [initEditor, projectId, service, workspaceSlug]
  );

  const handlePreview = useCallback(
    async (asset: TFilestoreAssetLike) => {
      if (!asset?.id) return;
      const filename = getAssetFilename(asset);
      if (isXmindSupported(filename)) {
        setXmindAsset(asset);
        setXmindPreviewOpen(true);
        return;
      }
      if (isOnlyOfficeSupported(filename)) {
        await openEditor(asset, "view");
        return;
      }
      message.warning("暂不支持预览此文件类型");
    },
    [openEditor]
  );

  const handleEdit = useCallback(
    async (asset: TFilestoreAssetLike) => {
      if (isOnlyOfficeSupported(getAssetFilename(asset))) {
        await openEditor(asset, "edit");
        return;
      }
      message.warning("暂不支持在线编辑此文件类型");
    },
    [openEditor]
  );

  const fetchVersions = useCallback(async () => {
    if (!workspaceSlug || !projectId || !editorAsset?.id) return;
    setVersionsLoading(true);
    try {
      const res = await service.listOnlyOfficeVersions(String(workspaceSlug), String(projectId), String(editorAsset.id));
      setVersions(Array.isArray(res?.versions) ? res.versions : []);
    } finally {
      setVersionsLoading(false);
    }
  }, [editorAsset?.id, projectId, service, workspaceSlug]);

  useEffect(() => {
    if (!onlyofficeAssetId || !workspaceSlug || !projectId) return;
    void openEditor({ id: String(onlyofficeAssetId) });
  }, [onlyofficeAssetId, openEditor, projectId, workspaceSlug]);

  useEffect(() => {
    latestDocKeyRef.current = docKey;
  }, [docKey]);

  useEffect(() => {
    if (!editorOpen || editorMode !== "edit" || !workspaceSlug || !projectId || !editorAsset?.id) return;
    const statusTimer = window.setInterval(async () => {
      try {
        const res = await service.getOnlyOfficeStatus(String(workspaceSlug), String(projectId), String(editorAsset.id));
        if (res?.onlyoffice?.last_error) setSaveStatus("保存失败");
        else if (res?.onlyoffice?.last_saved_at) setSaveStatus("已保存");
      } catch {
      }
    }, 5000);

    const saveTimer = window.setInterval(() => {
      void triggerForceSave("interval");
    }, 60000);

    return () => {
      window.clearInterval(statusTimer);
      window.clearInterval(saveTimer);
    };
  }, [editorAsset?.id, editorMode, editorOpen, projectId, service, triggerForceSave, workspaceSlug]);

  const openEditorInNewTab = useCallback(() => {
    if (!workspaceSlug || !projectId || !editorAsset?.id) return;
    const url = `/${encodeURIComponent(String(workspaceSlug))}/projects/${encodeURIComponent(
      String(projectId)
    )}/filestore?onlyofficeAssetId=${encodeURIComponent(String(editorAsset.id))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [editorAsset?.id, projectId, workspaceSlug]);

  if (workspaceUserInfo && workspaceSlug && projectId && !canView) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  const renderEditorPanel = (
    <div className="relative" style={{ height: "calc(100vh - 56px)" }}>
      {editorError && (
        <div className="absolute left-0 right-0 top-0 z-20 p-3">
          <Alert
            type="error"
            showIcon
            message={editorMode === "view" ? "预览异常" : "编辑器异常"}
            description={editorError}
          />
        </div>
      )}
      {editorLoading && <div className="absolute inset-0 z-10 bg-white/60" />}
      <div id={editorContainerId} className="h-full w-full" />
    </div>
  );

  if (onlyofficeAssetId) {
    return (
      <>
        <PageHead title="在线编辑" />
        <div className="fixed inset-0 z-50 bg-surface-1">{renderEditorPanel}</div>
      </>
    );
  }

  return (
    <>
      <PageHead title="文件" />

      <ContentWrapper className="flex flex-col !overflow-hidden">
        <AssetExplorer
          workspaceSlug={String(workspaceSlug ?? "")}
          projectId={String(projectId ?? "")}
          permissions={{ canUpload, canDelete, canCreateFolder: canUpload }}
          onPreview={handlePreview}
          onEdit={handleEdit}
        />
      </ContentWrapper>

      <Modal
        open={editorOpen}
        onCancel={closeEditor}
        footer={null}
        width="100vw"
        style={{ top: 0, paddingBottom: 0 }}
        bodyStyle={{ padding: 0 }}
        destroyOnClose
        title={
          <div className="flex items-center justify-between gap-2 pr-12" style={{ marginTop: -16, marginBottom: -16, height: 56 }}>
            <div className="flex items-center gap-2">
              <Typography.Text strong>
                {editorMode === "view"
                  ? `预览：${String(editorAsset?.attributes?.name ?? "文件")}`
                  : String(editorAsset?.attributes?.name ?? "在线编辑")}
              </Typography.Text>
              {editorMode === "edit" && (
                <Tag color={saveStatus === "已保存" ? "green" : saveStatus === "保存中" ? "processing" : saveStatus === "保存失败" ? "red" : "default"}>
                  {saveStatus}
                </Tag>
              )}
            </div>
            {editorMode === "edit" && (
              <Space>
                <Button type="text" onClick={async () => { setVersionsOpen(true); await fetchVersions(); }}>
                  版本
                </Button>
                <Tooltip title="新标签页打开">
                  <Button type="text" icon={<ExportOutlined />} onClick={() => { openEditorInNewTab(); closeEditor(); }} />
                </Tooltip>
              </Space>
            )}
          </div>
        }
      >
        {renderEditorPanel}
      </Modal>

      <XmindPreviewModal
        open={xmindPreviewOpen}
        asset={xmindAsset}
        workspaceSlug={String(workspaceSlug ?? "")}
        projectId={String(projectId ?? "")}
        onClose={() => {
          setXmindPreviewOpen(false);
          setXmindAsset(null);
        }}
      />

      <Modal open={versionsOpen} onCancel={() => setVersionsOpen(false)} footer={null} width={860} title="历史版本" destroyOnClose>
        <Table
          rowKey={(record) => String(record?.key ?? record?.id ?? "")}
          loading={versionsLoading}
          dataSource={versions}
          pagination={false}
          size="small"
          columns={[
            { title: "时间", dataIndex: "saved_at", key: "saved_at", width: 220, render: (v: any) => (v ? formatCNDateTime(v) : "-") },
            { title: "来源", dataIndex: "by", key: "by", width: 180, render: (v: any) => String(v ?? "-") },
            { title: "标识", dataIndex: "key", key: "key", render: (v: any) => <Typography.Text ellipsis={{ tooltip: String(v ?? "") }}>{String(v ?? "-")}</Typography.Text> },
            {
              title: "操作",
              key: "actions",
              width: 120,
              render: (_: any, record: any) => (
                <Button
                  size="small"
                  onClick={async () => {
                    if (!workspaceSlug || !projectId || !editorAsset?.id) return;
                    const versionKey = String(record?.key ?? "");
                    if (!versionKey) return;
                    try {
                      await service.restoreOnlyOfficeVersion(String(workspaceSlug), String(projectId), String(editorAsset.id), versionKey);
                      message.success("已恢复版本");
                      await fetchVersions();
                    } catch (error: any) {
                      message.error(error?.detail || error?.message || "恢复失败");
                    }
                  }}
                >
                  恢复
                </Button>
              ),
            },
          ]}
        />
      </Modal>
    </>
  );
}

export default observer(FilestorePage);
