"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { PageHead } from "@/components/core/page-title";
import type { TModuleTreeNode } from "@/components/qa/module-tree";
import { UNASSIGNED_MODULE_KEY } from "@/components/qa/module-tree";
import { RequirementModuleSidebar, type TModuleSidebarStore } from "@/components/requirements/module-tree";
import { useCaseRepositoryModules } from "@/hooks/store/use-case-repository-modules";
import { RepositoryService, type TCaseRepositoryModule } from "@/services/qa/repository.service";
import { Space, Table, Tag, Input, Button, Modal, message, Tooltip } from "antd";
import { SearchOutlined, EditOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import type { TableProps, InputRef, TableColumnType } from "antd";
import type { FilterDropdownProps } from "antd/es/table/interface";
import { formatDateTime, getEnums, globalEnums } from "@/components/qa/shared/testhub/util";

import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import RepositoryModal from "@/components/qa/repository-modal";
import { useTestHub } from "@/components/qa/shared/testhub/testhub-context";
import styles from "./reviews/reviews.module.css";

const repositoryService = new RepositoryService();

/** 模块 id → 「父 / 子」路径，表格「所属模块」列用 */
const buildModulePathMap = (list: TCaseRepositoryModule[], parentPath = "", map = new Map<string, string>()) => {
  for (const item of list) {
    const path = parentPath ? `${parentPath} / ${item.name}` : item.name;
    map.set(item.id, path);
    buildModulePathMap(item.children ?? [], path, map);
  }
  return map;
};

const countDescendants = (node: TModuleTreeNode): number =>
  (node.children ?? []).reduce((sum, child) => sum + 1 + countDescendants(child), 0);

/** 删除模块的确认文案：子模块一并删除，用例库移到「未归类」 */
const getModuleDeleteContent = (node: TModuleTreeNode) => {
  const childCount = countDescendants(node);
  const repositoryCount = node.count ?? 0;
  const parts = [`确定删除模块「${node.label}」吗？`];
  if (childCount > 0) parts.push(`其下 ${childCount} 个子模块将一并删除。`);
  if (repositoryCount > 0) parts.push(`所含 ${repositoryCount} 个用例库移至「未归类」，用例库及其中的用例不受影响。`);
  return parts.join("");
};

export default function TestManagementHomePage() {
  const { workspaceSlug, productId } = useParams<{ workspaceSlug: string; productId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [repositories, setRepositories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchedColumn, setSearchedColumn] = useState("");

  useEffect(() => {
    const initializeEnums = async () => {
      if (workspaceSlug) {
        try {
          const enumTypes = await getEnums(workspaceSlug);
          globalEnums.setEnums(enumTypes);
        } catch {}
      }
    };
    initializeEnums();
  }, [workspaceSlug]);

  useEffect(() => {
    const repositoryIdFromUrl = searchParams.get("repositoryId");
    if (!workspaceSlug || !repositoryIdFromUrl) return;
    try {
      sessionStorage.setItem("selectedRepositoryId", repositoryIdFromUrl);
    } catch {}
    const redirectTo = searchParams.get("redirect_to");
    const ws = String(workspaceSlug || "");
    const pid = String(productId || "");
    let target = redirectTo ? decodeURIComponent(redirectTo) : `/${ws}/products/${pid}/testhub/cases`;
    target = target.includes("?")
      ? `${target}&repositoryId=${encodeURIComponent(String(repositoryIdFromUrl))}`
      : `${target}?repositoryId=${encodeURIComponent(String(repositoryIdFromUrl))}`;
    router.push(target);
  }, [searchParams, workspaceSlug, productId, router]);

  const searchInput = useRef<InputRef>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<{ name?: string }>({});
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  // 左侧用例库模块树：null = 全部用例库，UNASSIGNED_MODULE_KEY = 未归类
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const moduleStore = useCaseRepositoryModules(
    workspaceSlug ? String(workspaceSlug) : undefined,
    productId ? String(productId) : undefined
  );
  const modulePathMap = useMemo(() => buildModulePathMap(moduleStore.modules), [moduleStore.modules]);

  const { registerOpenNewModal, registerOverviewSearch, setOverviewSearchValue } = useTestHub();
  useEffect(() => {
    registerOpenNewModal(() => {
      setEditing(null);
      setModalOpen(true);
    });
  }, [registerOpenNewModal]);

  const handleOverviewSearch = (query: string) => {
    const trimmedQuery = query.trim();
    const newFilters = { ...filters };
    if (trimmedQuery) newFilters.name = trimmedQuery;
    else delete newFilters.name;
    setSearchText(trimmedQuery);
    setSearchedColumn("name");
    setFilters(newFilters);
    setOverviewSearchValue(trimmedQuery);
    fetchRepositories(1, pageSize, newFilters);
  };

  useEffect(() => {
    registerOverviewSearch(handleOverviewSearch);
  }, [handleOverviewSearch, registerOverviewSearch]);

  useEffect(() => {
    setOverviewSearchValue("");
    return () => setOverviewSearchValue("");
  }, [setOverviewSearchValue]);

  const getColumnSearchProps = (dataIndex: keyof any | string): TableColumnType<any> => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }: FilterDropdownProps) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          ref={searchInput}
          placeholder="搜索名称"
          value={selectedKeys[0]}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => handleSearch(selectedKeys as string[], dataIndex, close)}
          style={{ marginBottom: 8, display: "block" }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => handleSearch(selectedKeys as string[], dataIndex, close)}
            icon={<SearchOutlined />}
            size="small"
            style={{ width: 90 }}
          >
            搜索
          </Button>
          <Button
            onClick={() => clearFilters && handleReset(clearFilters, dataIndex)}
            size="small"
            style={{ width: 90 }}
          >
            重置
          </Button>
        </Space>
      </div>
    ),
    filterIcon: (filtered: boolean) => <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />,
    onFilterDropdownOpenChange: (visible) => {
      if (visible) setTimeout(() => searchInput.current?.select(), 100);
    },
    filteredValue: dataIndex === "name" && filters.name ? [filters.name] : null,
  });

  const handleSearch = (selectedKeys: string[], dataIndex: keyof any | string, close?: () => void) => {
    setSearchText(selectedKeys[0]);
    setSearchedColumn(String(dataIndex));
    const newFilters = { ...filters };
    if (selectedKeys[0]) {
      if (dataIndex === "name") newFilters.name = selectedKeys[0];
    } else {
      if (dataIndex === "name") delete newFilters.name;
    }
    setFilters(newFilters);
    if (dataIndex === "name") setOverviewSearchValue(selectedKeys[0] || "");
    fetchRepositories(1, pageSize, newFilters);
    close?.();
  };

  const handleReset = (clearFilters: () => void, dataIndex: keyof any | string) => {
    clearFilters();
    setSearchText("");
    const newFilters = { ...filters };
    if (dataIndex === "name") delete newFilters.name;
    setFilters(newFilters);
    if (dataIndex === "name") setOverviewSearchValue("");
    fetchRepositories(1, pageSize, newFilters);
  };

  const columns: TableProps<any>["columns"] = [
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      width: 180,
      render: (text, record) => (
        <a
          onClick={() => {
            sessionStorage.setItem("selectedRepositoryId", record.id);
            sessionStorage.setItem("selectedRepositoryName", record.name);
            const ws = String(workspaceSlug || "");
            const pid = String(productId || "");
            const target = `/${ws}/products/${pid}/testhub/cases/?repositoryId=${encodeURIComponent(String(record.id))}`;
            router.push(target);
          }}
          style={{ cursor: "pointer" }}
        >
          <span className="block max-w-[440px] truncate text-primary">{text || "-"}</span>
        </a>
      ),
      ...getColumnSearchProps("name"),
    },
    {
      title: "所属模块",
      dataIndex: "module_id",
      key: "module_id",
      width: 200,
      render: (moduleId: string | null) => {
        const path = moduleId ? modulePathMap.get(moduleId) : undefined;
        if (!path) return <span className="text-placeholder">—</span>;
        return (
          <span
            className="inline-block max-w-full truncate rounded-sm bg-layer-1 px-1.5 py-0.5 align-middle text-12 text-secondary"
            title={path}
          >
            {path}
          </span>
        );
      },
    },
    {
      title: "描述",
      dataIndex: "description",
      key: "description",
      render: (description: string) => {
        const descriptionText = String(description ?? "").trim();

        if (!descriptionText) return null;

        return (
          <Tooltip title={descriptionText} placement="topLeft">
            <span className="block max-w-[420px] truncate">{descriptionText}</span>
          </Tooltip>
        );
      },
    },
    {
      title: "创建者",
      key: "created_by",
      dataIndex: "created_by",
      width: 140,
      render: (_: any, record: any) => (
        <MemberDropdown
          multiple={true}
          value={[record.created_by.id]}
          onChange={() => {}}
          disabled={true}
          placeholder={"未知用户"}
          className="w-full text-sm"
          buttonContainerClassName="w-full text-left p-0 cursor-default"
          buttonVariant="transparent-with-text"
          buttonClassName="text-sm p-0 hover:bg-transparent hover:bg-inherit"
          showUserDetails={true}
          optionsClassName="z-[60]"
        />
      ),
    },
    {
      title: "创建时间",
      key: "created_at",
      dataIndex: "created_at",
      width: 190,
      render: (dateString: string) => <span className="whitespace-nowrap">{formatDateTime(dateString)}</span>,
      defaultSortOrder: "descend",
      sorter: (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    },
    {
      title: "操作",
      key: "actions",
      width: 120,
      render: (_: any, record: any) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setEditing(record);
              setModalOpen(true);
            }}
          />
          <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={() => confirmDelete(record)} />
        </Space>
      ),
    },
  ];

  const fetchRepositories = async (
    page: number = currentPage,
    size: number = pageSize,
    filterParams = filters,
    moduleId: string | null = selectedModuleId
  ) => {
    if (!workspaceSlug) return;
    try {
      setLoading(true);
      setError(null);
      const queryParams: any = { page, page_size: size };
      if (filterParams.name) queryParams.name__icontains = filterParams.name;
      if (productId) queryParams.product_id = String(productId);
      if (moduleId) queryParams.module_id = moduleId;
      const response: any = await repositoryService.getRepositories(String(workspaceSlug), queryParams);
      const list = response?.data || [];
      setRepositories(list);
      setTotal(response.count || list.length || 0);
      setCurrentPage(page);
      setPageSize(size);
    } catch (err) {
      setError("获取用例库数据失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = (repo: any) => {
    Modal.confirm({
      title: "确认删除",
      content: `确定删除用例库“${repo.name}”吗？删除后不可恢复。`,
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!workspaceSlug || !repo?.id) return;
        try {
          setApiLoading(true);
          await repositoryService.deleteRepository(String(workspaceSlug), { ids: [repo.id] });
          message.success("删除成功");
          await fetchRepositories(1, pageSize, filters);
          void moduleStore.refresh().catch(() => undefined);
        } catch (e: any) {
          message.error(e?.message || e?.detail || e?.error || "删除失败，请稍后重试");
        } finally {
          setApiLoading(false);
        }
      },
    });
  };

  const handlePaginationChange = (page: number, size?: number) => {
    const newPageSize = size || pageSize;
    fetchRepositories(page, newPageSize, filters);
  };

  const handlePageSizeChange = (_current: number, size: number) => {
    fetchRepositories(1, size, filters);
  };

  useEffect(() => {
    if (!workspaceSlug) return;
    setRepositories([]);
    setTotal(0);
    setCurrentPage(1);
    setPageSize(20);
    setSearchText("");
    setSearchedColumn("");
    setFilters({});
    setOverviewSearchValue("");
    setSelectedModuleId(null);
    fetchRepositories(1, 20, {}, null);
  }, [workspaceSlug, productId]);

  const handleSelectModule = (moduleId: string | null) => {
    setSelectedModuleId(moduleId);
    fetchRepositories(1, pageSize, filters, moduleId);
  };

  // 删模块后其下的库回到「未归类」：看「全部 / 未归类」时右表要重拉；
  // 选中项在被删子树里时侧栏会退回「全部」（走 handleSelectModule），其余模块的列表不受影响
  const sidebarStore: TModuleSidebarStore = {
    ...moduleStore,
    deleteModule: async (moduleId: string) => {
      await moduleStore.deleteModule(moduleId);
      if (selectedModuleId === null || selectedModuleId === UNASSIGNED_MODULE_KEY) {
        void fetchRepositories(1, pageSize, filters);
      }
    },
  };

  const refreshAfterRepositoryChange = () => {
    fetchRepositories(1, pageSize, filters);
    void moduleStore.refresh().catch(() => undefined);
  };

  return (
    <>
      <PageHead title="测试管理" />
      <div className="flex h-full w-full overflow-hidden">
        <RequirementModuleSidebar
          store={sidebarStore}
          selectedModuleId={selectedModuleId}
          onSelect={handleSelectModule}
          allLabel="全部用例库"
          getDeleteConfirmContent={getModuleDeleteContent}
          onModuleMoved={() => fetchRepositories(1, pageSize, filters)}
        />
        <div className="min-w-0 flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-secondary">加载中...</div>
            </div>
          )}
          {error && (
            <div className="bg-red-50 border-red-200 mb-4 rounded-md border p-4">
              <div className="text-red-800 text-sm">{error}</div>
            </div>
          )}
          <style
            dangerouslySetInnerHTML={{
              __html: `
                .testhub-overview-table-scroll .ant-table-thead > tr > th {
                  background: var(--bg-layer-1) !important;
                  border-color: var(--border-subtle) !important;
                  font-size: 13px !important;
                  font-weight: 500 !important;
                  color: var(--text-color-secondary) !important;
                }
              `,
            }}
          />
          {!loading && !error && (
            <>
              <div className={`${styles.reviewLikeAntTable} testhub-overview-table-scroll`}>
                <Table
                  dataSource={repositories}
                  columns={columns}
                  loading={loading}
                  rowKey="id"
                  bordered={true}
                  tableLayout="fixed"
                  pagination={{
                    current: currentPage,
                    pageSize: pageSize,
                    total: total,
                    showSizeChanger: true,
                    showQuickJumper: true,
                    showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
                    pageSizeOptions: ["10", "20", "50", "100"],
                    onChange: handlePaginationChange,
                    onShowSizeChange: handlePageSizeChange,
                  }}
                />
                {apiLoading && <div className="sr-only">processing...</div>}
                <RepositoryModal
                  open={modalOpen}
                  workspaceSlug={String(workspaceSlug || "")}
                  productId={String(productId || "")}
                  initialValues={editing}
                  modules={moduleStore.modules}
                  defaultModuleId={
                    selectedModuleId && selectedModuleId !== UNASSIGNED_MODULE_KEY ? selectedModuleId : null
                  }
                  onCancel={() => setModalOpen(false)}
                  onSuccess={refreshAfterRepositoryChange}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
