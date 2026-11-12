"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Tree, Table, Tooltip, Input, Pagination } from "antd";
import type { TreeProps } from "antd";
import type { TableProps } from "antd";
import { Layers, Plus, Search, X } from "lucide-react";
import { ModalCore, EModalPosition, EModalWidth } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { CreateCaseModal } from "@/components/qa/cases/create-modal";
import { RepositoryService } from "@/services/qa";
import { CaseService } from "@/services/qa/case.service";
import { PlanService } from "@/services/qa/plan.service";
import { useTranslation } from "@plane/i18n";
import { qaCaseErrorContent, qaCaseSetToastError, qaCaseSetToastSuccess, qaCaseSetToastWarning } from "@/utils/qa-case-error";
import {
  MODULE_TREE_SKIN_CLASS,
  ModuleTreeSkinStyles,
  moduleTreeSwitcherIcon,
} from "@/components/qa/module-tree";
import { CASE_PICKER_MODAL_CLASS, CasePickerModalStyles, CaseTreeNodeTitle } from "../shared/case-picker-modal-styles";
import { globalEnums } from "@/components/qa/shared/testhub/util";
import {
  LinkedProductLoadError,
  LinkedProductSelect,
  NoLinkedProductHint,
  useLinkedProductFilter,
} from "../shared/linked-product-select";
import { PlanCasePriorityBadge } from "./plan-case-priority-badge";

type TLabel = { id?: string; name?: string } | string;
type TestCase = {
  id: string;
  code?: string;
  name: string;
  remark?: string;
  state?: number;
  type?: number;
  priority?: number;
  created_at?: string;
  updated_at?: string;
  repository?: string;
  labels?: TLabel[];
  module?: { id?: string; name?: string } | string | null;
};
type TRepositoryOption = { id: string; name: string };
/** 新建用例落到哪个库 / 目录 */
type TCreateTarget = { repositoryId: string; repositoryName: string; moduleId: string | null };
type TestCaseResponse = { count: number; data: TestCase[] };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId?: string;
  repositoryId: string;
  repositoryName?: string;
  planId?: string;
  /** 计划的产品：打开时默认看这个产品的用例 */
  defaultProductId?: string | null;
  initialSelectedCaseIds?: string[];
  onClosed?: () => void;
};

