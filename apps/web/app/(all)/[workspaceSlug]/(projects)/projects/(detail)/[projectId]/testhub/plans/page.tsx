"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useRef, useMemo } from "react";
import { PageHead } from "@/components/core/page-title";
import { PlanService, type TPlanListRow } from "@/services/qa/plan.service";
import { Modal, Pagination } from "antd";
import { FolderPlus, Pencil, Trash2 } from "lucide-react";
import {
  MODULE_TREE_ROOT_KEY,
  ModuleTreePanel,
  type TModuleTreeDropEvent,
  type TModuleTreeEditing,
  type TModuleTreeMenuItem,
  type TModuleTreeNode,
} from "@/components/qa/module-tree";
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
  const [modules, setModules] = useState<PlanModule[]>([]);
  // 树的行内编辑态（新建 / 重命名），同一时间只有一个
  const [editing, setEditing] = useState<TModuleTreeEditing>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
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

  const handleAddUnderNode = (parentId: string) => {
    if (!canCreatePlan) return;
    setEditing({ kind: "create", parentKey: parentId });
    if (parentId !== MODULE_TREE_ROOT_KEY)
      setExpandedKeys((prev) => (prev.includes(parentId) ? prev : [...prev, parentId]));
  };

  const handleCreateCommit = async (parentId: string, inputValue: string) => {
    setEditing(null);
    if (!canCreatePlan) return;
    const name = inputValue.trim();
    if (!name || !workspaceSlug || !projectId) return;
    const pid = Array.isArray(projectId) ? projectId[0] : projectId;
    const payload: any = { name, project: pid };
    if (parentId !== MODULE_TREE_ROOT_KEY) payload.parent = parentId;
    try {
      await planService.createPlanModule(workspaceSlug as string, payload);
      await fetchModules();
      await fetchTestPlans(1, pageSize, filters, selectedModuleId ?? undefined);
    } catch (e) {
      qaCaseSetToastError(e, t, "创建模块失败");
    }
  };

  const startRenameNode = (moduleId: string, currentName: string) => {
    if (!canEditPlan) return;
    setEditing({ kind: "rename", key: moduleId, initialValue: currentName });
  };

  const handleRenameCommit = async (moduleId: string, inputValue: string) => {
    setEditing(null);
    if (!canEditPlan) return;
    const name = inputValue.trim();
    if (!name || !workspaceSlug) return;
    try {
      await planService.updatePlanModule(workspaceSlug as string, moduleId, { name });
      await fetchModules();
    } catch (e) {
      qaCaseSetToastError(e, t, "重命名失败");
    }
  };

  const handleEditCommit = (value: string) => {
    if (!editing) return;
    if (editing.kind === "create") void handleCreateCommit(editing.parentKey, value);
    else void handleRenameCommit(editing.key, value);
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

  const getNodeCount = (m: any) => {
    const c = m?.total ?? m?.count;
    return typeof c === "number" ? c : undefined;
  };

  const treeNodes = useMemo<TModuleTreeNode[]>(() => {
    const build = (list: PlanModule[]): TModuleTreeNode[] =>
      (list || []).map((m) => ({
        key: String(m.id),
        label: String(m.name || "-"),
        count: getNodeCount(m),
        children: build(m.children || []),
      }));
    return build(modules);
  }, [modules]);

  const getMenuItems = (node: TModuleTreeNode): TModuleTreeMenuItem[] => {
    const module = findModuleById(modules, node.key);
    if (!module) return [];
    const items: TModuleTreeMenuItem[] = [
      {
        key: "add",
        label: "添加子模块",
        icon: <FolderPlus className="size-3.5" strokeWidth={1.75} />,
        disabled: !canCreatePlan,
        onClick: () => handleAddUnderNode(node.key),
      },
    ];
    if (!module.is_default) {
      items.push(
        {
          key: "rename",
          label: "重命名",
          icon: <Pencil className="size-3.5" strokeWidth={1.75} />,
          disabled: !canEditPlan,
          onClick: () => startRenameNode(node.key, node.label),
        },
        {
          key: "delete",
          label: "删除",
          icon: <Trash2 className="size-3.5" strokeWidth={1.75} />,
          danger: true,
          disabled: !canDeletePlan,
          onClick: () => confirmDeleteModule(module),
        }
      );
    }
    return items;
  };

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
    setExpandedKeys((prev) => Array.from(new Set([...prev, ...ancestors])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules, moduleIdFromUrl]);

  const handleTreeSelect = (key: string) => {
    const nextModuleId = key === MODULE_TREE_ROOT_KEY ? null : key;
    if (nextModuleId === selectedModuleId) return;
    setSelectedModuleId(nextModuleId);
    setCurrentPage(1);
    fetchModules();
    fetchTestPlans(1, pageSize, filters, nextModuleId);
  };

  // 计划模块树只支持换父级：拖到节点上成为其子模块，拖到「全部计划」上回到一级
  const handleTreeDrop = async ({ dragKey, targetKey, position }: TModuleTreeDropEvent) => {
    if (!canEditPlan || !workspaceSlug || position !== "into") return;
    const dragModule = findModuleById(modules, dragKey);
    if (!dragModule) return;
    if (targetKey !== MODULE_TREE_ROOT_KEY && hasDescendant(dragModule, targetKey)) return;
    const newParent = targetKey === MODULE_TREE_ROOT_KEY ? null : targetKey;
    try {
      await planService.updatePlanModule(workspaceSlug as string, dragKey, { parent: newParent });
      if (newParent) setExpandedKeys((prev) => (prev.includes(newParent) ? prev : [...prev, newParent]));
      await fetchModules();
      await fetchTestPlans(1, pageSize, filters, selectedModuleId ?? undefined);
    } catch (e) {
      qaCaseSetToastError(e, t, "移动模块失败");
    }
  };

  const selectedModuleName = selectedModuleId ? findModuleById(modules, selectedModuleId)?.name : undefined;

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
                <ModuleTreePanel
                  root={{ label: "全部计划", count: typeof allTotal === "number" ? allTotal : totalPlansFromModules }}
                  nodes={treeNodes}
                  selectedKey={selectedModuleId ?? MODULE_TREE_ROOT_KEY}
                  onSelect={handleTreeSelect}
                  expandedKeys={expandedKeys}
                  onExpandedKeysChange={setExpandedKeys}
                  editing={editing}
                  onEditCommit={handleEditCommit}
                  onEditCancel={() => setEditing(null)}
                  getMenuItems={getMenuItems}
                  dragMode={canEditPlan ? "reparent" : "none"}
                  onDrop={handleTreeDrop}
                  onAddRoot={canCreatePlan ? () => handleAddUnderNode(MODULE_TREE_ROOT_KEY) : undefined}
                  railLabel={selectedModuleName || "全部计划"}
                />
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
