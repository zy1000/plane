"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef, useMemo } from "react";
import { PageHead } from "@/components/core/page-title";
import { PlanService, type TPlanListRow } from "@/services/qa/plan.service";
import { Input, Button, Dropdown, Modal, Pagination, Tree } from "antd";
import { AppstoreOutlined, EllipsisOutlined } from "@ant-design/icons";
import { FolderOpenDot } from "lucide-react";
import type { TreeProps } from "antd";
import { ChevronDownIcon } from "@plane/propel/icons";
type PlanModule = {
  id: string;
  name: string;
  is_default?: boolean;
  parent?: string | null;
  children?: PlanModule[];
  total?: number;
};
type TestPlan = TPlanListRow;
type TestPlanResponse = { data: TestPlan[]; count: number };
import { CreateUpdatePlanModal } from "@/components/qa/plans/create-update-modal";
import { PlanListTable } from "@/components/qa/plans/plan-list-table";
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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const { registerOpenNewPlanModal, registerPlanSearch, setPlanSearchValue } = useTestHub();
  useEffect(() => {
    registerOpenNewPlanModal(() => {
      if (!canCreatePlan) return;
      setShowCreateModal(true);
    });
  }, [canCreatePlan, registerOpenNewPlanModal]);
  const planService = new PlanService();
  const [leftWidth, setLeftWidth] = useState<number>(220);
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
  const [filters, setFilters] = useState<{ name?: string; states?: string[] }>({});

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
    setFilters(newFilters);
    setPlanSearchValue(trimmedQuery);
    fetchTestPlans(1, pageSize, newFilters, selectedModuleId ?? undefined);
  };

  const openPlan = (plan: TestPlan) => {
    if (!plan?.id) return;
    try {
      sessionStorage.setItem("selectedPlanName", plan?.name || "");
    } catch {}
    const ws = (workspaceSlug as string) || "";
    const pid = (projectId as string) || "";
    const repoQuery = repositoryId ? `&repositoryId=${encodeURIComponent(String(repositoryId))}` : "";
    router.push(`/${ws}/projects/${pid}/testhub/plan-cases?planId=${plan.id}${repoQuery}`);
  };

  useEffect(() => {
    registerPlanSearch(handlePlanSearch);
  }, [handlePlanSearch, registerPlanSearch]);

  useEffect(() => {
    setPlanSearchValue("");
    return () => setPlanSearchValue("");
  }, [setPlanSearchValue]);

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
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                  {error ? (
                    <div className="m-4 rounded-md border border-danger-subtle bg-danger-subtle p-4 text-13 text-danger-primary">
                      {error}
                    </div>
                  ) : (
                    <div
                      className={`testhub-plans-table-scroll relative min-h-0 flex-1 overflow-auto ${
                        pageSize === 100 ? "testhub-plans-scrollbar-strong" : ""
                      }`}
                    >
                      {loading ? (
                        <div className="flex items-center justify-center py-12 text-13 text-secondary">加载中...</div>
                      ) : (
                        <PlanListTable
                          plans={testPlans}
                          canEdit={canEditPlan}
                          canDelete={canDeletePlan}
                          onOpen={openPlan}
                          onEdit={openEditModal}
                          onDelete={confirmDelete}
                        />
                      )}
                    </div>
                  )}
                  <div className="flex shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-5 py-2.5">
                    <span className="text-13 text-secondary tabular-nums">
                      {total > 0
                        ? `第 ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, total)} 条，共 ${total} 条`
                        : ""}
                    </span>
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
                  <style
                    dangerouslySetInnerHTML={{
                      __html: `
                      .testhub-plans-table-scroll{
                        scrollbar-gutter: stable both-edges;
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
                        display: flex;
                        align-items: center;
                        min-height: 32px;
                        padding-inline: 6px !important;
                        border-radius: 6px;
                      }
                      .testhub-plan-module-tree .ant-tree-title {
                        display: block;
                        flex: 1;
                        min-width: 0;
                      }
                      .testhub-plan-module-tree .ant-tree-node-content-wrapper:hover {
                        background: var(--bg-layer-1) !important;
                      }
                      .testhub-plan-module-tree .ant-tree-node-content-wrapper.ant-tree-node-selected,
                      .testhub-plan-module-tree .ant-tree-node-content-wrapper.ant-tree-node-selected:hover {
                        background: var(--bg-accent-subtle) !important;
                        color: var(--text-color-accent-primary) !important;
                      }
                      .testhub-plan-module-tree .ant-tree-node-selected .text-primary,
                      .testhub-plan-module-tree .ant-tree-node-selected .text-secondary {
                        color: inherit !important;
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
                  reviewers: editingPlan.reviewers ?? [],
                  review_approval_type: editingPlan.review_approval_type ?? "all",
                  review_required_count: editingPlan.review_required_count ?? null,
                } as any)
              : null
          }
          onSuccess={refreshAll}
        />
      )}
    </>
  );
}