export const PlanCasesModal: React.FC<Props> = ({
  isOpen,
  onClose,
  workspaceSlug,
  projectId,
  planId,
  defaultProductId,
  initialSelectedCaseIds,
  onClosed,
}) => {
  const { t } = useTranslation();
  const caseService = useRef(new CaseService()).current;
  const planService = useRef(new PlanService()).current;
  const repositoryService = useRef(new RepositoryService()).current;
  // 用例归产品：只能从项目已关联的产品里选，一次看一个产品（选中的用例跨产品保留）
  const {
    links: linkedProducts,
    error: linkedProductsError,
    hasNoLinkedProduct,
    productId,
    setProductId,
  } = useLinkedProductFilter(isOpen ? workspaceSlug : undefined, projectId, defaultProductId);

  const [planTree, setPlanTree] = useState<any | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState<boolean>(true);
  const [selectedTreeKey, setSelectedTreeKey] = useState<string>("root");
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

  const [cases, setCases] = useState<TestCase[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [existingIds, setExistingIds] = useState<string[]>([]);
  const [selectedNewIds, setSelectedNewIds] = useState<string[]>([]);
  const [selectedAssignee, setSelectedAssignee] = useState<string | null>(null);
  const [checkedTreeKeys, setCheckedTreeKeys] = useState<string[]>([]);
  const nodeCaseIdsCacheRef = useRef<Record<string, string[]>>({});
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [searchName, setSearchName] = useState<string>("");

  const caseTypeLabelMap = useMemo(
    () =>
      Object.fromEntries(
        Object.entries((globalEnums.Enums as any)?.case_type || {}).map(([value, label]) => [String(value), String(label)])
      ),
    []
  );

  // 就地新建用例：规划时发现缺用例，不用离开弹窗去产品里建
  const [productRepositories, setProductRepositories] = useState<TRepositoryOption[]>([]);
  const [createTarget, setCreateTarget] = useState<TCreateTarget | null>(null);
  /** 本次打开期间在这里新建的用例：排在列表最前、带「新建」标记，并自动勾选 */
  const [createdCases, setCreatedCases] = useState<{ productId: string; row: TestCase }[]>([]);

  const [leftWidth, setLeftWidth] = useState<number>(280);
  const isDraggingRef = useRef<boolean>(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  const onMouseDownResize = (e: any) => {
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = leftWidth;
    window.addEventListener("mousemove", onMouseMoveResize as any);
    window.addEventListener("mouseup", onMouseUpResize as any);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    if (e && typeof e.preventDefault === "function") e.preventDefault();
  };
  const onMouseMoveResize = (e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    const delta = e.clientX - startXRef.current;
    const next = Math.min(320, Math.max(200, startWidthRef.current + delta));
    setLeftWidth(next);
  };
  const onMouseUpResize = () => {
    isDraggingRef.current = false;
    window.removeEventListener("mousemove", onMouseMoveResize as any);
    window.removeEventListener("mouseup", onMouseUpResize as any);
    document.body.style.cursor = "auto";
    document.body.style.userSelect = "auto";
  };

  const clearSearchDebounce = () => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
  };

  useEffect(() => {
    const init = Array.isArray(initialSelectedCaseIds) ? initialSelectedCaseIds.filter(Boolean) : [];
    setExistingIds(init);
    setSelectedNewIds([]);
    setCheckedTreeKeys([]);
    nodeCaseIdsCacheRef.current = {};
    clearSearchDebounce();
    setSearchName("");
    setSelectedTreeKey("root");
    setSelectedRepositoryId(null);
    setSelectedModuleId(null);
    setSelectedAssignee(null);
    setCreateTarget(null);
    setCreatedCases([]);
  }, [isOpen]);

  // 切产品：树与列表都换成该产品的用例；已勾选的用例保留
  useEffect(() => {
    nodeCaseIdsCacheRef.current = {};
    setCheckedTreeKeys([]);
    setSelectedTreeKey("root");
    setSelectedRepositoryId(null);
    setSelectedModuleId(null);
    setProductRepositories([]);
    if (!isOpen || !workspaceSlug || !planId || !productId) {
      setPlanTree(null);
      setCases([]);
      setTotal(0);
      return;
    }
    fetchPlanTree();
    fetchCases(1, undefined, undefined);
    fetchProductRepositories(productId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, productId]);

  useEffect(() => () => {
    clearSearchDebounce();
  }, []);

  const getTreeNodeKey = (node: any): string => {
    const kind = String(node?.kind || "");
    const id = String(node?.id || "");
    const repositoryId = node?.repository_id ? String(node.repository_id) : null;

    if (kind === "root") return "root";
    if (kind === "repository") return `repo:${id}`;
    if (kind === "repository_modules_all") return `repo:${repositoryId}:all_modules`;
    if (kind === "module") return `module:${id}`;
    return id;
  };

  const collectFirstLevelExpandedKeys = (node: any): string[] => {
    if (!node) return [];
    return [getTreeNodeKey(node)];
  };

  const fetchPlanTree = async (keepExpanded = false) => {
    if (!workspaceSlug || !planId) return;
    try {
      if (!productId) return;
      const data = await caseService.getPlanUnassociatedCaseTree(String(workspaceSlug), {
        plan_id: String(planId),
        product_id: productId,
      });
      setPlanTree(data || null);
      // 新建用例后只是刷新计数，不动用户已展开的目录
      if (keepExpanded) return;
      setExpandedKeys(data ? collectFirstLevelExpandedKeys(data) : []);
      setAutoExpandParent(true);
    } catch {
      setPlanTree(null);
    }
  };

  const fetchProductRepositories = async (targetProductId: string) => {
    try {
      const resp = await repositoryService.getRepositories(String(workspaceSlug), {
        product_id: targetProductId,
        page_size: 100,
      });
      const rows: any[] = Array.isArray(resp?.data) ? resp.data : [];
      setProductRepositories(rows.map((row) => ({ id: String(row.id), name: String(row.name ?? "") })));
    } catch {
      setProductRepositories([]);
    }
  };

  const handleOpenCreate = () => {
    // 新用例建到左侧选中的库 / 目录下；没选时产品只有一个库就用它
    const repository =
      productRepositories.find((item) => item.id === selectedRepositoryId) ??
      (productRepositories.length === 1 ? productRepositories[0] : undefined);
    if (!repository) {
      qaCaseSetToastWarning(productRepositories.length === 0 ? "该产品暂无用例库" : "请先在左侧选择用例库或目录");
      return;
    }
    setCreateTarget({
      repositoryId: repository.id,
      repositoryName: repository.name,
      moduleId: selectedRepositoryId === repository.id ? selectedModuleId : null,
    });
  };

  const handleCaseCreated = (created?: any) => {
    const createdCase = created?.case ?? created;
    if (createdCase?.id && productId) {
      const id = String(createdCase.id);
      setCreatedCases((prev) => [
        { productId, row: { ...createdCase, id } },
        ...prev.filter((item) => item.row.id !== id),
      ]);
      setSelectedNewIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
    // 目录计数、各节点下的用例 id、列表总数都变了
    nodeCaseIdsCacheRef.current = {};
    fetchPlanTree(true);
    const keyword = searchName.trim();
    if (keyword) fetchCases(currentPage, undefined, undefined, keyword);
    else fetchCases(currentPage, selectedRepositoryId || undefined, selectedModuleId || undefined);
  };

  const fetchCases = async (
    page: number,
    repoId?: string,
    moduleId?: string,
    name?: string,
    pageSizeArg: number = pageSize
  ) => {
    try {
      if (!planId || !productId) return;
      setLoading(true);
      setError(null);
      const params: any = {
        plan_id: String(planId || ""),
        product_id: productId,
        page,
        page_size: pageSizeArg,
      };
      const keyword = name?.trim();
      if (keyword) {
        params.name__icontains = keyword;
      } else {
        if (repoId) params.repository_id = repoId;
        if (moduleId) params.module_id = moduleId;
      }
      const response: TestCaseResponse = await caseService.getPlanUnassociatedCases(String(workspaceSlug), params);
      setCases(response?.data || []);
      setTotal(response?.count || 0);
      setCurrentPage(page);
      setPageSize(pageSizeArg);
    } catch (e: unknown) {
      const fallback = "用例加载失败";
      setError(qaCaseErrorContent(e, t, fallback));
      qaCaseSetToastError(e, t, fallback);
    } finally {
      setLoading(false);
    }
  };

  const handlePaginationChange = (page: number, size?: number) => {
    const nextSize = size || pageSize;
    const nextPage = nextSize !== pageSize ? 1 : page;
    const keyword = searchName.trim();
    if (keyword) {
      fetchCases(nextPage, undefined, undefined, keyword, nextSize);
      return;
    }
    fetchCases(nextPage, selectedRepositoryId || undefined, selectedModuleId || undefined, undefined, nextSize);
  };

  const onSelect: TreeProps["onSelect"] = (selectedKeys, info) => {
    clearSearchDebounce();
    setSearchName("");
    const key = Array.isArray(selectedKeys) && selectedKeys.length > 0 ? String(selectedKeys[0]) : "root";
    setSelectedTreeKey(key);

    const node: any = (info as any)?.node || {};
    const kind = node?.kind as string | undefined;

    if (!kind || kind === "root") {
      setSelectedRepositoryId(null);
      setSelectedModuleId(null);
      fetchCases(1, undefined, undefined);
      return;
    }

    if (kind === "repository" || kind === "repository_modules_all") {
      const repoId = node?.repositoryId ? String(node.repositoryId) : null;
      setSelectedRepositoryId(repoId);
      setSelectedModuleId(null);
      fetchCases(1, repoId || undefined, undefined);
      return;
    }

    if (kind === "module") {
      const repoId = node?.repositoryId ? String(node.repositoryId) : null;
      const moduleId = node?.moduleId ? String(node.moduleId) : null;
      setSelectedRepositoryId(repoId);
      setSelectedModuleId(moduleId);
      fetchCases(1, repoId || undefined, moduleId || undefined);
    }
  };

  const handleSearchNameChange = (value: string) => {
    setSearchName(value);
    clearSearchDebounce();
    searchDebounceRef.current = setTimeout(() => {
      const keyword = value.trim();
      if (keyword) {
        fetchCases(1, undefined, undefined, keyword);
        return;
      }
      fetchCases(1, selectedRepositoryId || undefined, selectedModuleId || undefined);
    }, 300);
  };

  const onExpand: TreeProps["onExpand"] = (keys) => {
    setExpandedKeys(keys as string[]);
    setAutoExpandParent(false);
  };

  const getNodeUnassociatedCaseIds = async (node: any): Promise<string[]> => {
    if (!workspaceSlug || !planId) return [];
    const kind = node?.kind as string | undefined;
    const cacheKey = String(node?.key || "");
    if (cacheKey && nodeCaseIdsCacheRef.current[cacheKey]) return nodeCaseIdsCacheRef.current[cacheKey];

    const params: any = { plan_id: String(planId), product_id: productId ?? undefined };
    if (kind === "repository" || kind === "repository_modules_all" || kind === "module") {
      if (node?.repositoryId) params.repository_id = String(node.repositoryId);
    }
    if (kind === "module" && node?.moduleId) params.module_id = String(node.moduleId);

    const res = await caseService.getPlanUnassociatedCaseIds(String(workspaceSlug), params);
    const ids = Array.isArray(res?.data) ? res.data : [];
    if (cacheKey) nodeCaseIdsCacheRef.current[cacheKey] = ids;
    return ids;
  };

  const onCheck: TreeProps["onCheck"] = async (checkedKeys, info: any) => {
    // @ts-ignore
    const nextChecked = Array.isArray(checkedKeys) ? (checkedKeys as string[]) : (checkedKeys?.checked as string[]);
    setCheckedTreeKeys(nextChecked || []);

    const node = info?.node;
    const checked = Boolean(info?.checked);
    if (!node) return;
    

    try {
      const ids = await getNodeUnassociatedCaseIds(node);
      setSelectedNewIds((prev) => {
        const prevSet = new Set(prev || []);
        if (checked) {
          for (const id of ids) prevSet.add(String(id));
          return Array.from(prevSet);
        }
        for (const id of ids) prevSet.delete(String(id));
        return Array.from(prevSet);
      });
    } catch {}
  };

  const syncTreeCheckState = (newSelectedIds: string[]) => {
    const selectedSet = new Set(newSelectedIds);
    const nextTreeKeys = checkedTreeKeys.filter((key) => {
      const cachedIds = nodeCaseIdsCacheRef.current[key];
      // 如果没有缓存，我们假设它仍然被选中（无法验证）
      if (!cachedIds) return true;
      // 如果缓存的所有 ID 都在当前选中列表中，则保留选中状态
      const allSelected = cachedIds.every((id) => selectedSet.has(id));
      return allSelected;
    });

    if (nextTreeKeys.length !== checkedTreeKeys.length) {
      setCheckedTreeKeys(nextTreeKeys);
    }
  };

  const buildTreeNode = (node: any): any => {
    const kind = String(node?.kind || "");
    const id = String(node?.id || "");
    const repositoryId = node?.repository_id ? String(node.repository_id) : null;
    const count = typeof node?.count === "number" ? node.count : undefined;

    const key = getTreeNodeKey({ kind, id, repository_id: repositoryId });

    const children = Array.isArray(node?.children) ? node.children : [];
    return {
      title: <CaseTreeNodeTitle kind={kind} name={String(node?.name ?? "-")} count={count} />,
      key,
      kind,
      repositoryId,
      moduleId: kind === "module" ? id : null,
      children: children.map((c: any) => buildTreeNode(c)),
    };
  };

  const treeData = useMemo(() => {
    if (!planTree) return [];
    return [buildTreeNode(planTree)];
  }, [planTree]);

  /** 刚建的用例接口只回模块 id 时，从目录树里找名字 */
  const moduleNameById = (moduleId: string): string => {
    const walk = (node: any): string | null => {
      if (!node) return null;
      if (String(node.kind) === "module" && String(node.id) === moduleId) return String(node.name ?? "");
      for (const child of Array.isArray(node.children) ? node.children : []) {
        const found = walk(child);
        if (found !== null) return found;
      }
      return null;
    };
    return walk(planTree) ?? "";
  };

  const columns: TableProps<TestCase>["columns"] = [
    {
      title: "编号",
      dataIndex: "code",
      key: "code",
      width: 140,
      ellipsis: true,
      render: (v?: string) => <span className="text-secondary tabular-nums">{v || ""}</span>,
    },
    {
      title: "用例名称",
      dataIndex: "name",
      key: "name",
      ellipsis: { showTitle: false },
      render: (v: string | undefined, record: TestCase) => {
        const value = v ?? "";
        return (
          <div className="flex min-w-0 items-center gap-2">
            <Tooltip title={value}>
              <div className="truncate text-primary">{value}</div>
            </Tooltip>
            {createdIdSet.has(record.id) && (
              <span className="shrink-0 rounded bg-accent-subtle px-1.5 py-px text-12 font-medium text-accent-primary">
                新建
              </span>
            )}
          </div>
        );
      },
    },
    {
      title: "模块",
      dataIndex: "module",
      key: "module",
      width: 130,
      ellipsis: true,
      render: (v: any) => (
        <span className="text-secondary">{v && v.name ? v.name : typeof v === "string" ? moduleNameById(v) : ""}</span>
      ),
    },
    {
      title: "类型",
      dataIndex: "type",
      width: 110,
      key: "type",
      render: (v: number | null) =>
        v === null || v === undefined ? null : (
          <span className="text-secondary">{caseTypeLabelMap[String(v)] ?? ""}</span>
        ),
    },
    {
      title: "优先级",
      dataIndex: "priority",
      width: 90,
      key: "priority",
      render: (v: number) => <PlanCasePriorityBadge value={v} />,
    },
  ];

  const createdRows = useMemo(
    () => createdCases.filter((item) => item.productId === productId).map((item) => item.row),
    [createdCases, productId]
  );
  const createdIdSet = useMemo(() => new Set(createdRows.map((row) => row.id)), [createdRows]);
  const tableRows = useMemo(
    () => (createdRows.length > 0 ? [...createdRows, ...cases.filter((row) => !createdIdSet.has(row.id))] : cases),
    [createdRows, createdIdSet, cases]
  );

  const closeModal = () => {
    onClose();
    onClosed && onClosed();
  };

  const selectedCount = selectedNewIds.length;

  const handleConfirm = async () => {
    if (!workspaceSlug || !planId) {
      qaCaseSetToastWarning("缺少必要参数：workspace或计划ID");
      return;
    }
    try {
      if (!selectedNewIds || selectedNewIds.length === 0) {
        qaCaseSetToastWarning("请先选择要关联的用例");
        return;
      }
      if (!selectedAssignee) {
        qaCaseSetToastWarning("请选择执行人");
        return;
      }
      setSaving(true);
      await planService.addPlanCases(String(workspaceSlug), String(projectId || ""), {
        plan_id: String(planId),
        case_ids: selectedNewIds.map(String),
        assignee: selectedAssignee,
      });
      qaCaseSetToastSuccess("用例关联已更新");
      closeModal();
    } catch (e: unknown) {
      qaCaseSetToastError(e, t, "用例关联失败");
    } finally {
      setSaving(false);
    }
  };

  // 新建表单打开时先收起本弹窗（两层弹窗叠着会被这层的焦点锁住），建完再回来，已选和筛选都还在
  const picker = (
    <ModalCore
      isOpen={isOpen && !createTarget}
      handleClose={closeModal}
      position={EModalPosition.CENTER}
      width={EModalWidth.VIIXL}
    >
      <div className={`${CASE_PICKER_MODAL_CLASS} flex w-full flex-col text-sm text-primary`}>
        <CasePickerModalStyles />
        <ModuleTreeSkinStyles />

        {/* Header */}
        <div className="flex items-center gap-3.5 border-b border-subtle px-6 pt-5 pb-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-accent-subtle bg-accent-subtle text-accent-primary">
            <Plus className="size-[18px]" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base leading-tight font-semibold text-primary">规划用例</h3>
          </div>
          <button
            type="button"
            onClick={closeModal}
            aria-label="关闭"
            className="-mt-0.5 -mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-layer-1-hover hover:text-secondary"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="h-[82vh]">
          <div className="flex h-full overflow-hidden">
            {/* Left: tree */}
            <div
              className="relative flex flex-col bg-layer-1/40"
              style={{ width: leftWidth, minWidth: 200, maxWidth: 320 }}
            >
              <div className="flex flex-col gap-2 px-3 pb-1.5 pt-3">
                {linkedProducts.length > 0 && (
                  <LinkedProductSelect
                    className="w-full"
                    links={linkedProducts}
                    value={productId}
                    onChange={setProductId}
                  />
                )}
                <span className="text-xs font-medium text-tertiary">用例目录</span>
              </div>
              <div className="tree-scroll flex-1 min-h-0 px-1.5 pb-3">
                <Tree
                  showLine={false}
                  checkable
                  switcherIcon={moduleTreeSwitcherIcon}
                  onSelect={onSelect}
                  onCheck={onCheck}
                  onExpand={onExpand}
                  expandedKeys={expandedKeys}
                  autoExpandParent={autoExpandParent}
                  treeData={treeData}
                  selectedKeys={treeData.length > 0 ? [selectedTreeKey] : []}
                  checkedKeys={checkedTreeKeys}
                  className={MODULE_TREE_SKIN_CLASS}
                />
              </div>
              <div
                onMouseDown={onMouseDownResize}
                className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize border-r border-subtle transition-colors hover:border-accent-strong hover:bg-accent-subtle"
              />
            </div>

            {/* Right: search + table */}
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex flex-nowrap items-center justify-between gap-3 border-b border-subtle px-4 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <Input
                    placeholder="搜索编号或名称"
                    allowClear
                    prefix={<Search className="size-4" />}
                    value={searchName}
                    onChange={(e) => handleSearchNameChange(e.target.value)}
                    style={{ width: 240, flex: "none" }}
                  />
                  <span className="text-13 whitespace-nowrap text-secondary">
                    执行人<span className="ml-0.5 text-danger-primary">*</span>
                  </span>
                  <div className="h-8 w-52">
                    <MemberDropdown
                      multiple={false}
                      projectId={projectId ? String(projectId) : undefined}
                      value={selectedAssignee}
                      onChange={(value) => setSelectedAssignee(value ? String(value) : null)}
                      placeholder="请选择执行人"
                      buttonVariant="border-with-text"
                      placement="bottom-start"
                      showUserDetails
                    />
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-13 text-tertiary tabular-nums">共 {total} 条</span>
                  {!hasNoLinkedProduct && !linkedProductsError && (
                    <button
                      type="button"
                      onClick={handleOpenCreate}
                      className="flex items-center justify-center rounded border border-accent-strong bg-transparent px-3 py-1.5 text-xs font-medium whitespace-nowrap text-accent-primary transition-all hover:bg-accent-subtle"
                    >
                      新建用例
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-1 min-h-0 flex-col">
                {loading && (
                  <div className="flex h-full items-center justify-center py-12">
                    <div className="flex flex-col items-center gap-3 text-tertiary">
                      <span className="size-6 animate-spin rounded-full border-2 border-subtle border-t-accent-primary" />
                      <span className="text-sm text-secondary">加载中...</span>
                    </div>
                  </div>
                )}
                {!loading && error && (
                  <div className="mb-4 rounded-lg border border-danger-subtle bg-danger-subtle px-4 py-3">
                    <div className="text-sm text-danger-primary">{error}</div>
                  </div>
                )}
                {linkedProductsError && <LinkedProductLoadError message={linkedProductsError} />}
                {hasNoLinkedProduct && projectId && (
                  <NoLinkedProductHint workspaceSlug={workspaceSlug} projectId={projectId} />
                )}
                {!hasNoLinkedProduct && !linkedProductsError && !loading && !error && tableRows.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
                    <span className="flex size-12 items-center justify-center rounded-full bg-layer-1 text-tertiary">
                      <Layers className="size-6" />
                    </span>
                    <div className="text-sm text-secondary">暂无可关联的用例</div>
                  </div>
                )}
                {!loading && !error && tableRows.length > 0 && (
                  <>
                    <div className="table-scroll flex-1 min-h-0">
                      <Table
                        dataSource={tableRows}
                        columns={columns}
                        rowKey="id"
                        tableLayout="fixed"
                        pagination={false}
                        rowSelection={{
                          selectedRowKeys: selectedNewIds,
                          onChange: (keys) => {
                            const nextKeys = keys as string[];
                            setSelectedNewIds(nextKeys);
                            syncTreeCheckState(nextKeys);
                          },
                          preserveSelectedRowKeys: true,
                          selections: [
                            {
                              key: "select-all",
                              text: "本页全选",
                              onSelect: () => {
                                const nextKeys = Array.from(new Set([...selectedNewIds, ...tableRows.map((c) => c.id)]));
                                setSelectedNewIds(nextKeys);
                                syncTreeCheckState(nextKeys);
                              },
                            },
                            {
                              key: "clear-all",
                              text: "清空选择",
                              onSelect: () => {
                                setSelectedNewIds([]);
                                syncTreeCheckState([]);
                              },
                            },
                          ],
                        }}
                      />
                    </div>
                    <div className="modal-pagination-bar flex-shrink-0 border-t border-subtle bg-surface-1 py-3 pl-4 pr-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-secondary">
                          {total > 0
                            ? `第 ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, total)} 条，共 ${total} 条`
                            : ""}
                        </span>
                        <Pagination
                          simple
                          current={currentPage}
                          pageSize={pageSize}
                          total={total}
                          showSizeChanger
                          pageSizeOptions={["10", "20", "50", "100"]}
                          locale={{ items_per_page: "/ 页" }}
                          onChange={handlePaginationChange}
                          onShowSizeChange={handlePaginationChange}
                          size="small"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-subtle bg-surface-1 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3 text-13 text-secondary">
            <span className="whitespace-nowrap tabular-nums">
              已选 <span className="font-semibold text-primary">{selectedCount}</span> 条
            </span>
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSelectedNewIds([]);
                  syncTreeCheckState([]);
                }}
                className="text-accent-primary transition-colors hover:text-accent-primary-hover"
              >
                清空
              </button>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Button variant="secondary" onClick={closeModal} size="lg">
              取消
            </Button>
            <Button
              variant="primary"
              disabled={saving || selectedCount === 0 || !workspaceSlug || !planId}
              onClick={handleConfirm}
              size="lg"
            >
              {saving ? "处理中..." : "加入计划"}
              {!saving && selectedCount > 0 && (
                <span className="ml-1 rounded bg-white/20 px-1.5 py-px text-xs font-semibold tabular-nums">
                  {selectedCount}
                </span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </ModalCore>
  );

  return (
    <>
      {picker}
      {createTarget && productId && (
        <CreateCaseModal
          isOpen
          handleClose={() => setCreateTarget(null)}
          workspaceSlug={workspaceSlug}
          productId={productId}
          repositoryId={createTarget.repositoryId}
          repositoryName={createTarget.repositoryName}
          initialModuleId={createTarget.moduleId}
          onSuccess={handleCaseCreated}
        />
      )}
    </>
  );
};

export default PlanCasesModal;
