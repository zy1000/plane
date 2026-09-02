"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef, useMemo } from "react";
import { PageHead } from "@/components/core/page-title";
import { PlanService } from "@/services/qa/plan.service";
import { Space, Table, Tag, Input, Button, Dropdown, Modal, Tooltip, Pagination, Tree } from "antd";
import {
  SearchOutlined,
  PlusOutlined,
  AppstoreOutlined,
  EllipsisOutlined,
  DeleteOutlined,
  EditOutlined,
  DownOutlined,
} from "@ant-design/icons";
import { FolderOpenDot } from "lucide-react";
import type { TableProps, InputRef, TableColumnType } from "antd";
import type { TreeProps } from "antd";
import type { FilterDropdownProps } from "antd/es/table/interface";
import { ChevronDownIcon } from "@plane/propel/icons";
type PlanModule = {
  id: string;
  name: string;
  is_default?: boolean;
  parent?: string | null;
  children?: PlanModule[];
  total?: number;
};
type TestPlan = {
  id: string;
  name: string;
  begin_time?: string | null;
  end_time?: string | null;
  cases?: any[];
  state?: string | number;
  module?: string | null;
  module_id?: string | null;
  pass_rate?: Record<string, number> | null;
  result?: string | null;
};
type TestPlanResponse = { data: TestPlan[]; count: number };
import { formatDate, formatDateTime, globalEnums } from "../util";
import { CreateUpdatePlanModal } from "@/components/qa/plans/create-update-modal";
import styles from "../reviews/reviews.module.css";
import { useTestHub } from "../testhub-context";
import { useProjectPermissions } from "@/hooks/store/use-project-permissions";
import UnauthorizedImg from "@/app/assets/auth/unauthorized.svg?url";
import { useTranslation } from "@plane/i18n";
import { qaCaseSetToastError } from "@/utils/qa-case-error";

const QA_PLAN_CREATE_PERMISSION_KEY = "qa.plan.create" as const;
const QA_PLAN_EDIT_PERMISSION_KEY = "qa.plan.edit" as const;
const QA_PLAN_DELETE_PERMISSION_KEY = "qa.plan.delete" as const;

