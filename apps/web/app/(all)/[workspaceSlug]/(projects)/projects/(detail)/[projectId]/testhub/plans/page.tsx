"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef, useMemo } from "react";
import { PageHead } from "@/components/core/page-title";
import { PlanService } from "@/services/qa/plan.service";
import { Space, Table, Tag, Input, Button, Dropdown, Modal, Tooltip, Pagination } from "antd";
import {
  SearchOutlined,
  PlusOutlined,
  FolderOutlined,
  EllipsisOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
  EditOutlined,
} from "@ant-design/icons";
import type { TableProps, InputRef, TableColumnType } from "antd";
import type { FilterDropdownProps } from "antd/es/table/interface";
import { Avatar, AvatarGroup } from "@plane/ui";
import { getFileURL } from "@plane/utils";
type PlanModule = { id: string; name: string; is_default?: boolean; repository?: string; count?: number };
type TestPlan = {
  id: string;
  name: string;
  begin_time?: string | null;
  end_time?: string | null;
  assignees?: Array<{ id: string; display_name: string; avatar_url?: string | null }>;
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

export default function TestPlanDetailPage() {
  const { workspaceSlug, projectId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const Enums = globalEnums.Enums;
  const repositoryIdFromUrl = searchParams.get("repositoryId");
  const repositoryId =
    repositoryIdFromUrl || (typeof window !== "undefined" ? sessionStorage.getItem("selectedRepositoryId") : null);
  const repositoryName = typeof window !== "undefined" ? sessionStorage.getItem("selectedRepositoryName") : "";
  const decodedRepositoryName = repositoryName || "";

  const [testPlans, setTestPlans] = useState<TestPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [searchedColumn, setSearchedColumn] = useState("");
  const searchInput = useRef<InputRef>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const planService = new PlanService();
  const [leftWidth, setLeftWidth] = useState<number>(300);
  const isDraggingRef = useRef<boolean>(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);
  const [searchModule, setSearchModule] = useState<string>("");
  const [modules, setModules] = useState<PlanModule[]>([]);
  const [creatingOpen, setCreatingOpen] = useState<boolean>(false);
  const [creatingName, setCreatingName] = useState<string>("");
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<{ name?: string; assigneeName?: string; states?: number[] }>({});

  const [allTotal, setAllTotal] = useState<number | undefined>(undefined);
  const [moduleCounts, setModuleCounts] = useState<Record<string, number>>({});
  const totalPlansFromModules = useMemo(() => modules.reduce((sum, m) => sum + (m.count || 0), 0), [modules]);

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

  useEffect(() => {
    if (repositoryId && workspaceSlug) {
      try {
        if (repositoryIdFromUrl) {
          sessionStorage.setItem("selectedRepositoryId", repositoryIdFromUrl);
        }
      } catch {}
      fetchModules();
      fetchTestPlans(1, pageSize);
    }
  }, [repositoryId, workspaceSlug]);

  useEffect(() => {
    if (!repositoryId && workspaceSlug) {
      const ws = String(workspaceSlug || "");
      const pid = String(projectId || "");
      const current = `/${ws}/projects/${pid}/testhub/plans${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
      try {
      } catch {}
      router.push(`/${ws}/projects/${pid}/testhub?redirect_to=${encodeURIComponent(current)}`);
    }
  }, [repositoryId, workspaceSlug, projectId, searchParams, router]);

  const fetchModules = async () => {
    if (!workspaceSlug || !projectId) return;
    try {
      const pid = Array.isArray(projectId) ? projectId[0] : projectId;
      const data: any[] = await planService.getPlanModules(workspaceSlug as string, pid);
      setModules(Array.isArray(data) ? data : []);
      const countsResponse: any = await planService.getPlanModulesCount(workspaceSlug as string, pid);
      const { total: t = 0, ...countsMap } = countsResponse || {};
      setAllTotal(typeof t === "number" ? t : Number(t || 0));
      setModuleCounts(countsMap as Record<string, number>);
    } catch {}
  };

  const getColumnSearchProps = (dataIndex: keyof TestPlan | string): TableColumnType<TestPlan> => ({
    filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters, close }: FilterDropdownProps) => (
      <div style={{ padding: 8 }} onKeyDown={(e) => e.stopPropagation()}>
        <Input
          ref={searchInput}
          placeholder={`搜索 ${dataIndex === "name" ? "名称" : dataIndex === "assignees" ? "负责人名称" : "其他"}`}
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
    filteredValue:
      dataIndex === "name"
        ? filters.name
          ? [filters.name]
          : null
        : dataIndex === "assignees"
          ? filters.assigneeName
            ? [filters.assigneeName]
            : null
          : null,
  });

  const handleSearch = (selectedKeys: string[], dataIndex: keyof TestPlan | string, close?: () => void) => {
    setSearchText(selectedKeys[0]);
    setSearchedColumn(dataIndex);
    const newFilters = { ...filters };
    if (selectedKeys[0]) {
      if (dataIndex === "name") newFilters.name = selectedKeys[0];
      if (dataIndex === "assignees") newFilters.assigneeName = selectedKeys[0];
    } else {
      if (dataIndex === "name") delete newFilters.name;
      if (dataIndex === "assignees") delete newFilters.assigneeName;
    }
    setFilters(newFilters);
    fetchTestPlans(1, pageSize, newFilters);
    close?.();
  };

  const handleReset = (clearFilters: () => void, dataIndex: keyof TestPlan | string) => {
    clearFilters();
    setSearchText("");
    const newFilters = { ...filters };
    if (dataIndex === "name") delete newFilters.name;
    if (dataIndex === "assignees") delete newFilters.assigneeName;
    setFilters(newFilters);
    fetchTestPlans(1, pageSize, newFilters);
  };

  const renderAssignees = (assignees: TestPlan["assignees"]) => {
    if (!assignees || assignees.length === 0) return <span className="text-custom-text-400">-</span>;
    return (
      <AvatarGroup max={3} size="md" showTooltip={true}>
        {assignees.map((assignee) => (
          <Avatar
            key={assignee.id}
            src={getFileURL(assignee.avatar_url ?? "")}
            name={assignee.display_name}
            fallbackText={assignee.display_name}
            size="lg"
            showTooltip={true}
          />
        ))}
      </AvatarGroup>
    );
  };

  const renderState = (state: any) => {
    const color = (Enums?.plan_state as any)?.[state] || "default";
    const text = state ?? "-";
    return <Tag color={color}>{text}</Tag>;
  };

  const renderPassRate = (passRate: any, record: TestPlan) => {
    const orderKeys = ["成功", "失败", "阻塞",'无效', "未执行"];
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

  const renderResult = (result: any) => <span className="text-sm text-custom-text-500">{result ?? "-"}</span>;

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
    Modal.confirm({
      title: "确认删除",
      content: "确定要删除该测试计划吗？此操作不可撤销。",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await planService.deletePlan(workspaceSlug as string, [plan.id]);
          await fetchTestPlans(currentPage, pageSize, filters, selectedModuleId ?? undefined);
          await fetchModules();
        } catch (e: any) {}
      },
    });
  };

  const columns: TableProps<TestPlan>["columns"] = [
    {
      title: "计划名称",
      dataIndex: "name",
      key: "name",
      ...getColumnSearchProps("name"),
      render: (_name: string, record: TestPlan) => (
        <Button
          type="link"
          className="!p-0 !text-custom-text-200 hover:!text-custom-text-100"
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
      width: 140,
      render: (result: any) => renderResult(result),
    },
    { title: "用例数", dataIndex: "case_count", key: "case_count", render: (case_count: number) => (case_count ? case_count : 0) },
    {
      title: "开始日期",
      dataIndex: "begin_time",
      key: "begin_time",
      render: (dateString) => (dateString ? formatDate(dateString) : "-"),
    },
    {
      title: "结束日期",
      dataIndex: "end_time",
      key: "end_time",
      render: (dateString) => (dateString ? formatDate(dateString) : "-"),
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
            icon={<PlayCircleOutlined />}
            aria-label="执行"
            onClick={() => {
              if (!record?.id) return;
              const ws = (workspaceSlug as string) || "";
              const pid = (projectId as string) || "";
              const repoQuery = repositoryId ? `&repositoryId=${encodeURIComponent(String(repositoryId))}` : "";
              router.push(`/${ws}/projects/${pid}/testhub/plan-cases?planId=${record.id}${repoQuery}`);
            }}
          />
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            aria-label="编辑"
            onClick={() => openEditModal(record)}
          />
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            aria-label="删除"
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
      if (filterParams.assigneeName) queryParams.assignee_display_name = filterParams.assigneeName;
      if (filterParams.states && filterParams.states.length > 0) queryParams.state__in = filterParams.states.join(",");
      const response: TestPlanResponse = await planService.getPlans(workspaceSlug as string, queryParams);
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
    fetchTestPlans(page, newPageSize, filters);
  };
  const handlePageSizeChange = (current: number, size: number) => {
    fetchTestPlans(1, size, filters);
  };
  const filteredModules = useMemo(() => {
    const q = searchModule.trim().toLowerCase();
    return modules.filter((n) => (n?.name || "").toLowerCase().includes(q));
  }, [searchModule, modules]);
  const moduleCountsMap = useMemo(() => {
    const map: Record<string, number> = {};
    modules.forEach((m) => {
      if (!m?.id) return;
      const fromApi = moduleCounts[m.id];
      map[m.id] = typeof fromApi === "number" ? fromApi : m.count || 0;
    });
    return map;
  }, [modules, moduleCounts]);
  const confirmDeleteModule = (node: PlanModule) => {
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
  const handleCreateModule = async () => {
    const name = creatingName.trim();
    if (!name || !workspaceSlug || !repositoryId) {
      setCreatingOpen(false);
      setCreatingName("");
      return;
    }
    try {
      await planService.createPlanModule(workspaceSlug as string, { name, project: projectId });
      setCreatingOpen(false);
      setCreatingName("");
      await fetchModules();
      await fetchTestPlans(currentPage, pageSize, filters, selectedModuleId ?? undefined);
    } catch (e) {
      setCreatingOpen(false);
      setCreatingName("");
    }
  };

  return (
    <>
      <PageHead title={`测试计划 - ${decodedRepositoryName}`} />
      <div className="h-full w-full">
        <div className="flex h-full w-full flex-col">
          <div className="flex-1 overflow-hidden p-0">
            <div className="flex h-[calc(100%-0px)] w-full">
              <div
                className="relative flex flex-col h-full border-r border-custom-border-200 min-w-[200px] max-w-[300px]"
                style={{ width: leftWidth }}
              >
                <div
                  onMouseDown={onMouseDownResize}
                  className="absolute right-0 top-0 h-full w-2"
                  style={{ cursor: "col-resize", zIndex: 10 }}
                />
                <div className="p-2 flex-shrink-0">
                  <Space>
                    <Input
                      allowClear
                      placeholder="按模块名称搜索"
                      value={searchModule}
                      onChange={(e) => setSearchModule(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCreateModal(true)}
                      className="text-white bg-custom-primary-100 hover:bg-custom-primary-200 focus:text-custom-brand-40 focus:bg-custom-primary-200 px-3 py-1.5 font-medium text-xs rounded flex items-center gap-1.5 whitespace-nowrap transition-all justify-center"
                    >
                      新建计划
                    </button>
                  </Space>
                </div>
                <div className="flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm">
                  <div
                    className={`${styles.row} flex items-center justify-between px-2 py-2 cursor-pointer ${selectedModuleId === null ? "bg-blue-50" : ""}`}
                    onClick={() => {
                      setSelectedModuleId(null);
                      setCurrentPage(1);
                      fetchTestPlans(1, pageSize, filters, null);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-custom-text-300">
                        <FolderOutlined />
                      </span>
                      <span className="text-sm">全部计划</span>
                    </div>
                    <div className="flex items-center gap-2 w-[140px] justify-end">
                      <span className="text-xs text-custom-text-300">
                        {typeof allTotal === "number" ? allTotal : totalPlansFromModules}
                      </span>
                      <span className={styles.actionIcon} onClick={() => setCreatingOpen(true)}>
                        <PlusOutlined />
                      </span>
                    </div>
                  </div>
                  {creatingOpen && (
                    <div className="px-2 py-2">
                      <Input
                        size="small"
                        autoFocus
                        placeholder="请输入模块名称"
                        value={creatingName}
                        onChange={(e) => setCreatingName(e.target.value)}
                        onBlur={handleCreateModule}
                        onPressEnter={handleCreateModule}
                      />
                    </div>
                  )}
                  <div>
                    {filteredModules.map((node) => (
                      <div
                        key={node.id}
                        className={`${styles.row} flex items-center justify-between px-2 py-2 cursor-pointer ${selectedModuleId === node.id ? "bg-blue-50" : ""}`}
                        style={{ paddingLeft: 20 }}
                        onClick={() => {
                          const nextId = node.id;
                          setSelectedModuleId(nextId);
                          setCurrentPage(1);
                          fetchTestPlans(1, pageSize, filters, nextId);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-custom-text-300">
                            <FolderOutlined />
                          </span>
                          <span className="text-sm">{node.name}</span>
                        </div>
                        <div className="flex items-center gap-2 w-[140px] justify-end">
                          {typeof moduleCountsMap[node.id] === "number" && (
                            <span className="text-xs text-custom-text-300">{moduleCountsMap[node.id]}</span>
                          )}
                          {!node.is_default ? (
                            <Dropdown
                              trigger={["hover"]}
                              menu={{
                                items: [
                                  {
                                    key: "delete",
                                    label: (
                                      <Button
                                        type="text"
                                        size="small"
                                        danger
                                        icon={<DeleteOutlined />}
                                        onClick={() => confirmDeleteModule(node)}
                                        className="!text-red-600 hover:!bg-red-50"
                                      >
                                        删除
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
                                className={styles.actionMenu}
                              />
                            </Dropdown>
                          ) : (
                            <span className="w-6 inline-flex items-center justify-center" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  className="absolute top-0 right-0 w-[6px] h-full cursor-col-resize"
                  onMouseDown={onMouseDownResize}
                />
              </div>
              <div className="flex-1 overflow-hidden p-0">
                {loading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-custom-text-300">加载中...</div>
                  </div>
                )}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
                    <div className="text-red-800 text-sm">{error}</div>
                  </div>
                )}
                {!repositoryId && !loading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-custom-text-300">未找到用例库ID，请重新选择用例库</div>
                  </div>
                )}
                {repositoryId && !loading && !error && (
                  <div className="flex flex-col h-full overflow-hidden">
                    <div
                      className={`testhub-plans-table-scroll flex-1 relative overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:block [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[rgb(var(--color-scrollbar))] [&::-webkit-scrollbar-thumb]:rounded-full ${
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
                      />
                    </div>
                    <div className="flex-shrink-0 border-t border-custom-border-200 px-4 py-3 bg-custom-background-100 flex items-center justify-between">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-custom-text-300">
                          {total > 0
                            ? `第 ${(currentPage - 1) * pageSize + 1}-${Math.min(
                                currentPage * pageSize,
                                total
                              )} 条，共 ${total} 条`
                            : ""}
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
                        background: rgb(var(--color-background-100));
                      }

                      .testhub-plans-table-scroll.testhub-plans-scrollbar-strong{
                        overflow-y: scroll;
                        scrollbar-width: auto;
                        scrollbar-color: rgb(var(--color-scrollbar)) transparent;
                      }

                      .testhub-plans-table-scroll.testhub-plans-scrollbar-strong::-webkit-scrollbar{
                        width: 12px;
                        height: 12px;
                      }

                      .testhub-plans-table-scroll.testhub-plans-scrollbar-strong::-webkit-scrollbar-thumb{
                        background-color: rgba(var(--color-scrollbar), 0.85);
                        border-radius: 999px;
                        border: 3px solid rgba(var(--color-background-100), 1);
                      }

                      .testhub-plans-table-scroll.testhub-plans-scrollbar-strong::-webkit-scrollbar-track{
                        background: transparent;
                      }
                    `,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <CreateUpdatePlanModal
        isOpen={showCreateModal}
        handleClose={() => {
          setShowCreateModal(false);
          refreshAll();
        }}
        workspaceSlug={workspaceSlug as string}
        projectId={projectId as string}
        repositoryId={repositoryId as string}
        repositoryName={decodedRepositoryName}
        mode="create"
        onSuccess={refreshAll}
      />

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
        repositoryId={repositoryId as string}
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
    </>
  );
}
