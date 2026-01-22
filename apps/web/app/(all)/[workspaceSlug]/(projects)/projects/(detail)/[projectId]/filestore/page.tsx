"use client";

import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { PageHead } from "@/components/core/page-title";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { Breadcrumbs, Header } from "@plane/ui";
import { CommonProjectBreadcrumbs } from "@/plane-web/components/breadcrumbs/common";
import { Button, Input, Popconfirm, Table, message, Tooltip, Pagination } from "antd";
import type { TableProps, InputRef, TableColumnType } from "antd";
import type { FilterDropdownProps } from "antd/es/table/interface";
import { DeleteOutlined, DownloadOutlined, EyeOutlined, SearchOutlined, FileOutlined } from "@ant-design/icons";
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

export default function FilestorePage() {
  const { workspaceSlug, projectId } = useParams<{ workspaceSlug: string; projectId: string }>();
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
    fetchAssets();
  }, [fetchAssets]);

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
      width: 180,
      render: (_: any, record: TFilestoreAsset) => (
        <div className="flex items-center">
          <Tooltip title="预览">
            <Button type="text" aria-label="预览" icon={<EyeOutlined />} onClick={() => void handlePreview(record)} />
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
      ),
    },
  ];

  const handlePaginationChange = (page: number, size?: number) => {
    const newPageSize = size || pageSize;
    const nextPage = newPageSize !== pageSize ? 1 : page;
    void fetchAssets(nextPage, newPageSize);
  };

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
                <Button type="primary" onClick={openPicker} loading={uploading} size="small">
                  上传文件
                </Button>
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
              scroll={{ y: "100%" }}
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
              showQuickJumper
              pageSizeOptions={["10", "20", "50", "100"]}
              onChange={handlePaginationChange}
              onShowSizeChange={handlePaginationChange}
              size="small"
            />
          </div>
        </div>
      </ContentWrapper>
    </>
  );
}