export default function TestPlanDetailPage() {
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const Enums = globalEnums.Enums;
  const repositoryIdFromUrl = searchParams.get("repositoryId");
  const moduleIdFromUrl = searchParams.get("moduleId");
  const repositoryId =
    repositoryIdFromUrl || (typeof window !== "undefined" ? sessionStorage.getItem("selectedRepositoryId") : null);
  const repositoryName = typeof window !== "undefined" ? sessionStorage.getItem("selectedRepositoryName") : "";
  const decodedRepositoryName = repositoryName || "";

  const { fetched: permissionsFetched, hasPermission } = useProjectPermissions(
    String(workspaceSlug || ""),
    String(projectId || "")
  );
  const canCreatePlan = permissionsFetched && hasPermission(QA_PLAN_CREATE_PERMISSION_KEY);
  const canEditPlan = permissionsFetched && hasPermission(QA_PLAN_EDIT_PERMISSION_KEY);
  const canDeletePlan = permissionsFetched && hasPermission(QA_PLAN_DELETE_PERMISSION_KEY);

  const [testPlans, setTestPlans] = useState<TestPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchedColumn, setSearchedColumn] = useState("");
  const searchInput = useRef<InputRef>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { registerOpenNewPlanModal, registerPlanSearch, setPlanSearchValue } = useTestHub();
  useEffect(() => {
    registerOpenNewPlanModal(() => {
      if (!canCreatePlan) return;
      setShowCreateModal(true);
    });
  }, [canCreatePlan, registerOpenNewPlanModal]);
  const planService = new PlanService();
  const [leftWidth, setLeftWidth] = useState<number>(300);
  const isDraggingRef = useRef<boolean>(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);
  const [searchModule, setSearchModule] = useState<string>("");
  const [modules, setModules] = useState<PlanModule[]>([]);
  const [creatingParentId, setCreatingParentId] = useState<string | "all" | null>(null);
  const [renamingModuleId, setRenamingModuleId] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>(["all"]);
  const [autoExpandParent, setAutoExpandParent] = useState<boolean>(true);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<{ name?: string; states?: number[] }>({});

  const [allTotal, setAllTotal] = useState<number | undefined>(undefined);
  const [moduleCounts, setModuleCounts] = useState<Record<string, number>>({});
  const totalPlansFromModules = useMemo(() => {
    const sum = (list: PlanModule[]): number =>
      (list || []).reduce((acc, n) => acc + Number(n?.total || 0) + sum(n?.children || []), 0);
    return sum(modules);
  }, [modules]);

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

  useEffect(
    () => () => {
      window.removeEventListener("mousemove", onMouseMoveResize as any);
      window.removeEventListener("mouseup", onMouseUpResize as any);
    },
    []
  );

  const appliedModuleIdFromUrlRef = useRef<string | null>(null);
  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    if (!permissionsFetched) return;
    if (!hasPermission("qa.plan.view")) return;
    try {
      if (repositoryIdFromUrl) {
        sessionStorage.setItem("selectedRepositoryId", repositoryIdFromUrl);
      }
    } catch {}
    fetchModules();
    // URL 带 moduleId（如从计划用例页面包屑跳入）时只应用一次，之后以用户手动选择为准
    if (moduleIdFromUrl && appliedModuleIdFromUrlRef.current !== moduleIdFromUrl) {
      appliedModuleIdFromUrlRef.current = moduleIdFromUrl;
      setSelectedModuleId(moduleIdFromUrl);
      fetchTestPlans(1, pageSize, filters, moduleIdFromUrl);
    } else {
      fetchTestPlans(1, pageSize);
    }
  }, [workspaceSlug, projectId, permissionsFetched, hasPermission, repositoryIdFromUrl, moduleIdFromUrl, pageSize]);

  const batchUpdateModuleCounts = (list: any[], countsMap: Record<string, number>): any[] => {
    return (list || []).map((m: any) => {
      const updated = { ...m };
      if (m?.id && countsMap[String(m.id)] !== undefined) {
        updated.total = countsMap[String(m.id)];
      }
      if (Array.isArray(m?.children) && m.children.length) {
        updated.children = batchUpdateModuleCounts(m.children, countsMap);
      }
      return updated;
    });
  };

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

  const fetchModules = async () => {
    if (!workspaceSlug || !projectId) return;
    try {
      const pid = Array.isArray(projectId) ? projectId[0] : projectId;
      const countsResponse: any = await planService.getPlanModulesCount(workspaceSlug as string, pid);
      const { total: t = 0, ...countsMap } = countsResponse || {};
      setAllTotal(typeof t === "number" ? t : Number(t || 0));
      setModuleCounts(countsMap as Record<string, number>);
      const data: any[] = await planService.getPlanModules(workspaceSlug as string, pid);
      const updatedModules = batchUpdateModuleCounts(
        Array.isArray(data) ? data : [],
        countsMap as Record<string, number>
      );
      setModules(updatedModules);
    } catch {}
  };

  const handlePlanSearch = (query: string) => {
    const trimmedQuery = query.trim();
    const newFilters = { ...filters };
    if (trimmedQuery) newFilters.name = trimmedQuery;
    else delete newFilters.name;
    setSearchText(trimmedQuery);
    setSearchedColumn("name");
    setFilters(newFilters);
    setPlanSearchValue(trimmedQuery);
    fetchTestPlans(1, pageSize, newFilters, selectedModuleId ?? undefined);
  };

  useEffect(() => {
    registerPlanSearch(handlePlanSearch);
  }, [handlePlanSearch, registerPlanSearch]);

  useEffect(() => {
    setPlanSearchValue("");
    return () => setPlanSearchValue("");
  }, [setPlanSearchValue]);

  const getColumnSearchProps = (dataIndex: keyof TestPlan | string): TableColumnType<TestPlan> => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }: FilterDropdownProps) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          ref={searchInput}
          placeholder={`搜索 ${dataIndex === "name" ? "名称" : "其他"}`}
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
    filteredValue: dataIndex === "name" ? (filters.name ? [filters.name] : null) : null,
  });

  const handleSearch = (selectedKeys: string[], dataIndex: keyof TestPlan | string, close?: () => void) => {
    setSearchText(selectedKeys[0]);
    setSearchedColumn(dataIndex);
    const newFilters = { ...filters };
    if (selectedKeys[0]) {
      if (dataIndex === "name") newFilters.name = selectedKeys[0];
    } else {
      if (dataIndex === "name") delete newFilters.name;
    }
    setFilters(newFilters);
    if (dataIndex === "name") setPlanSearchValue(selectedKeys[0] || "");
    fetchTestPlans(1, pageSize, newFilters);
    close?.();
  };

  const handleReset = (clearFilters: () => void, dataIndex: keyof TestPlan | string) => {
    clearFilters();
    setSearchText("");
    const newFilters = { ...filters };
    if (dataIndex === "name") delete newFilters.name;
    setFilters(newFilters);
    if (dataIndex === "name") setPlanSearchValue("");
    fetchTestPlans(1, pageSize, newFilters);
  };

  const renderState = (state: any) => {
    const rawColor = (Enums?.plan_state as any)?.[state] || "default";
    const color = rawColor === "gray" ? "default" : rawColor;
    const text = state ?? "-";
    return <Tag color={color}>{text}</Tag>;
  };

  const renderPassRate = (passRate: any, record: TestPlan) => {
    const orderKeys = ["成功", "失败", "阻塞", "无效", "未执行"];
    const totalCount = orderKeys.reduce((s, k) => s + Number(passRate?.[k] || 0), 0);
    const passed = Number(passRate?.["成功"] || 0);
    const percent = totalCount > 0 ? Math.floor((passed / totalCount) * 100) : 0;
    const colorHexMap: Record<string, string> = {
      green: "#52c41a",
      red: "#ff4d4f",
      gold: "#faad14",
      blue: "#1677ff",
      gray: "#bfbfbf",
      mediumBlue: "#3b5999",
      default: "#d9d9d9",
    };
    const categoryColor: Record<string, string> = {
      成功: colorHexMap.green,
      失败: colorHexMap.red,
      阻塞: colorHexMap.gold,
      无效: colorHexMap.mediumBlue,
      未执行: colorHexMap.gray,
    };
    const segments = orderKeys.map((k) => {
      const count = Number(passRate?.[k] || 0);
      const color = categoryColor[k] || colorHexMap.default;
      const widthPct = totalCount > 0 ? (count / totalCount) * 100 : 0;
      return { key: k, count, color, widthPct };
    });
    const tooltipContent = (
      <div className={styles.legend}>
        {orderKeys.map((k) => (
          <div key={k} className={styles.legendItem}>
            <span className={styles.legendColor} style={{ backgroundColor: categoryColor[k] || colorHexMap.default }} />
            <span className={styles.legendLabel}>{k}</span>
            <span className={styles.legendCount}>{Number(passRate?.[k] || 0)}</span>
          </div>
        ))}
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
  };

  const renderResult = (result: any) => {
    if (!result || result === "-") return null;
    const colorMap: Record<string, string> = {
      通过: "success",
      不通过: "error",
    };
    const color = colorMap[result] ?? (Enums?.plan_case_result as any)?.[result] ?? "default";
    return <Tag color={color}>{result}</Tag>;
  };

  const handleTableChange: TableProps<TestPlan>["onChange"] = (_pagination, tableFilters) => {
    const selectedStates = (tableFilters?.state as number[] | undefined) || [];
    const newFilters = { ...filters, states: selectedStates.length ? selectedStates.map((v) => Number(v)) : undefined };
    const filtersChanged = JSON.stringify(filters) !== JSON.stringify(newFilters);
    const nextPage = filtersChanged ? 1 : currentPage;
    setCurrentPage(nextPage);
    if (filtersChanged) setFilters(newFilters);
    fetchTestPlans(nextPage, pageSize, filtersChanged ? newFilters : filters);
  };

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<TestPlan | null>(null);
  const openEditModal = (plan: TestPlan) => {
    if (!canEditPlan) return;
    setEditingPlan(plan);
    setShowEditModal(true);
  };
  const handleEditSuccess = async () => {
    return;
  };
  const refreshAll = async () => {
    await fetchTestPlans(currentPage, pageSize, filters, selectedModuleId ?? undefined);
    await fetchModules();
  };
  const prevShowCreateRef = useRef<boolean>(false);
  const prevShowEditRef = useRef<boolean>(false);
  useEffect(() => {
    if (prevShowCreateRef.current && !showCreateModal) {
      refreshAll();
    }
    prevShowCreateRef.current = showCreateModal;
  }, [showCreateModal]);
  useEffect(() => {
    if (prevShowEditRef.current && !showEditModal) {
      refreshAll();
    }
    prevShowEditRef.current = showEditModal;
  }, [showEditModal]);

  const confirmDelete = (plan: TestPlan) => {
    if (!canDeletePlan) return;
    Modal.confirm({
      title: "确认删除",
      content: "确定要删除该测试计划吗？此操作不可撤销。",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await planService.deletePlan(
            workspaceSlug as string,
            Array.isArray(projectId) ? projectId[0] : (projectId as string),
            [plan.id]
          );
          await fetchTestPlans(currentPage, pageSize, filters, selectedModuleId ?? undefined);
          await fetchModules();
        } catch (e: unknown) {
          qaCaseSetToastError(e, t, "删除测试计划失败，请稍后重试");
        }
      },
    });
  };

  const columns: TableProps<TestPlan>["columns"] = [
    {
      title: "计划名称",
      dataIndex: "name",
      key: "name",
      minWidth: 160,
      ...getColumnSearchProps("name"),
      render: (_name: string, record: TestPlan) => (
        <Button
          type="link"
          className="!p-0 !text-primary hover:!text-primary"
          onClick={() => {
            if (!record?.id) return;
            try {
              sessionStorage.setItem("selectedPlanName", record?.name || "");
            } catch {}
            const ws = (workspaceSlug as string) || "";
            const pid = (projectId as string) || "";
            const repoQuery = repositoryId ? `&repositoryId=${encodeURIComponent(String(repositoryId))}` : "";
            router.push(`/${ws}/projects/${pid}/testhub/plan-cases?planId=${record.id}${repoQuery}`);
          }}
        >
          <span className="truncate text-inherit">{record.name}</span>
        </Button>
      ),
    },
    {
      title: "用例数",
      dataIndex: "case_count",
      key: "case_count",
      width: 90,
      render: (case_count: number) => (case_count ? case_count : 0),
    },
    { title: "状态", dataIndex: "state", key: "state", width: 120, render: (state: any) => renderState(state as any) },
    {
      title: "通过率",
      dataIndex: "pass_rate",
      key: "pass_rate",
      width: 180,
      render: (passRate: any, record: TestPlan) => renderPassRate(passRate, record),
    },
    {
      title: "执行结果",
      dataIndex: "result",
      key: "result",
      width: 120,
      render: (result: any) => renderResult(result),
    },
    {
      title: "起止日期",
      key: "date_range",
      width: 220,
      render: (_: unknown, record: TestPlan) => {
        const begin = record.begin_time ? formatDate(record.begin_time) : "-";
        const end = record.end_time ? formatDate(record.end_time) : "-";
        if (!record.begin_time && !record.end_time) return null;
        return `${begin}-${end}`;
      },
    },
    {
      title: "操作",
      key: "actions",
      width: 120,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            aria-label="编辑"
            disabled={!canEditPlan}
            onClick={() => openEditModal(record)}
          />
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            aria-label="删除"
            disabled={!canDeletePlan}
            onClick={() => confirmDelete(record)}
          />
        </Space>
      ),
    },
  ];

  const fetchTestPlans = async (
    page: number = currentPage,
    size: number = pageSize,
    filterParams = filters,
    moduleOverride?: string | null
  ) => {
    if (!workspaceSlug || !projectId) return;
    try {
      setLoading(true);
      setError(null);
      const pid = Array.isArray(projectId) ? projectId[0] : projectId;
      const queryParams: any = { project_id: pid, page: page, page_size: size };
      const moduleParam = typeof moduleOverride !== "undefined" ? moduleOverride : selectedModuleId;
      if (moduleParam) queryParams.module_id = moduleParam;
      if (filterParams.name) queryParams.name__icontains = filterParams.name;
      if (filterParams.states && filterParams.states.length > 0) queryParams.state__in = filterParams.states.join(",");
      const response: TestPlanResponse = await planService.getPlans(workspaceSlug as string, pid, queryParams);
      setTestPlans(response.data || []);
      setTotal(response.count || 0);
      setCurrentPage(page);
      setPageSize(size);
    } catch (err) {
      setError("获取测试计划数据失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handlePaginationChange = (page: number, size?: number) => {
    const newPageSize = size || pageSize;
    const nextPage = newPageSize !== pageSize ? 1 : page;
    fetchTestPlans(nextPage, newPageSize, filters);
  };
  const handlePageSizeChange = (current: number, size: number) => {
    fetchTestPlans(1, size, filters);
  };

  const onExpand: TreeProps["onExpand"] = (keys) => {
    setExpandedKeys(keys as string[]);
    setAutoExpandParent(false);
  };

  const handleAddUnderNode = (parentId: string | "all") => {
    if (!canCreatePlan) return;
    setRenamingModuleId(null);
    setCreatingParentId(parentId);
    setExpandedKeys((prev) => {
      const pid = String(parentId);
      return prev.includes(pid) ? prev : [...prev, pid];
    });
    setAutoExpandParent(true);
  };

  const handleCreateBlurOrEnter = async (parentId: string | "all", inputValue: string) => {
    if (!canCreatePlan) {
      setCreatingParentId(null);
      return;
    }
    const name = inputValue.trim();
    if (!name || !workspaceSlug || !projectId) {
      setCreatingParentId(null);
      return;
    }
    const pid = Array.isArray(projectId) ? projectId[0] : projectId;
    const payload: any = { name, project: pid };
    if (parentId !== "all") payload.parent = parentId;
    try {
      await planService.createPlanModule(workspaceSlug as string, payload);
      setCreatingParentId(null);
      await fetchModules();
      await fetchTestPlans(1, pageSize, filters, selectedModuleId ?? undefined);
    } catch (e) {
      setCreatingParentId(null);
    }
  };

  const startRenameNode = (moduleId: string, currentName: string) => {
    if (!canEditPlan) return;
    setCreatingParentId(null);
    setRenamingModuleId(moduleId);
    setExpandedKeys((prev) => (prev.includes(moduleId) ? prev : [...prev, moduleId]));
    setAutoExpandParent(true);
  };

  const handleRenameBlurOrEnter = async (moduleId: string, inputValue: string) => {
    if (!canEditPlan) {
      setRenamingModuleId(null);
      return;
    }
    const name = inputValue.trim();
    if (!name || !workspaceSlug) {
      setRenamingModuleId(null);
      return;
    }
    try {
      await planService.updatePlanModule(workspaceSlug as string, moduleId, { name });
      setRenamingModuleId(null);
      await fetchModules();
    } catch (e) {
      setRenamingModuleId(null);
    }
  };

  const confirmDeleteModule = (node: PlanModule) => {
    if (!canDeletePlan) return;
    Modal.confirm({
      title: "删除模块",
      content: `确定删除模块“${node.name}”吗？删除后不可恢复。`,
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await planService.deletePlanModule(workspaceSlug as string, [node.id]);
          await fetchModules();
          const shouldClear = selectedModuleId === node.id;
          if (shouldClear) setSelectedModuleId(null);
          await fetchTestPlans(1, pageSize, filters, shouldClear ? null : (selectedModuleId ?? undefined));
        } catch (e) {}
      },
    });
  };

  const renderCreatingInput = (parentId: string | "all") => (
    <ModuleInput placeholder="请输入模块名称" onCommit={(val) => handleCreateBlurOrEnter(parentId, val)} />
  );

  const getNodeCount = (m: any) => {
    const c = m?.total ?? m?.count;
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
          <Button type="text" size="small" disabled={!canCreatePlan} onClick={() => handleAddUnderNode(nodeId)}>
            添加
          </Button>
        ),
      },
      ...(!isDefault
        ? [
            {
              key: "rename",
              label: (
                <Button type="text" size="small" disabled={!canEditPlan} onClick={() => startRenameNode(nodeId, title)}>
                  重命名
                </Button>
              ),
            },
            {
              key: "delete",
              label: (
                <Button
                  type="text"
                  danger
                  size="small"
                  disabled={!canDeletePlan}
                  onClick={() => confirmDeleteModule(node)}
                >
                  删除
                </Button>
              ),
            },
          ]
        : []),
    ];

    return (
      <div className="group flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center text-secondary">
            <FolderOpenDot size={14} />
          </span>
          <span className="text-sm text-primary">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {typeof count === "number" && <span className="text-xs text-secondary">{count}</span>}
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
              className="opacity-0 transition-opacity group-hover:opacity-100"
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

  const filteredModules = useMemo(() => filterModulesByName(modules, searchModule), [modules, searchModule]);

  const findModuleById = (list: PlanModule[], id: string): PlanModule | null => {
    for (const item of list || []) {
      if (String(item.id) === id) return item;
      const child = findModuleById(item.children || [], id);
      if (child) return child;
    }
    return null;
  };

  const hasDescendant = (node: PlanModule, targetId: string): boolean => {
    for (const child of node.children || []) {
      if (String(child.id) === targetId) return true;
      if (hasDescendant(child, targetId)) return true;
    }
    return false;
  };

  const collectAncestorIds = (list: PlanModule[], targetId: string, trail: string[] = []): string[] | null => {
    for (const item of list || []) {
      const id = String(item.id);
      if (id === targetId) return trail;
      const found = collectAncestorIds(item.children || [], targetId, [...trail, id]);
      if (found) return found;
    }
    return null;
  };

  // URL moduleId 对应的树节点在模块加载完成后展开其祖先并保持选中；只处理一次
  const expandedForUrlModuleRef = useRef<string | null>(null);
  useEffect(() => {
    if (!moduleIdFromUrl || modules.length === 0) return;
    if (expandedForUrlModuleRef.current === moduleIdFromUrl) return;
    expandedForUrlModuleRef.current = moduleIdFromUrl;
    const ancestors = collectAncestorIds(modules, moduleIdFromUrl);
    if (!ancestors) {
      // URL 指向的模块已不存在：回退到「全部计划」
      setSelectedModuleId(null);
      fetchTestPlans(1, pageSize, filters, null);
      return;
    }
    setExpandedKeys((prev) => Array.from(new Set([...prev, "all", ...ancestors])));
    setAutoExpandParent(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, moduleIdFromUrl]);

  const treeData = [
    {
      title: (
        <div className="group flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center text-secondary">
              <AppstoreOutlined />
            </span>
            <span className="text-sm font-medium text-primary">全部计划</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-secondary">
              {typeof allTotal === "number" ? allTotal : totalPlansFromModules}
            </span>
            <Dropdown
              trigger={["hover"]}
              menu={{
                items: [
                  {
                    key: "add",
                    label: (
                      <Button
                        type="text"
                        size="small"
                        disabled={!canCreatePlan}
                        onClick={() => handleAddUnderNode("all")}
                      >
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
                className="opacity-0 transition-opacity group-hover:opacity-100"
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
    fetchTestPlans(1, pageSize, filters, nextModuleId);
  };

  const onDrop: TreeProps["onDrop"] = async (info) => {
    if (!canEditPlan) return;
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
      await planService.updatePlanModule(workspaceSlug as string, dragKey, { parent: newParent });
      setExpandedKeys((prev) => {
        if (dropKey === "all" || prev.includes(dropKey)) return prev;
        return [...prev, dropKey];
      });
      await fetchModules();
      await fetchTestPlans(1, pageSize, filters, selectedModuleId ?? undefined);
    } catch (e) {}
  };

  const canViewPlans = permissionsFetched && hasPermission("qa.plan.view");

  return (
    <>
      <PageHead title={`测试计划 - ${decodedRepositoryName}`} />
      {!permissionsFetched ? (
        <div className="flex h-full min-h-[50vh] w-full items-center justify-center">
          <div className="text-secondary">加载中...</div>
        </div>
      ) : !canViewPlans ? (
        <div className="flex h-full min-h-[50vh] w-full flex-col items-center justify-center gap-y-5 text-center">
          <div className="h-44 w-72">
            <img src={UnauthorizedImg} className="h-[176px] w-[288px] object-contain" alt="unauthorized" />
          </div>
          <h1 className="text-xl font-medium text-primary">您没有查看此页面的权限</h1>
        </div>
      ) : (
        <div className="h-full w-full">
          <div className="flex h-full w-full flex-col">
            <div className="flex-1 overflow-hidden p-0">
              <div className="flex h-[calc(100%-0px)] w-full">
                <div
                  className="relative flex h-full max-w-[300px] min-w-[200px] flex-col border-r border-subtle"
                  style={{ width: leftWidth }}
                >
                  <div
                    onMouseDown={onMouseDownResize}
                    className="absolute top-0 right-0 h-full w-2"
                    style={{ cursor: "col-resize", zIndex: 10 }}
                  />
                  <div className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto pt-2">
                    <style
                      dangerouslySetInnerHTML={{
                        __html: `
                    .custom-tree-indent .ant-tree-indent-unit {
                      width: 10px !important;
                    }
                    .custom-tree-indent .ant-tree-switcher {
                      width: 20px !important;
                      margin-inline-end: 0px !important;
                      display: flex !important;
                      align-items: center !important;
                      justify-content: center !important;
                      margin-top: 2px !important;
                    }
                    .custom-tree-indent .ant-tree-node-content-wrapper {
                      padding-inline: 0px !important;
                    }
                  `,
                      }}
                    />
                    <Tree
                      blockNode
                      draggable={canEditPlan}
                      showIcon={false}
                      switcherIcon={(nodeProps) => (
                        <span className="inline-flex h-5 w-5 items-center justify-center text-secondary">
                          <ChevronDownIcon className={`size-4 rotate-0 transition-transform`} strokeWidth={2.5} />
                        </span>
                      )}
                      treeData={treeData as any}
                      selectedKeys={[selectedModuleId ?? "all"]}
                      expandedKeys={expandedKeys}
                      autoExpandParent={autoExpandParent}
                      onExpand={onExpand}
                      onSelect={onSelect}
                      onDrop={onDrop}
                      className="custom-tree-indent testhub-plan-module-tree py-2 pl-2"
                    />
                  </div>
                  <div
                    className="absolute top-0 right-0 h-full w-[6px] cursor-col-resize"
                    onMouseDown={onMouseDownResize}
                  />
                </div>
                <div className="flex-1 overflow-hidden p-0">
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
                  {!loading && !error && (
                    <div className="flex h-full flex-col overflow-hidden">
                      <div
                        className={`${styles.reviewLikeAntTable} testhub-plans-table-scroll relative flex-1 overflow-y-auto [&::-webkit-scrollbar]:block [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--scrollbar-thumb)] [&::-webkit-scrollbar-track]:bg-transparent ${
                          pageSize === 100 ? "testhub-plans-scrollbar-strong" : ""
                        }`}
                      >
                        <Table
                          dataSource={testPlans}
                          columns={columns}
                          loading={loading}
                          rowKey="id"
                          bordered={true}
                          onChange={handleTableChange}
                          pagination={false}
                          scroll={{ x: 1210 }}
                        />
                      </div>
                      <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-4 py-3">
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-secondary">
                            {total > 0
                              ? `第 ${(currentPage - 1) * pageSize + 1}-${Math.min(
                                  currentPage * pageSize,
                                  total
                                )} 条，共 ${total} 条`
                              : ""}
                          </span>
                        </div>
                        <Pagination
                          simple
                          current={currentPage}
                          pageSize={pageSize}
                          total={total}
                          showSizeChanger
                          pageSizeOptions={["10", "20", "50", "100"]}
                          onChange={handlePaginationChange}
                          onShowSizeChange={handlePaginationChange}
                          size="small"
                        />
                      </div>
                    </div>
                  )}
                  <style
                    dangerouslySetInnerHTML={{
                      __html: `
                      .testhub-plans-table-scroll{
                        scrollbar-gutter: stable both-edges;
                      }

                      .testhub-plans-table-scroll .ant-table-thead > tr > th{
                        position: sticky;
                        top: 0;
                        z-index: 5;
                        background: var(--bg-layer-1);
                        font-size: 13px !important;
                        font-weight: 500 !important;
                        color: var(--text-color-secondary) !important;
                      }

                      .testhub-plans-table-scroll.testhub-plans-scrollbar-strong{
                        overflow-y: scroll;
                        scrollbar-width: auto;
                        scrollbar-color: var(--scrollbar-thumb) transparent;
                      }

                      .testhub-plans-table-scroll.testhub-plans-scrollbar-strong::-webkit-scrollbar{
                        width: 12px;
                        height: 12px;
                      }

                      .testhub-plans-table-scroll.testhub-plans-scrollbar-strong::-webkit-scrollbar-thumb{
                        background-color: color-mix(in oklch, var(--scrollbar-thumb) 85%, transparent);
                        border-radius: 999px;
                        border: 3px solid var(--bg-surface-1);
                      }

                      .testhub-plans-table-scroll.testhub-plans-scrollbar-strong::-webkit-scrollbar-track{
                        background: transparent;
                      }

                      .testhub-plans-table-scroll .ant-table-content::-webkit-scrollbar,
                      .testhub-plans-table-scroll .ant-table-body::-webkit-scrollbar {
                        height: 4px;
                        background: transparent;
                      }
                      .testhub-plans-table-scroll .ant-table-content::-webkit-scrollbar-thumb,
                      .testhub-plans-table-scroll .ant-table-body::-webkit-scrollbar-thumb {
                        background-color: transparent;
                        border-radius: 2px;
                        transition: background-color 0.3s ease;
                      }
                      .testhub-plans-table-scroll .ant-table-content::-webkit-scrollbar-track,
                      .testhub-plans-table-scroll .ant-table-body::-webkit-scrollbar-track {
                        background: transparent;
                      }
                      .testhub-plans-table-scroll .ant-table-content:hover::-webkit-scrollbar,
                      .testhub-plans-table-scroll .ant-table-body:hover::-webkit-scrollbar {
                        height: 4px;
                      }
                      .testhub-plans-table-scroll .ant-table-content:hover::-webkit-scrollbar-thumb,
                      .testhub-plans-table-scroll .ant-table-body:hover::-webkit-scrollbar-thumb {
                        background-color: #dddde0;
                      }

                      .testhub-plans-table-scroll .ant-table-content {
                        scrollbar-width: thin;
                        scrollbar-color: transparent transparent;
                      }
                      .testhub-plans-table-scroll .ant-table-content:hover {
                        scrollbar-width: thin;
                        scrollbar-color: #dddde0 transparent;
                      }
                      .testhub-plans-table-scroll .ant-table-body {
                        scrollbar-width: thin;
                        scrollbar-color: transparent transparent;
                      }
                      .testhub-plans-table-scroll .ant-table-body:hover {
                        scrollbar-width: thin;
                        scrollbar-color: #dddde0 transparent;
                      }

                      .testhub-plan-module-tree .ant-tree-draggable-icon{
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
              </div>
            </div>
          </div>
        </div>
      )}

      {canViewPlans && canCreatePlan && (
        <CreateUpdatePlanModal
          isOpen={showCreateModal}
          handleClose={() => {
            setShowCreateModal(false);
            refreshAll();
          }}
          workspaceSlug={workspaceSlug as string}
          projectId={projectId as string}
          repositoryId={String(repositoryId || "")}
          repositoryName={decodedRepositoryName}
          mode="create"
          autoSelectDefaultModule={false}
          initialData={selectedModuleId ? ({ module: selectedModuleId } as any) : null}
          onSuccess={refreshAll}
        />
      )}

      {canViewPlans && canEditPlan && (
        <CreateUpdatePlanModal
          key={editingPlan?.id || "edit"}
          isOpen={showEditModal}
          handleClose={() => {
            setShowEditModal(false);
            setEditingPlan(null);
            refreshAll();
          }}
          workspaceSlug={workspaceSlug as string}
          projectId={projectId as string}
          repositoryId={String(repositoryId || "")}
          repositoryName={decodedRepositoryName}
          mode="edit"
          planId={editingPlan?.id}
          initialData={
            editingPlan
              ? ({
                  ...editingPlan,
                  module:
                    (editingPlan as any)?.module_id ??
                    (editingPlan as any)?.module?.id ??
                    (editingPlan as any)?.module ??
                    null,
                } as any)
              : null
          }
          onSuccess={refreshAll}
        />
      )}
    </>
  );
}
