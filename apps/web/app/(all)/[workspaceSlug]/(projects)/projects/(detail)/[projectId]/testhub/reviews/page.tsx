"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PageHead } from "@/components/core/page-title";
import { Input, Table, Dropdown, Button, Modal, Tag, message, Tooltip, Space, Pagination, Tree } from "antd";
import type { TableProps, TableColumnType, InputRef } from "antd";
import type { TreeProps } from "antd";
import {
  AppstoreOutlined,
  PlusOutlined,
  EllipsisOutlined,
  DeleteOutlined,
  SearchOutlined,
  EditOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { FolderOpenDot } from "lucide-react";
import styles from "./reviews.module.css";
import { CaseService } from "@/services/qa/review.service";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { formatCNDateTime } from "@/components/qa/cases/util";
import { debounce } from "lodash-es";
import CreateReviewModal from "@/components/qa/review/CreateReviewModal";
import { useAppRouter } from "@/hooks/use-app-router";

type ModuleNode = {
  id: string;
  name: string;
};

type ReviewModule = {
  id: string;
  name: string;
  review_count?: number;
  is_default?: boolean;
  repository?: string;
  parent?: string | null;
  children?: ReviewModule[];
};

type ReviewItem = {
  id: string;
  name: string;
  case_count?: number;
  state?: string;
  pass_rate?: any;
  mode?: string;
  assignees?: string[];
  created_by?: string | null;
  module_name?: string;
  started_at?: string | null;
  ended_at?: string | null;
  created_at?: string;
  module_id?: string | null;
};

const initialModules: ModuleNode[] = [];

const initialReviews: ReviewItem[] = [];

// 独立的输入组件，避免 Tree 渲染导致输入法中断
const ModuleInput = ({
  defaultValue = "",
  placeholder = "",
  onCommit,
}: {
  defaultValue?: string;
  placeholder?: string;
  onCommit: (value: string) => void;
}) => {
  const [value, setValue] = useState(defaultValue);
  const committedRef = useRef(false);

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit(value);
  };

  return (
    <div className="w-full" onClick={(e) => e.stopPropagation()}>
      <Input
        size="small"
        autoFocus
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onPressEnter={commit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
};

export default function ReviewsPage() {
  const { workspaceSlug, projectId } = useParams<{ workspaceSlug: string; projectId: string }>();
  const searchParams = useSearchParams();
  const router = useAppRouter();
  const repositoryIdFromUrl = searchParams.get("repositoryId");
  const repositoryId =
    repositoryIdFromUrl || (typeof window !== "undefined" ? sessionStorage.getItem("selectedRepositoryId") : null);
  const repositoryKey = repositoryId ? String(repositoryId) : "all";
  const [leftWidth, setLeftWidth] = useState<number>(300);
  const isDraggingRef = useRef<boolean>(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);
  const [search, setSearch] = useState<string>("");
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [modules, setModules] = useState<ReviewModule[]>([]);
  const [creatingParentId, setCreatingParentId] = useState<string | "all" | null>(null);
  const [renamingModuleId, setRenamingModuleId] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>(["all"]);
  const [autoExpandParent, setAutoExpandParent] = useState<boolean>(true);
  const [reviews, setReviews] = useState<ReviewItem[]>(initialReviews);
  const [total, setTotal] = useState<number>(0);
  const [allTotal, setAllTotal] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [reviewEnums, setReviewEnums] = useState<Record<string, Record<string, { label: string; color: string }>>>({});
  const [filters, setFilters] = useState<{ name?: string; state?: string[]; mode?: string[] }>({});
  const searchInput = useRef<InputRef | null>(null);
  const caseService = useMemo(() => new CaseService(), []);
  const [createReviewOpen, setCreateReviewOpen] = useState<boolean>(false);
  const [createReviewInitialValues, setCreateReviewInitialValues] = useState<any | undefined>(undefined);
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [editReview, setEditReview] = useState<any>(null);

  const modulesTotalReviews = useMemo(() => {
    const sum = (list: ReviewModule[]): number =>
      (list || []).reduce((acc, n) => acc + Number(n?.review_count || 0) + sum(n?.children || []), 0);
    return sum(modules);
  }, [modules]);
  const totalReviews = typeof allTotal === "number" ? allTotal : modulesTotalReviews;

  const onMouseDownResize = (e: React.MouseEvent<HTMLDivElement>) => {
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = leftWidth;
    window.addEventListener("mousemove", onMouseMoveResize as any);
    window.addEventListener("mouseup", onMouseUpResize as any);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  };

  const onMouseMoveResize = (e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    const next = Math.min(300, Math.max(200, startWidthRef.current + (e.clientX - startXRef.current)));
    setLeftWidth(next);
  };

  const onMouseUpResize = () => {
    isDraggingRef.current = false;
    window.removeEventListener("mousemove", onMouseMoveResize as any);
    window.removeEventListener("mouseup", onMouseUpResize as any);
    document.body.style.cursor = "auto";
    document.body.style.userSelect = "auto";
  };

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", onMouseMoveResize as any);
      window.removeEventListener("mouseup", onMouseUpResize as any);
    };
  }, []);

  useEffect(() => {
    if (!workspaceSlug) return;
    try {
      if (repositoryIdFromUrl) sessionStorage.setItem("selectedRepositoryId", repositoryIdFromUrl);
    } catch {}
    fetchModules();
    fetchEnums();
    fetchAllReviewsTotal();
    const storageKey = `reviews_name_filter_${workspaceSlug}_${repositoryKey}`;
    const savedName = sessionStorage.getItem(storageKey) || "";
    const initFilters = savedName ? { ...filters, name: savedName } : { ...filters };
    setFilters(initFilters);
    debouncedFetchReviews(1, pageSize, selectedModuleId, initFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, repositoryKey]);

  const fetchModules = async () => {
    if (!workspaceSlug || !projectId) return;
    try {
      const data: ReviewModule[] = await caseService.getReviewModules(workspaceSlug as string, projectId as string);
      setModules(Array.isArray(data) ? data : []);
    } catch (e) {
      // ignore error for placeholder page
    }
  };

  const fetchEnums = async () => {
    if (!workspaceSlug) return;
    try {
      const data = await caseService.getReviewEnums(workspaceSlug as string);
      setReviewEnums(data || {});
    } catch (e) {}
  };

  const fetchAllReviewsTotal = async () => {
    if (!workspaceSlug || !projectId) return;
    try {
      const params: any = { page: 1, page_size: 1 };
      params.project_id = projectId;
      const res = await caseService.getReviews(workspaceSlug as string, params);
      setAllTotal(Number(res?.count || 0));
    } catch (e) {
      setAllTotal(undefined);
    }
  };

  const fetchReviews = async (
    page: number,
    size: number,
    moduleId: string | null,
    extraFilters?: { name?: string; state?: string[]; mode?: string[] }
  ) => {
    if (!workspaceSlug || !projectId) return;
    setLoading(true);
    setError("");
    try {
      const params: any = { page, page_size: size };
      if (moduleId) {
        params.module_id = moduleId;
      } else {
        params.project_id = projectId;
      }
      if (extraFilters?.name) params.name__icontains = extraFilters.name;
      if (extraFilters?.state && extraFilters.state.length) params.state__in = extraFilters.state.join(",");
      if (extraFilters?.mode && extraFilters.mode.length) params.mode__in = extraFilters.mode.join(",");
      const res = await caseService.getReviews(workspaceSlug as string, params);
      setReviews(Array.isArray(res?.data) ? res.data : []);
      setTotal(Number(res?.count || 0));
    } catch (e: any) {
      setError(e?.message || e?.detail || e?.error || "加载失败");
      message.error(e?.message || e?.detail || e?.error || "加载失败");
    } finally {
      setLoading(false);
    }
  };

  const debouncedFetchReviews = useMemo(
    () =>
      debounce(
        (
          page: number,
          size: number,
          moduleId: string | null,
          f?: { name?: string; state?: string[]; mode?: string[] }
        ) => {
          fetchReviews(page, size, moduleId, f);
        },
        300
      ),
    [workspaceSlug]
  );

  useEffect(() => {
    return () => {
      debouncedFetchReviews.cancel();
    };
  }, [debouncedFetchReviews]);

  const getColumnSearchProps = (dataIndex: keyof ReviewItem | string): TableColumnType<ReviewItem> => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          ref={searchInput}
          placeholder={`搜索 ${dataIndex === "name" ? "评审名称" : ""}`}
          value={selectedKeys[0] as string}
          onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
          onPressEnter={() => handleSearch(selectedKeys as string[], dataIndex, confirm)}
          style={{ marginBottom: 8, display: "block" }}
        />
        <Space>
          <Button
            type="primary"
            onClick={() => handleSearch(selectedKeys as string[], dataIndex, confirm)}
            icon={<SearchOutlined />}
            size="small"
            style={{ width: 90 }}
          >
            搜索
          </Button>
          <Button
            onClick={() => clearFilters && handleReset(clearFilters, dataIndex, confirm)}
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
      if (visible) {
        setTimeout(() => searchInput.current?.select?.(), 100);
      }
    },
    filteredValue: dataIndex === "name" ? (filters.name ? [filters.name] : null) : null,
  });

  const handleSearch = (selectedKeys: string[], dataIndex: keyof ReviewItem | string, confirm?: () => void) => {
    const newFilters = { ...filters };
    if (selectedKeys[0]) {
      if (dataIndex === "name") newFilters.name = selectedKeys[0];
    } else {
      if (dataIndex === "name") delete newFilters.name;
    }
    setFilters(newFilters);
    const storageKey = `reviews_name_filter_${workspaceSlug}_${repositoryKey}`;
    if (dataIndex === "name") {
      const v = newFilters.name || "";
      try {
        sessionStorage.setItem(storageKey, v);
      } catch {}
    }
    confirm?.();
    setCurrentPage(1);
  };

  const handleReset = (clear: () => void, dataIndex: keyof ReviewItem | string, confirm?: () => void) => {
    clear();
    const newFilters = { ...filters };
    if (dataIndex === "name") delete newFilters.name;
    setFilters(newFilters);
    const storageKey = `reviews_name_filter_${workspaceSlug}_${repositoryKey}`;
    if (dataIndex === "name") {
      try {
        sessionStorage.setItem(storageKey, "");
      } catch {}
    }
    confirm?.();
    setCurrentPage(1);
  };

  const onExpand: TreeProps["onExpand"] = (keys) => {
    setExpandedKeys(keys as string[]);
    setAutoExpandParent(false);
  };

  const handleAddUnderNode = (parentId: string | "all") => {
    setRenamingModuleId(null);
    setCreatingParentId(parentId);
    setExpandedKeys((prev) => {
      const pid = String(parentId);
      return prev.includes(pid) ? prev : [...prev, pid];
    });
    setAutoExpandParent(true);
  };

  const handleCreateBlurOrEnter = async (parentId: string | "all", inputValue: string) => {
    const name = inputValue.trim();
    if (!name || !workspaceSlug || !projectId) {
      setCreatingParentId(null);
      return;
    }
    const payload: any = { name, project: projectId };
    if (parentId !== "all") payload.parent = parentId;
    try {
      await caseService.createReviewModule(workspaceSlug as string, payload);
      setCreatingParentId(null);
      await fetchModules();
      await fetchAllReviewsTotal();
    } catch (e) {
      setCreatingParentId(null);
    }
  };

  const startRenameNode = (moduleId: string, currentName: string) => {
    setCreatingParentId(null);
    setRenamingModuleId(moduleId);
    setExpandedKeys((prev) => (prev.includes(moduleId) ? prev : [...prev, moduleId]));
    setAutoExpandParent(true);
  };

  const handleRenameBlurOrEnter = async (moduleId: string, inputValue: string) => {
    const name = inputValue.trim();
    if (!name || !workspaceSlug) {
      setRenamingModuleId(null);
      return;
    }
    try {
      await caseService.updateReviewModule(workspaceSlug as string, moduleId, { name });
      setRenamingModuleId(null);
      await fetchModules();
    } catch (e) {
      setRenamingModuleId(null);
    }
  };

  const confirmDeleteModule = (module: ReviewModule) => {
    Modal.confirm({
      title: "确认删除",
      content: "删除该评审模块将不可恢复，是否继续？",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!workspaceSlug || !module?.id) return;
        try {
          await caseService.deleteReviewModule(workspaceSlug as string, { ids: [module.id] });
          if (selectedModuleId === module.id) setSelectedModuleId(null);
          await fetchModules();
          await fetchAllReviewsTotal();
        } catch (e) {
          // ignore
        }
      },
    });
  };

  const confirmDeleteReview = (review: ReviewItem) => {
    Modal.confirm({
      title: "确认删除",
      content: "删除该评审将不可恢复，是否继续？",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!workspaceSlug || !review?.id) return;
        try {
          await caseService.deleteReview(workspaceSlug as string, { ids: [review.id] });
          await fetchReviews(currentPage, pageSize, selectedModuleId, filters);
          await fetchModules();
          await fetchAllReviewsTotal();
          message.success("删除成功");
        } catch (e) {}
      },
    });
  };

  const renderCreatingInput = (parentId: string | "all") => (
    <ModuleInput placeholder="请输入模块名称" onCommit={(val) => handleCreateBlurOrEnter(parentId, val)} />
  );

  const getNodeCount = (m: any) => {
    const c = m?.review_count ?? m?.count ?? m?.total;
    return typeof c === "number" ? c : undefined;
  };

  const renderNodeTitle = (node: any) => {
    const nodeId = String(node?.id);
    const title = String(node?.name || "-");
    const isDefault = Boolean(node?.is_default);
    const count = getNodeCount(node);

    if (renamingModuleId && renamingModuleId === nodeId) {
      return (
        <ModuleInput
          placeholder="请输入模块名称"
          defaultValue={title}
          onCommit={(val) => handleRenameBlurOrEnter(nodeId, val)}
        />
      );
    }

    const menuItems = [
      {
        key: "add",
        label: (
          <Button type="text" size="small" onClick={() => handleAddUnderNode(nodeId)}>
            添加
          </Button>
        ),
      },
      ...(!isDefault
        ? [
            {
              key: "rename",
              label: (
                <Button type="text" size="small" onClick={() => startRenameNode(nodeId, title)}>
                  重命名
                </Button>
              ),
            },
            {
              key: "delete",
              label: (
                <Button type="text" danger size="small" onClick={() => confirmDeleteModule(node)}>
                  删除
                </Button>
              ),
            },
          ]
        : []),
    ];

    return (
      <div className="group flex items-center justify-between gap-2 w-full">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 text-custom-text-300">
            <FolderOpenDot size={14} />
          </span>
          <span className="text-sm text-custom-text-200">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {typeof count === "number" && <span className="text-xs text-custom-text-300">{count}</span>}
          <Dropdown
            trigger={["hover"]}
            menu={{
              items: menuItems,
            }}
          >
            <Button
              type="text"
              size="small"
              icon={<EllipsisOutlined />}
              className="opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </Dropdown>
        </div>
      </div>
    );
  };

  const buildTreeNodes = (list: any[]): any[] => {
    if (!Array.isArray(list)) return [];
    return list.map((node: any) => {
      const nodeId = String(node?.id);
      const childrenNodes = buildTreeNodes(node?.children || []);
      const creatingChild =
        creatingParentId === nodeId
          ? [
              {
                title: renderCreatingInput(nodeId),
                key: `__creating__${nodeId}`,
                selectable: false,
              },
            ]
          : [];
      return {
        title: renderNodeTitle(node),
        key: nodeId,
        children: [...creatingChild, ...childrenNodes],
      };
    });
  };

  const filterModulesByName = (list: any[], q: string): any[] => {
    if (!q) return list || [];
    const query = q.trim().toLowerCase();
    const walk = (nodes: any[]): any[] => {
      return (nodes || [])
        .map((n) => {
          const name = String(n?.name || "").toLowerCase();
          const childMatches = walk(n?.children || []);
          const selfMatch = name.includes(query);
          if (selfMatch || childMatches.length) {
            return { ...n, children: childMatches };
          }
          return null;
        })
        .filter(Boolean) as any[];
    };
    return walk(list || []);
  };

  const filteredModules = useMemo(() => filterModulesByName(modules, search), [modules, search]);

  const findModuleById = (list: ReviewModule[], id: string): ReviewModule | null => {
    for (const item of list || []) {
      if (String(item.id) === id) return item;
      const child = findModuleById(item.children || [], id);
      if (child) return child;
    }
    return null;
  };

  const hasDescendant = (node: ReviewModule, targetId: string): boolean => {
    for (const child of node.children || []) {
      if (String(child.id) === targetId) return true;
      if (hasDescendant(child, targetId)) return true;
    }
    return false;
  };

  const treeData = [
    {
      title: (
        <div className="group flex items-center justify-between gap-2 w-full">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 text-custom-text-300">
              <AppstoreOutlined />
            </span>
            <span className="text-sm font-medium text-custom-text-200">全部评审</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-custom-text-300">{totalReviews}</span>
            <Dropdown
              trigger={["hover"]}
              menu={{
                items: [
                  {
                    key: "add",
                    label: (
                      <Button type="text" size="small" onClick={() => handleAddUnderNode("all")}>
                        添加
                      </Button>
                    ),
                  },
                ],
              }}
            >
              <Button
                type="text"
                size="small"
                icon={<EllipsisOutlined />}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </Dropdown>
          </div>
        </div>
      ),
      key: "all",
      children: [
        ...(creatingParentId === "all"
          ? [
              {
                title: renderCreatingInput("all"),
                key: "__creating__root",
                selectable: false,
              },
            ]
          : []),
        ...buildTreeNodes(filteredModules),
      ],
    },
  ];

  const onSelect: TreeProps["onSelect"] = (selectedKeys, info) => {
    const keyStr = String(info?.node?.key);
    if (keyStr.startsWith("__creating__")) return;
    if (!info.selected) {
      if (keyStr === "all") setSelectedModuleId(null);
      return;
    }
    const key = selectedKeys[0] as string | undefined;
    const nextModuleId = !key || key === "all" ? null : key;
    setSelectedModuleId(nextModuleId);
    setCurrentPage(1);
    fetchModules();
  };

  const onDrop: TreeProps["onDrop"] = async (info) => {
    const dragKey = String(info.dragNode?.key);
    const dropKey = String(info.node?.key);
    if (!workspaceSlug) return;
    if (!dragKey || !dropKey) return;
    if (info.dropToGap) return;
    if (dragKey === dropKey) return;
    if (dragKey === "all" || dragKey.startsWith("__creating__")) return;
    if (dropKey.startsWith("__creating__")) return;
    const dragModule = findModuleById(modules, dragKey);
    if (!dragModule) return;
    if (dropKey !== "all" && hasDescendant(dragModule, dropKey)) return;
    const newParent = dropKey === "all" ? null : dropKey;
    try {
      await caseService.updateReviewModule(workspaceSlug as string, dragKey, { parent: newParent });
      setExpandedKeys((prev) => {
        if (dropKey === "all" || prev.includes(dropKey)) return prev;
        return [...prev, dropKey];
      });
      await fetchModules();
      await fetchAllReviewsTotal();
    } catch (e) {}
  };

  useEffect(() => {
    debouncedFetchReviews(currentPage, pageSize, selectedModuleId, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModuleId, currentPage, pageSize, filters]);

  const totalForCurrent = useMemo(() => {
    return total;
  }, [total]);

  const handlePaginationChange = (page: number, size?: number) => {
    const nextSize = size || pageSize;
    if (nextSize !== pageSize) {
      setPageSize(nextSize);
      if (currentPage !== 1) setCurrentPage(1);
      return;
    }
    if (page !== currentPage) setCurrentPage(page);
  };

  const handlePageSizeChange = (_current: number, size: number) => {
    if (size !== pageSize) setPageSize(size);
    if (currentPage !== 1) setCurrentPage(1);
  };

  const dateOnly = (v?: string | number | Date | null) => {
    if (!v) return "-";
    const d = typeof v === "string" || typeof v === "number" ? new Date(v) : v;
    if (isNaN(d.getTime())) return "-";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const columns: TableProps<ReviewItem>["columns"] = [
    {
      title: "评审名称",
      dataIndex: "name",
      key: "name",
      width: 220,
      ...getColumnSearchProps("name"),
      render: (name: string, record: ReviewItem) => (
        <Tooltip title={name} placement="topLeft">
          <Button
            type="link"
            className="!text-custom-text-200 hover:!text-custom-text-100 !p-0 !h-auto block w-full text-left"
            onClick={() => {
              try {
                sessionStorage.setItem("selectedReviewName", name || "");
              } catch {}
              router.push(
                `/${workspaceSlug}/projects/${projectId}/testhub/caseManagementReviewDetail?review_id=${record.id}`
              );
            }}
          >
            <div className="truncate">{name}</div>
          </Button>
        </Tooltip>
      ),
    },
    { title: "用例数量", dataIndex: "case_count", key: "case_count", width: 120 },
    {
      title: "评论状态",
      dataIndex: "state",
      key: "state",
      width: 140,
      render: (state: string) => {
        const color = reviewEnums?.CaseReview_State?.[state]?.color || "default";
        return <Tag color={color}>{state || "-"}</Tag>;
      },
      filters: Object.entries(reviewEnums?.CaseReview_State || {}).map(([value, meta]) => ({
        text: (meta as any)?.label || value,
        value,
      })),
      filterMultiple: true,
      filteredValue: filters.state ?? null,
    },
    {
      title: "通过率",
      dataIndex: "pass_rate",
      key: "pass_rate",
      width: 180,
      render: (passRate: any, record: ReviewItem) => {
        const enums = reviewEnums?.CaseReviewThrough_Result || {};
        const orderKeys = Object.keys(enums);
        const totalCount =
          typeof record?.case_count === "number"
            ? record.case_count || 0
            : Object.values(passRate || {}).reduce((s: number, v: any) => s + Number(v || 0), 0);
        const passKey = orderKeys.find((k) => enums[k]?.color === "green") || "通过";
        const passed = Number(passRate?.[passKey] || 0);
        const percent = totalCount > 0 ? Math.floor((passed / totalCount) * 100) : 0;

        const colorHexMap: Record<string, string> = {
          green: "#52c41a",
          red: "#ff4d4f",
          gold: "#faad14",
          blue: "#1677ff",
          gray: "#bfbfbf",
          default: "#d9d9d9",
        };

        const segments = orderKeys.map((k) => {
          const count = Number(passRate?.[k] || 0);
          const c = enums[k]?.color || "default";
          const color = colorHexMap[c] || c;
          const widthPct = totalCount > 0 ? (count / totalCount) * 100 : 0;
          return { key: k, count, color, widthPct };
        });

        const tooltipContent = (
          <div className={styles.legend}>
            {orderKeys.map((k) => {
              const c = enums[k]?.color || "default";
              const color = colorHexMap[c] || c;
              return (
                <div key={k} className={styles.legendItem}>
                  <span className={styles.legendColor} style={{ backgroundColor: color }} />
                  <span className={styles.legendLabel}>{k}</span>
                  <span className={styles.legendCount}>{Number(passRate?.[k] || 0)}</span>
                </div>
              );
            })}
          </div>
        );

        return (
          <div className={styles.passRateCell}>
            <Tooltip mouseEnterDelay={0.25} overlayClassName={styles.lightTooltip} title={tooltipContent}>
              <div className={styles.progressWrap}>
                <div className={styles.progressBar}>
                  {segments.map((seg, idx) => (
                    <div
                      key={`${seg.key}-${idx}`}
                      className={styles.progressSegment}
                      style={{ width: `${seg.widthPct}%`, backgroundColor: seg.color }}
                    />
                  ))}
                </div>
              </div>
            </Tooltip>
            <span className={styles.progressPercent}>{percent}%</span>
          </div>
        );
      },
    },
    {
      title: "评审模式",
      dataIndex: "mode",
      key: "mode",
      width: 140,
      render: (mode: string) => {
        const color = reviewEnums?.CaseReview_ReviewMode?.[mode]?.color || "default";
        return <Tag color={color}>{mode || "-"}</Tag>;
      },
      filters: Object.entries(reviewEnums?.CaseReview_ReviewMode || {}).map(([value, meta]) => ({
        text: (meta as any)?.label || value,
        value,
      })),
      filterMultiple: true,
      filteredValue: filters.mode ?? null,
    },
    {
      title: "评审人",
      dataIndex: "assignees",
      key: "assignees",
      width: 220,
      render: (assignees: string[] = []) => (
        <MemberDropdown
          multiple={true}
          value={assignees}
          onChange={() => {}}
          disabled={true}
          placeholder={assignees?.length ? "" : "未知用户"}
          className="w-full text-sm"
          buttonContainerClassName="w-full text-left p-0 cursor-default"
          buttonVariant="transparent-with-text"
          buttonClassName="text-sm p-0 hover:bg-transparent hover:bg-inherit"
          showUserDetails={true}
          optionsClassName="z-[60]"
        />
      ),
    },
    { title: "所属模块", dataIndex: "module_name", key: "module_name", width: 200 },
    {
      title: "评审周期",
      key: "period",
      width: 220,
      render: (_, r) => <span>{`${dateOnly(r?.started_at)} - ${dateOnly(r?.ended_at)}`}</span>,
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 200,
      render: (v: string) => <span>{formatCNDateTime(v)}</span>,
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 120,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            aria-label="编辑"
            onClick={() => {
              setEditReview({
                id: record.id,
                name: record.name,
                description: (record as any)?.description ?? "",
                module_id: (record as any)?.module ?? record.module_id ?? null,
                assignees: Array.isArray(record.assignees) ? record.assignees : [],
                started_at: record.started_at ?? null,
                ended_at: record.ended_at ?? null,
                cases: (record as any)?.cases ?? [],
                case_count: record.case_count ?? undefined,
              });
              setEditOpen(true);
            }}
          />
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            aria-label="删除"
            onClick={() => confirmDeleteReview(record)}
          />
        </Space>
      ),
    },
  ];

  return (
    <div className={styles.container}>
      <PageHead title="评审" />
      <div className={styles.split}>
        <div className={`${styles.left} flex flex-col h-full`} style={{ width: leftWidth }}>
          <div className={`${styles.leftHeader} flex-shrink-0`}>
            <Space>
              <Input
                allowClear
                placeholder="按模块名称搜索"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button
                type="button"
                onClick={() => {
                  setCreateReviewInitialValues(selectedModuleId ? { module_id: selectedModuleId } : undefined);
                  setCreateReviewOpen(true);
                }}
                className="text-white bg-custom-primary-100 hover:bg-custom-primary-200 focus:text-custom-brand-40 focus:bg-custom-primary-200 px-3 py-1.5 font-medium text-xs rounded flex items-center gap-1.5 whitespace-nowrap transition-all justify-center"
              >
                新建评审
              </button>
            </Space>
          </div>
          <div className={`${styles.treeRoot} flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm`}>
            <Tree
              blockNode
              draggable
              showIcon={false}
              switcherIcon={
                <span className="inline-flex items-center justify-center w-5 h-5 text-custom-text-300">
                  <DownOutlined />
                </span>
              }
              treeData={treeData as any}
              selectedKeys={[selectedModuleId ?? "all"]}
              expandedKeys={expandedKeys}
              autoExpandParent={autoExpandParent}
              onExpand={onExpand}
              onSelect={onSelect}
              onDrop={onDrop}
              className="py-2 pl-2 custom-tree-indent testhub-review-module-tree"
            />
          </div>
          <div className={styles.resizer} onMouseDown={onMouseDownResize} />
        </div>
        <div className={`${styles.right} !py-0 overflow-hidden`}>
          <div className="flex flex-col h-full overflow-hidden">
            <div
              className={`testhub-reviews-table-scroll flex-1 relative overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:block [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[rgb(var(--color-scrollbar))] [&::-webkit-scrollbar-thumb]:rounded-full ${
                pageSize === 100 ? "testhub-reviews-scrollbar-strong" : ""
              }`}
            >
              <Table
                columns={columns}
                dataSource={reviews}
                loading={loading}
                rowKey="id"
                scroll={{ x: 1300 }}
                onChange={(_, filtersArg) => {
                  const selectedStates = (filtersArg.state as string[]) || [];
                  const selectedModes = (filtersArg.mode as string[]) || [];
                  const newFilters = {
                    ...filters,
                    state: selectedStates.length ? selectedStates : undefined,
                    mode: selectedModes.length ? selectedModes : undefined,
                  };
                  const filtersChanged = JSON.stringify(filters) !== JSON.stringify(newFilters);
                  if (filtersChanged) {
                    setCurrentPage(1);
                    setFilters(newFilters);
                  }
                }}
                pagination={false}
              />
            </div>
            <div className="flex-shrink-0 border-t border-custom-border-200 px-4 py-3 bg-custom-background-100 flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-custom-text-300">
                  {totalForCurrent > 0
                    ? `第 ${(currentPage - 1) * pageSize + 1}-${Math.min(
                        currentPage * pageSize,
                        totalForCurrent
                      )} 条，共 ${totalForCurrent} 条`
                    : ""}
                </span>
              </div>
              <Pagination
                simple
                current={currentPage}
                pageSize={pageSize}
                total={totalForCurrent}
                showSizeChanger
                pageSizeOptions={["10", "20", "50", "100"]}
                onChange={handlePaginationChange}
                onShowSizeChange={handlePageSizeChange}
                size="small"
              />
            </div>
          </div>
          <style
            dangerouslySetInnerHTML={{
              __html: `
                .testhub-reviews-table-scroll{
                  scrollbar-gutter: stable both-edges;
                }

                .testhub-reviews-table-scroll .ant-table-thead > tr > th{
                  position: sticky;
                  top: 0;
                  z-index: 5;
                  background: rgb(var(--color-background-100));
                }

                .testhub-reviews-table-scroll.testhub-reviews-scrollbar-strong{
                  overflow-y: scroll;
                  scrollbar-width: auto;
                  scrollbar-color: rgb(var(--color-scrollbar)) transparent;
                }

                .testhub-reviews-table-scroll.testhub-reviews-scrollbar-strong::-webkit-scrollbar{
                  width: 12px;
                  height: 12px;
                }

                .testhub-reviews-table-scroll.testhub-reviews-scrollbar-strong::-webkit-scrollbar-thumb{
                  background-color: rgba(var(--color-scrollbar), 0.85);
                  border-radius: 999px;
                  border: 3px solid rgba(var(--color-background-100), 1);
                }

                .testhub-reviews-table-scroll.testhub-reviews-scrollbar-strong::-webkit-scrollbar-track{
                  background: transparent;
                }

                .testhub-review-module-tree .ant-tree-draggable-icon{
                  display: none !important;
                }

                .custom-tree-indent .ant-tree-indent-unit {
                  width: 10px !important;
                }
                .custom-tree-indent .ant-tree-switcher {
                  width: 14px !important;
                  margin-inline-end: 2px !important;
                }
                .custom-tree-indent .ant-tree-node-content-wrapper {
                  padding-inline: 4px !important;
                }
              `,
            }}
          />
        </div>
        <CreateReviewModal
          open={createReviewOpen}
          initialValues={createReviewInitialValues}
          onClose={() => {
            fetchReviews(currentPage, pageSize, selectedModuleId, filters);
            fetchModules();
            fetchAllReviewsTotal();
            setCreateReviewOpen(false);
            setCreateReviewInitialValues(undefined);
          }}
        />
        {editOpen && (
          <CreateReviewModal
            open={editOpen}
            mode="edit"
            initialValues={editReview || undefined}
            onClose={() => {
              fetchReviews(currentPage, pageSize, selectedModuleId, filters);
              fetchModules();
              fetchAllReviewsTotal();
              setEditOpen(false);
              setEditReview(null);
            }}
          />
        )}
      </div>
    </div>
  );
}
