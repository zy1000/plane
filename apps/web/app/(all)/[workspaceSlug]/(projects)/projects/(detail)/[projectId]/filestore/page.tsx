"use client";

import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PageHead } from "@/components/core/page-title";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { Breadcrumbs, Header } from "@plane/ui";
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";
import { Alert, Button, Input, Modal, Pagination, Popconfirm, Space, Table, Tag, Tooltip, Typography, message } from "antd";
import type { TableProps, InputRef, TableColumnType } from "antd";
import type { FilterDropdownProps } from "antd/es/table/interface";
import { DeleteOutlined, DownloadOutlined, EyeOutlined, SearchOutlined, FileOutlined, EditOutlined, ExportOutlined } from "@ant-design/icons";
import { FilestoreService, type TFilestoreAsset } from "@/services/filestore.service";
import { formatCNDateTime } from "@/components/qa/cases/util";
import { Folder } from "lucide-react";

const FILE_PREVIEW_BASE_URL = process.env.VITE_FILEVIEW_URL || "http://localhost:8012";

const formatBytes = (value?: number): string => {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const num = bytes / Math.pow(1024, idx);
  const digits = idx === 0 ? 0 : num >= 10 ? 1 : 2;
  return `${num.toFixed(digits)} ${units[idx]}`;
};

const base64Encode = (input: string): string => {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return window.btoa(binary);
};

const ONLYOFFICE_SUPPORTED_EXTS = [
  "doc",
  "docx",
  "odt",
  "rtf",
  "txt",
  "xls",
  "xlsx",
  "ods",
  "csv",
  "ppt",
  "pptx",
  "odp",
  "pdf",
] as const;

const getFileExt = (filename?: string): string => {
  const name = String(filename ?? "").trim();
  if (!name || !name.includes(".")) return "";
  return name.split(".").pop()?.toLowerCase() ?? "";
};

const isOnlyOfficeSupported = (filename?: string): boolean => {
  const ext = getFileExt(filename);
  return ONLYOFFICE_SUPPORTED_EXTS.includes(ext as any);
};

export default function FilestorePage() {
  const { workspaceSlug, projectId } = useParams<{ workspaceSlug: string; projectId: string }>();
  const searchParams = useSearchParams();
  const onlyOfficeAssetIdFromQuery = searchParams.get("onlyofficeAssetId");
  const service = useMemo(() => new FilestoreService(), []);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const searchInput = useRef<InputRef>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [assets, setAssets] = useState<TFilestoreAsset[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [total, setTotal] = useState<number>(0);
  const [searchText, setSearchText] = useState("");
  const [searchedColumn, setSearchedColumn] = useState("");
  const [filters, setFilters] = useState<{ name?: string }>({});

  const [onlyOfficeOpen, setOnlyOfficeOpen] = useState(false);
  const [onlyOfficeAsset, setOnlyOfficeAsset] = useState<TFilestoreAsset | null>(null);
  const [onlyOfficeLoading, setOnlyOfficeLoading] = useState(false);
  const [onlyOfficeError, setOnlyOfficeError] = useState<string>("");
  const [onlyOfficeDocumentServerUrl, setOnlyOfficeDocumentServerUrl] = useState<string>("");
  const [onlyOfficeConfig, setOnlyOfficeConfig] = useState<Record<string, any> | null>(null);
  const [onlyOfficeDocKey, setOnlyOfficeDocKey] = useState<string>("");
  const [onlyOfficeDirty, setOnlyOfficeDirty] = useState(false);
  const [onlyOfficeSaveStatus, setOnlyOfficeSaveStatus] = useState<"未保存" | "保存中" | "已保存" | "保存失败">("已保存");
  const [onlyOfficeVersionsOpen, setOnlyOfficeVersionsOpen] = useState(false);
  const [onlyOfficeVersionsLoading, setOnlyOfficeVersionsLoading] = useState(false);
  const [onlyOfficeVersions, setOnlyOfficeVersions] = useState<Array<Record<string, any>>>([]);

  const onlyOfficeEditorRef = useRef<any>(null);
  const onlyOfficeDocKeyRef = useRef<string>("");
  const onlyOfficeDirtyRef = useRef<boolean>(false);
  const onlyOfficeForceSaveInFlightRef = useRef<boolean>(false);
  const onlyOfficeLastForceSaveAtRef = useRef<number>(0);

  const onlyOfficeContainerId = useMemo(() => {
    if (!onlyOfficeAsset?.id) return "onlyoffice-editor";
    return `onlyoffice-editor-${onlyOfficeAsset.id}`;
  }, [onlyOfficeAsset?.id]);

  const fetchAssets = useCallback(
    async (page: number = currentPage, size: number = pageSize, filterParams = filters) => {
      if (!workspaceSlug || !projectId) return;
      setLoading(true);
      try {
        const response = await service.listFilestoreAssets(String(workspaceSlug), String(projectId), {
          page,
          page_size: size,
          ...(filterParams.name ? { name__icontains: filterParams.name } : {}),
        });
        const nextTotal = Number(response?.count ?? 0);
        const lastPage = Math.max(1, Math.ceil(nextTotal / size));
        const safePage = page > lastPage ? lastPage : page;

        if (safePage !== page) {
          const response2 = await service.listFilestoreAssets(String(workspaceSlug), String(projectId), {
            page: safePage,
            page_size: size,
            ...(filterParams.name ? { name__icontains: filterParams.name } : {}),
          });
          setAssets(Array.isArray(response2?.data) ? response2.data : []);
          setTotal(Number(response2?.count ?? 0));
          setCurrentPage(safePage);
          setPageSize(size);
          return;
        }

        setAssets(Array.isArray(response?.data) ? response.data : []);
        setTotal(nextTotal);
        setCurrentPage(page);
        setPageSize(size);
      } catch (e: any) {
        message.error(e?.detail || e?.message || "获取文件列表失败");
      } finally {
        setLoading(false);
      }
    },
    [currentPage, filters, pageSize, projectId, service, workspaceSlug]
  );

  useEffect(() => {
    if (onlyOfficeAssetIdFromQuery) return;
    fetchAssets();
  }, [fetchAssets, onlyOfficeAssetIdFromQuery]);

  const handlePreview = useCallback(
    async (record: TFilestoreAsset) => {
      if (!workspaceSlug || !projectId || !record?.id) return;
      try {
        const signedUrl = await service.getFilestoreAssetPresignedURL(
          String(workspaceSlug),
          String(projectId),
          String(record.id),
          "inline"
        );
        if (!signedUrl) {
          message.error("获取预览地址失败");
          return;
        }
        const fullfilename = String(record?.attributes?.name || "file");
        const previewUrl = `${FILE_PREVIEW_BASE_URL}/onlinePreview?url=${encodeURIComponent(
          base64Encode(signedUrl)
        )}&fullfilename=${encodeURIComponent(fullfilename)}`;
        window.open(previewUrl, "_blank", "noopener,noreferrer");
      } catch (e: any) {
        message.error(e?.detail || e?.message || "获取预览地址失败");
      }
    },
    [projectId, service, workspaceSlug]
  );

  const handleOpen = useCallback(
    async (record: TFilestoreAsset) => {
      if (isOnlyOfficeSupported(record?.attributes?.name)) {
        setOnlyOfficeAsset(record);
        setOnlyOfficeOpen(true);
        return;
      }
      await handlePreview(record);
    },
    [handlePreview]
  );

  useEffect(() => {
    if (!onlyOfficeAssetIdFromQuery) return;
    if (!workspaceSlug || !projectId) return;
    setOnlyOfficeAsset({ id: String(onlyOfficeAssetIdFromQuery) });
    setOnlyOfficeOpen(true);
  }, [onlyOfficeAssetIdFromQuery, projectId, workspaceSlug]);

  useEffect(() => {
    return () => {
      try {
        onlyOfficeEditorRef.current?.destroyEditor?.();
      } catch {
      } finally {
        onlyOfficeEditorRef.current = null;
      }
    };
  }, []);

  const handleDelete = useCallback(
    async (record: TFilestoreAsset) => {
      if (!workspaceSlug || !projectId || !record?.id) return;
      try {
        await service.deleteFilestoreAsset(String(workspaceSlug), String(projectId), String(record.id));
        message.success("删除成功");
        await fetchAssets(currentPage, pageSize);
      } catch (e: any) {
        message.error(e?.detail || e?.message || "删除失败");
      }
    },
    [currentPage, fetchAssets, pageSize, projectId, service, workspaceSlug]
  );

  const closeOnlyOffice = useCallback(() => {
    try {
      onlyOfficeEditorRef.current?.destroyEditor?.();
    } catch {
    } finally {
      onlyOfficeEditorRef.current = null;
    }
    onlyOfficeDocKeyRef.current = "";
    onlyOfficeDirtyRef.current = false;
    onlyOfficeForceSaveInFlightRef.current = false;
    onlyOfficeLastForceSaveAtRef.current = 0;
    setOnlyOfficeOpen(false);
    setOnlyOfficeAsset(null);
    setOnlyOfficeConfig(null);
    setOnlyOfficeDocumentServerUrl("");
    setOnlyOfficeDocKey("");
    setOnlyOfficeDirty(false);
    setOnlyOfficeSaveStatus("已保存");
    setOnlyOfficeError("");
  }, []);

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

  useEffect(() => {
    onlyOfficeDocKeyRef.current = onlyOfficeDocKey;
  }, [onlyOfficeDocKey]);

  useEffect(() => {
    onlyOfficeDirtyRef.current = onlyOfficeDirty;
  }, [onlyOfficeDirty]);

  const triggerOnlyOfficeForceSave = useCallback(
    async (source: "manual" | "editor_request_save" | "editor_state_saved" | "interval") => {
      if (!workspaceSlug || !projectId || !onlyOfficeAsset?.id) return;

      if (source === "interval" && !onlyOfficeDirtyRef.current) return;

      if (onlyOfficeForceSaveInFlightRef.current) return;

      const now = Date.now();
      if (now - onlyOfficeLastForceSaveAtRef.current < 1500) return;
      onlyOfficeLastForceSaveAtRef.current = now;

      const docKey = onlyOfficeDocKeyRef.current;
      if (!docKey) {
        message.error("doc_key 为空，无法保存");
        return;
      }

      onlyOfficeForceSaveInFlightRef.current = true;
      setOnlyOfficeSaveStatus("保存中");
      try {
        await service.forceSaveOnlyOffice(String(workspaceSlug), String(projectId), String(onlyOfficeAsset.id), docKey);
      } catch (e: any) {
        setOnlyOfficeSaveStatus("保存失败");
        message.error(e?.detail || e?.message || "触发保存失败");
      } finally {
        onlyOfficeForceSaveInFlightRef.current = false;
      }
    },
    [onlyOfficeAsset?.id, projectId, service, workspaceSlug]
  );

  const initOnlyOfficeEditor = useCallback(
    async (serverUrl: string, config: Record<string, any>) => {
      await loadOnlyOfficeScript(serverUrl);
      const w = window as any;
      if (!w.DocsAPI?.DocEditor) throw new Error("DocsAPI 未加载");

      try {
        onlyOfficeEditorRef.current?.destroyEditor?.();
      } catch {
      } finally {
        onlyOfficeEditorRef.current = null;
      }

      const enrichedConfig: Record<string, any> = {
        ...config,
        events: {
          ...(config?.events ?? {}),
          onDocumentReady: () => {
            setOnlyOfficeError("");
          },
          onDocumentStateChange: (event: any) => {
            const dirty = Boolean(event?.data);
            const wasDirty = onlyOfficeDirtyRef.current;
            setOnlyOfficeDirty(dirty);
            onlyOfficeDirtyRef.current = dirty;
            if (dirty) setOnlyOfficeSaveStatus("未保存");
            if (wasDirty && !dirty) void triggerOnlyOfficeForceSave("editor_state_saved");
          },
          onRequestSave: () => {
            void triggerOnlyOfficeForceSave("editor_request_save");
          },
          onError: (event: any) => {
            const code = event?.data?.errorCode;
            const desc = event?.data?.errorDescription;
            setOnlyOfficeError(`编辑器错误: ${code ?? ""}${desc ? ` ${desc}` : ""}`.trim());
          },
        },
      };

      onlyOfficeEditorRef.current = new w.DocsAPI.DocEditor(onlyOfficeContainerId, enrichedConfig);
    },
    [loadOnlyOfficeScript, onlyOfficeContainerId, triggerOnlyOfficeForceSave]
  );

  const fetchOnlyOfficeVersions = useCallback(async () => {
    if (!workspaceSlug || !projectId || !onlyOfficeAsset?.id) return;
    setOnlyOfficeVersionsLoading(true);
    try {
      const res = await service.listOnlyOfficeVersions(String(workspaceSlug), String(projectId), String(onlyOfficeAsset.id));
      setOnlyOfficeVersions(Array.isArray(res?.versions) ? res.versions : []);
    } catch (e: any) {
      message.error(e?.detail || e?.message || "获取历史版本失败");
    } finally {
      setOnlyOfficeVersionsLoading(false);
    }
  }, [onlyOfficeAsset?.id, projectId, service, workspaceSlug]);

  const refreshOnlyOfficeEditor = useCallback(async () => {
    if (!workspaceSlug || !projectId || !onlyOfficeAsset?.id) return;
    const res = await service.getOnlyOfficeConfig(String(workspaceSlug), String(projectId), String(onlyOfficeAsset.id));
    const serverUrl = String(res?.document_server_url ?? "");
    const config = (res?.config ?? {}) as Record<string, any>;
    const docKey = String(config?.document?.key ?? "");
    setOnlyOfficeDocumentServerUrl(serverUrl);
    setOnlyOfficeConfig(config);
    setOnlyOfficeDocKey(docKey);
    onlyOfficeDocKeyRef.current = docKey;

    try {
      if (onlyOfficeEditorRef.current?.refreshFile) {
        onlyOfficeEditorRef.current.refreshFile(config);
      } else {
        await initOnlyOfficeEditor(serverUrl, config);
      }
    } catch (e: any) {
      setOnlyOfficeError(e?.message || "刷新编辑器失败");
    }
  }, [initOnlyOfficeEditor, onlyOfficeAsset?.id, projectId, service, workspaceSlug]);

  const handleOnlyOfficeForceSave = useCallback(async () => {
    await triggerOnlyOfficeForceSave("manual");
  }, [triggerOnlyOfficeForceSave]);

  useEffect(() => {
    if (!onlyOfficeOpen || !workspaceSlug || !projectId || !onlyOfficeAsset?.id) return;

    let canceled = false;
    (async () => {
      setOnlyOfficeLoading(true);
      setOnlyOfficeError("");
      try {
        const res = await service.getOnlyOfficeConfig(String(workspaceSlug), String(projectId), String(onlyOfficeAsset.id));
        if (canceled) return;
        const serverUrl = String(res?.document_server_url ?? "");
        const config = (res?.config ?? {}) as Record<string, any>;
        const docKey = String(config?.document?.key ?? "");

        setOnlyOfficeDocumentServerUrl(serverUrl);
        setOnlyOfficeConfig(config);
        setOnlyOfficeDocKey(docKey);
        onlyOfficeDocKeyRef.current = docKey;
        setOnlyOfficeSaveStatus("已保存");

        await initOnlyOfficeEditor(serverUrl, config);
      } catch (e: any) {
        if (canceled) return;
        setOnlyOfficeError(e?.detail || e?.message || "加载编辑器失败");
      } finally {
        if (!canceled) setOnlyOfficeLoading(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [initOnlyOfficeEditor, onlyOfficeAsset?.id, onlyOfficeOpen, projectId, service, workspaceSlug]);

  useEffect(() => {
    if (!onlyOfficeOpen || !workspaceSlug || !projectId || !onlyOfficeAsset?.id) return;
    const t = window.setInterval(async () => {
      try {
        const res = await service.getOnlyOfficeStatus(String(workspaceSlug), String(projectId), String(onlyOfficeAsset.id));
        const onlyoffice = res?.onlyoffice ?? {};
        if (onlyoffice?.last_error) {
          setOnlyOfficeSaveStatus("保存失败");
          return;
        }
        if (onlyoffice?.last_saved_at) {
          setOnlyOfficeSaveStatus("已保存");
          return;
        }
        if (onlyOfficeDirty) setOnlyOfficeSaveStatus("未保存");
      } catch {
      }
    }, 5000);
    return () => window.clearInterval(t);
  }, [onlyOfficeAsset?.id, onlyOfficeDirty, onlyOfficeOpen, projectId, service, workspaceSlug]);

  useEffect(() => {
    if (!onlyOfficeOpen) return;
    const t = window.setInterval(() => {
      if (!onlyOfficeDirty) return;
      void triggerOnlyOfficeForceSave("interval");
    }, 60000);
    return () => window.clearInterval(t);
  }, [onlyOfficeDirty, onlyOfficeOpen, triggerOnlyOfficeForceSave]);

  const openOnlyOfficeInNewTab = useCallback(() => {
    if (!workspaceSlug || !projectId || !onlyOfficeAsset?.id) return;
    const url = `/${encodeURIComponent(String(workspaceSlug))}/projects/${encodeURIComponent(
      String(projectId)
    )}/filestore?onlyofficeAssetId=${encodeURIComponent(String(onlyOfficeAsset.id))}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [onlyOfficeAsset?.id, projectId, workspaceSlug]);

  const openPicker = () => {
    if (uploading) return;
    fileInputRef.current?.click();
  };

  const handleUpload = async (selectedFile?: File | null) => {
    if (!workspaceSlug || !projectId) return;
    const targetFile = selectedFile ?? file;
    if (!targetFile) {
      message.info("请先选择文件");
      return;
    }
    setUploading(true);
    try {
      await service.uploadFilestoreAsset(String(workspaceSlug), String(projectId), targetFile);
      message.success("上传成功");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await fetchAssets(1, pageSize);
    } catch (e: any) {
      message.error(e?.detail || e?.message || "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const getColumnSearchProps = (dataIndex: keyof TFilestoreAsset | string): TableColumnType<TFilestoreAsset> => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }: FilterDropdownProps) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          ref={searchInput}
          placeholder="搜索 文件名"
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => handleSearch(selectedKeys as string[], dataIndex, close)}
          style={{ marginBottom: 8, display: "block" }}
        />
        <div className="flex gap-2">
          <Button
            type="primary"
            onClick={() => handleSearch(selectedKeys as string[], dataIndex, close)}
            icon={<SearchOutlined />}
            size="small"
            style={{ width: 90 }}
          >
            搜索
          </Button>
          <Button onClick={() => clearFilters && handleReset(clearFilters, dataIndex)} size="small" style={{ width: 90 }}>
            重置
          </Button>
        </div>
      </div>
    ),
    filterIcon: (filtered: boolean) => <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />,
    onFilterDropdownOpenChange: (visible) => {
      if (visible) setTimeout(() => searchInput.current?.select(), 100);
    },
    filteredValue: dataIndex === "name" ? (filters.name ? [filters.name] : null) : null,
  });

  const handleSearch = (selectedKeys: string[], dataIndex: keyof TFilestoreAsset | string, close?: () => void) => {
    setSearchText(selectedKeys[0]);
    setSearchedColumn(String(dataIndex));
    const nextFilters = { ...filters };
    if (selectedKeys[0]) {
      if (dataIndex === "name") nextFilters.name = selectedKeys[0];
    } else {
      if (dataIndex === "name") delete nextFilters.name;
    }
    setFilters(nextFilters);
    fetchAssets(1, pageSize, nextFilters);
    close?.();
  };

  const handleReset = (clearFilters: () => void, dataIndex: keyof TFilestoreAsset | string) => {
    clearFilters();
    setSearchText("");
    const nextFilters = { ...filters };
    if (dataIndex === "name") delete nextFilters.name;
    setFilters(nextFilters);
    fetchAssets(1, pageSize, nextFilters);
  };

  const columns: TableProps<TFilestoreAsset>["columns"] = [
    {
      title: "文件名",
      dataIndex: ["attributes", "name"],
      key: "name",
      render: (v: any) => String(v ?? "-"),
      ...getColumnSearchProps("name"),
    },
    {
      title: "大小",
      dataIndex: ["attributes", "size"],
      key: "size",
      render: (v: any) => formatBytes(Number(v ?? 0)),
    },
    {
      title: "上传时间",
      dataIndex: "created_at",
      key: "created_at",
      render: (v: any) => formatCNDateTime(v),
    },
    {
      title: "操作",
      key: "actions",
      width: 220,
      render: (_: any, record: TFilestoreAsset) => {
        const onlyOfficeSupported = isOnlyOfficeSupported(record?.attributes?.name);
        return (
          <div className="flex items-center">
            <Tooltip title={onlyOfficeSupported ? "编辑" : "预览"}>
              <Button
                type="text"
                aria-label={onlyOfficeSupported ? "编辑" : "预览"}
                icon={onlyOfficeSupported ? <EditOutlined /> : <EyeOutlined />}
                onClick={() => void handleOpen(record)}
              />
            </Tooltip>
            <Tooltip title="下载">
              <Button
                type="text"
                aria-label="下载"
                icon={<DownloadOutlined />}
                onClick={() => {
                  if (!workspaceSlug || !projectId || !record?.id) return;
                  const url = service.getFilestoreAssetDownloadURL(String(workspaceSlug), String(projectId), String(record.id));
                  window.open(url, "_blank", "noopener,noreferrer");
                }}
              />
            </Tooltip>
            <Popconfirm title="确认删除该文件？" okText="删除" cancelText="取消" onConfirm={() => void handleDelete(record)}>
              <Tooltip title="删除">
                <Button type="text" aria-label="删除" icon={<DeleteOutlined />} danger />
              </Tooltip>
            </Popconfirm>
          </div>
        );
      },
    },
  ];

  const handlePaginationChange = (page: number, size?: number) => {
    const newPageSize = size || pageSize;
    const nextPage = newPageSize !== pageSize ? 1 : page;
    void fetchAssets(nextPage, newPageSize);
  };

  if (onlyOfficeAssetIdFromQuery) {
    return (
      <>
        <PageHead title="在线编辑" />
        <div className="fixed inset-0 z-50 bg-custom-background-100">
          {onlyOfficeError && (
            <div className="absolute left-0 right-0 top-0 z-20 p-3">
              <Alert
                type="error"
                showIcon
                message="编辑器加载/运行异常"
                description={
                  <div className="flex items-center justify-between gap-3">
                    <span className="break-all">{onlyOfficeError}</span>
                    <Button size="small" onClick={() => void refreshOnlyOfficeEditor()} disabled={!onlyOfficeAsset?.id}>
                      重试
                    </Button>
                  </div>
                }
              />
            </div>
          )}
          <div className="absolute inset-0">
            {onlyOfficeLoading && <div className="absolute inset-0 z-10 bg-white/60" />}
            <div id={onlyOfficeContainerId} className="h-full w-full" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHead title="文件" />
      <AppHeader
        header={
          <Header>
            <Header.LeftItem>
              <Breadcrumbs>
                <CommonProjectBreadcrumbs workspaceSlug={String(workspaceSlug ?? "")} projectId={String(projectId ?? "")} />
                <Breadcrumbs.Item
                  isLast
                  component={
                    <Breadcrumbs.ItemWrapper>
                      <div className="flex size-4 items-center justify-center overflow-hidden !text-[1rem]">
                        <Folder className="size-4" />
                      </div>
                      <div className="relative line-clamp-1 block max-w-[150px] overflow-hidden truncate">文件</div>
                    </Breadcrumbs.ItemWrapper>
                  }
                />
              </Breadcrumbs>
            </Header.LeftItem>
            <Header.RightItem>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={openPicker}
                  disabled={uploading}
                  className="text-white bg-custom-primary-100 hover:bg-custom-primary-200 focus:text-custom-brand-40 focus:bg-custom-primary-200 px-3 py-1.5 font-medium text-xs rounded flex items-center gap-1.5 whitespace-nowrap transition-all justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? "上传中..." : "上传文件"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    if (uploading) return;
                    const f = e.target.files?.[0] || null;
                    setFile(f);
                    if (f) void handleUpload(f);
                  }}
                />
              </div>
            </Header.RightItem>
          </Header>
        }
      />
      <ContentWrapper className="flex flex-col !overflow-hidden">
        <div className="h-full w-full overflow-hidden flex flex-col">
          <div className="flex-1 overflow-hidden">
            <Table
              rowKey={(r) => String(r.id)}
              columns={columns}
              dataSource={assets}
              loading={loading}
              pagination={false}
              size="small"
            />
          </div>
          <div className="flex-shrink-0 border-t border-custom-border-200 px-4 py-3 bg-custom-background-100 flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-custom-text-300">
                {total > 0 ? `第 ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, total)} 条，共 ${total} 条` : ""}
              </span>
            </div>
            <Pagination
              current={currentPage}
              pageSize={pageSize}
              total={total}
              showSizeChanger
              simple
              pageSizeOptions={["10", "20", "50", "100"]}
              onChange={handlePaginationChange}
              onShowSizeChange={handlePaginationChange}
              size="small"
            />
          </div>
        </div>
      </ContentWrapper>
      <Modal
        open={onlyOfficeOpen}
        onCancel={closeOnlyOffice}
        footer={null}
        width="100vw"
        style={{ top: 0, paddingBottom: 0 }}
        bodyStyle={{ padding: 0 }}
        destroyOnClose
        title={
          <div className="flex items-center justify-between gap-2 pr-12" style={{ marginTop: -16, marginBottom: -16, height: 56 }}>
            <div className="flex items-center gap-2 min-w-0">
              <Typography.Text strong className="truncate">
                {String(onlyOfficeAsset?.attributes?.name ?? "在线编辑")}
              </Typography.Text>
              <Tag
                color={
                  onlyOfficeSaveStatus === "已保存"
                    ? "green"
                    : onlyOfficeSaveStatus === "保存中"
                      ? "processing"
                      : onlyOfficeSaveStatus === "保存失败"
                        ? "red"
                        : "default"
                }
              >
                {onlyOfficeSaveStatus}
              </Tag>
            </div>
            <div className="flex items-center h-full">
              <Space align="center">
                <Tooltip title="新标签页打开">
                  <Button
                    type="text"
                    aria-label="新标签页打开"
                    icon={<ExportOutlined />}
                    onClick={() => {
                      openOnlyOfficeInNewTab();
                      closeOnlyOffice();
                    }}
                    disabled={!onlyOfficeAsset?.id}
                  />
                </Tooltip>
              </Space>
            </div>
          </div>
        }
      >
        <div className="relative" style={{ height: "calc(100vh - 56px)" }}>
          {onlyOfficeError && (
            <div className="absolute left-0 right-0 top-0 z-20 p-3">
              <Alert
                type="error"
                showIcon
                message="编辑器加载/运行异常"
                description={
                  <div className="flex items-center justify-between gap-3">
                    <span className="break-all">{onlyOfficeError}</span>
                    <Button size="small" onClick={() => void refreshOnlyOfficeEditor()}>
                      重试
                    </Button>
                  </div>
                }
              />
            </div>
          )}
          {onlyOfficeLoading && <div className="absolute inset-0 z-10 bg-white/60" />}
          <div id={onlyOfficeContainerId} className="h-full w-full" />
        </div>
      </Modal>

      <Modal
        open={onlyOfficeVersionsOpen}
        onCancel={() => setOnlyOfficeVersionsOpen(false)}
        footer={null}
        width={860}
        title="历史版本"
        destroyOnClose
      >
        <Table
          rowKey={(r) => String(r?.key ?? r?.id ?? "")}
          loading={onlyOfficeVersionsLoading}
          dataSource={onlyOfficeVersions}
          pagination={false}
          size="small"
          columns={[
            {
              title: "时间",
              dataIndex: "saved_at",
              key: "saved_at",
              width: 220,
              render: (v: any) => (v ? formatCNDateTime(v) : "-"),
            },
            {
              title: "来源",
              dataIndex: "by",
              key: "by",
              width: 160,
              render: (v: any) => String(v ?? "-"),
            },
            {
              title: "标识",
              dataIndex: "key",
              key: "key",
              render: (v: any) => (
                <Typography.Text ellipsis={{ tooltip: String(v ?? "") }}>{String(v ?? "-")}</Typography.Text>
              ),
            },
            {
              title: "操作",
              key: "actions",
              width: 120,
              render: (_: any, record: any) => (
                <Popconfirm
                  title="确认恢复到该版本？当前版本会先自动备份。"
                  okText="恢复"
                  cancelText="取消"
                  onConfirm={async () => {
                    if (!workspaceSlug || !projectId || !onlyOfficeAsset?.id) return;
                    const versionKey = String(record?.key ?? "");
                    if (!versionKey) return;
                    try {
                      await service.restoreOnlyOfficeVersion(
                        String(workspaceSlug),
                        String(projectId),
                        String(onlyOfficeAsset.id),
                        versionKey
                      );
                      message.success("已恢复版本");
                      await fetchOnlyOfficeVersions();
                      await refreshOnlyOfficeEditor();
                    } catch (e: any) {
                      message.error(e?.detail || e?.message || "恢复失败");
                    }
                  }}
                >
                  <Button size="small">恢复</Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      </Modal>
    </>
  );
}
