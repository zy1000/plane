"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { PageHead } from "@/components/core/page-title";
import { Col, Dropdown, Modal, Pagination, Row, Tag } from "antd";
import { ShareAltOutlined } from "@ant-design/icons";
import { Copy, FolderInput, FolderPlus, Pencil, Trash2 } from "lucide-react";
import {
  MODULE_TREE_ROOT_KEY,
  ModuleTreePanel,
  type TModuleTreeEditing,
  type TModuleTreeMenuItem,
  type TModuleTreeNode,
} from "@/components/qa/module-tree";
import { CaseService } from "@/services/qa/case.service";
import { CreateCaseModal } from "./create-modal";
import { ImportCaseModal } from "./import-modal";
import { ImportFromTemplateModal } from "./import-from-template-modal";
import { MoveCaseModal } from "./move-modal";
import { CopyCaseModal } from "./copy-modal";
import { CopyModuleModal } from "./copy-module-modal";
import { ModulePickerModal } from "./module-picker-modal";
import { useCaseModuleMove } from "./use-case-module-move";
import CasesExportModal from "./cases-export-modal";
import { CasesSearchInput } from "./cases-search";
import { CaseModuleService } from "@/services/qa";
import UpdateModal from "./update-modal";
import { useQueryParams } from "@/hooks/use-query-params";
import { CaseService as ReviewApiService } from "@/services/qa/review.service";
import {
  formatDateTime,
  globalEnums,
} from "@/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/testhub/util";
import { ChevronDownIcon } from "@plane/propel/icons";
import { isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { qaCaseSetToastError, qaCaseSetToastSuccess } from "@/utils/qa-case-error";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { useUserPermissions } from "@/hooks/store/user";
import { useTemplatePermissions } from "@/components/template-management/permissions";
import { FiltersRow } from "@/components/rich-filters/filters-row";
import { FiltersToggle } from "@/components/rich-filters/filters-toggle";
import { CasesDisplayFilters, DEFAULT_CASE_DISPLAY_PROPERTIES } from "./cases-display-filters";
import type { TCaseDisplayProperties } from "./cases-display-filters";
import { CasesTable } from "./cases-table";
import { PlanCasePriorityBadge } from "@/components/qa/plans/plan-case-priority-badge";
import { CasesBulkEditPanel } from "./cases-bulk-edit-panel";
import { CasesBulkOperationsBar } from "./cases-bulk-operations-bar";
import { useCasesBulkEdit } from "./use-cases-bulk-edit";
import type { TCaseTableRecord } from "./cases-table";
import { casesExpressionToQueryParams } from "./filters/expression-to-query";
import type { TCasesFilterQueryParams } from "./filters/expression-to-query";
import { useCasesFilter } from "./filters/use-cases-filter";
import { useCasesFiltersConfig } from "./filters/use-cases-filters-config";
import type { TCaseFilterExpression } from "./filters/types";

type TCreator = {
  display_name?: string;
};

type TModule = {
  name?: string;
};

type TLabel =
  | {
      id?: string;
      name?: string;
    }
  | string;

type TestCase = {
  id: string;
  code?: string;
  name: string;
  latest_execution_plan_id?: string | null;
  latest_execution_result?: string;
  review?: string;
  remark?: string;
  state?: number;
  type?: number;
  priority?: number;
  module?: TModule;
  assignee?: {
    id?: string;
  };
  created_at?: string;
  updated_at?: string;
  created_by?: TCreator;
  repository?: string;
  labels?: TLabel[];
};

type TestCaseResponse = {
  count: number;
  data: TestCase[];
};

type TCasesFilters = {
  search?: string;
} & TCasesFilterQueryParams;

const EMPTY_CASE_FILTER_EXPRESSION: TCaseFilterExpression = {};
const treeNodesFind = (nodes: TModuleTreeNode[], key: string): TModuleTreeNode | undefined => {
  for (const node of nodes) {
    if (node.key === key) return node;
    const found = treeNodesFind(node.children ?? [], key);
    if (found) return found;
  }
  return undefined;
};
const QA_CASE_CREATE_PERMISSION_KEY = "qa.case.create" as const;
const QA_CASE_EDIT_PERMISSION_KEY = "qa.case.edit" as const;
const QA_CASE_DELETE_PERMISSION_KEY = "qa.case.delete" as const;
const QA_CASE_IMPORT_EXPORT_PERMISSION_KEY = "qa.case.import_export" as const;
// 删除走 DELETE ?id__in=，跨页全选上千条时分批发，避免 URL 超长
const DELETE_BATCH_SIZE = 100;

export type TRepositoryCasesViewProps = {
  workspaceSlug: string;
  projectId?: string; // 本次抽取后项目页必传；可选是为后续模板模式预留
  repositoryId: string | null; // 页面在 URL/sessionStorage 解析完成前可能为 null，组件按原页面行为处理空态
  repositoryName?: string;
  mode?: "project" | "template"; // 本次只实现 "project"（默认），类型先预留
  treeHeader?: ReactNode; // 树头左侧内容（项目页放用例库切换器），由壳层传入
  toolbarPortalEl?: HTMLElement | null; // 传入后搜索/筛选/操作按钮挂到页头右侧
};

export const RepositoryCasesView = (props: TRepositoryCasesViewProps) => {
  const { workspaceSlug, repositoryId, repositoryName, treeHeader, toolbarPortalEl, mode = "project" } = props;
  // 模板模式：workspace 级模板库，无项目语境（权限=工作区成员，走 template-case 接口）
  const isTemplateMode = mode === "template";
  // project 模式必传；模板模式恒为 undefined
  const projectId = isTemplateMode ? undefined : props.projectId;
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { updateQueryParams } = useQueryParams();
  const { allowProjectPermissionKeys } = useUserPermissions();
  const workspaceSlugString = String(workspaceSlug || "");
  const projectIdString = String(projectId || "");
  // 模板模式走工作区级模板权限（与后端 workspace.case_template.* 口径一致），
  // 项目模式仍走项目侧 QA key
  const { canViewCaseTemplates, canManageCaseTemplates, canImportExportCaseTemplates } =
    useTemplatePermissions(workspaceSlugString);
  const canCreateCase = isTemplateMode
    ? canManageCaseTemplates
    : allowProjectPermissionKeys([QA_CASE_CREATE_PERMISSION_KEY], workspaceSlugString, projectIdString);
  const canEditCase = isTemplateMode
    ? canManageCaseTemplates
    : allowProjectPermissionKeys([QA_CASE_EDIT_PERMISSION_KEY], workspaceSlugString, projectIdString);
  const canDeleteCase = isTemplateMode
    ? canManageCaseTemplates
    : allowProjectPermissionKeys([QA_CASE_DELETE_PERMISSION_KEY], workspaceSlugString, projectIdString);
  const canImportExportCase = isTemplateMode
    ? canImportExportCaseTemplates
    : allowProjectPermissionKeys([QA_CASE_IMPORT_EXPORT_PERMISSION_KEY], workspaceSlugString, projectIdString);
  const moduleIdFromUrl = searchParams.get("moduleId");

  const [cases, setCases] = useState<TestCase[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isTemplateImportOpen, setIsTemplateImportOpen] = useState<boolean>(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [activeCase, setActiveCase] = useState<any | null>(null);
  const [isMoveModalOpen, setIsMoveModalOpen] = useState(false);
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [selectingAll, setSelectingAll] = useState(false);

  // 分页状态管理
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [total, setTotal] = useState<number>(0);
  const [ordering, setOrdering] = useState<string | undefined>(undefined);
  const [caseDisplayProperties, setCaseDisplayProperties] = useState<TCaseDisplayProperties>(() => ({
    ...DEFAULT_CASE_DISPLAY_PROPERTIES,
    // 模板用例没有评审/执行语境，默认隐藏对应列
    ...(isTemplateMode ? { review: false, last_execution_result: false } : {}),
  }));

  // 筛选状态管理
  const [filters, setFilters] = useState<TCasesFilters>({});
  const [filterExpression, setFilterExpression] = useState<TCaseFilterExpression>(EMPTY_CASE_FILTER_EXPRESSION);
  const [allTotal, setAllTotal] = useState<number | undefined>(undefined);

  const caseService = new CaseService();
  const caseModuleService = new CaseModuleService();
  const reviewService = new ReviewApiService();
  const [reviewEnums, setReviewEnums] = useState<Record<string, Record<string, { label: string; color: string }>>>({});
  const caseTypeEnums = useMemo(
    () =>
      Object.entries((globalEnums.Enums as any)?.case_type || {}).reduce(
        (acc, [value, label]) => ({ ...acc, [String(value)]: String(label) }),
        {} as Record<string, string>
      ),
    [(globalEnums.Enums as any)?.case_type]
  );
  const casePriorityEnums = useMemo(
    () =>
      Object.entries((globalEnums.Enums as any)?.case_priority || {}).reduce(
        (acc, [value, label]) => ({ ...acc, [String(value)]: String(label) }),
        {} as Record<string, string>
      ),
    [(globalEnums.Enums as any)?.case_priority]
  );
  const { areAllConfigsInitialized, configs: casesFilterConfigs } = useCasesFiltersConfig({
    workspaceSlug: String(workspaceSlug || ""),
    // 模板模式无项目语境：不传 projectId，维护人筛选源切到工作区成员
    projectId: isTemplateMode ? undefined : String(projectId || ""),
    reviewEnums,
    caseTypeEnums,
    casePriorityEnums,
  });
  // 树的行内编辑态（新建 / 重命名），同一时间只有一个
  const [editing, setEditing] = useState<TModuleTreeEditing>(null);
  const [copyingModule, setCopyingModule] = useState<{ id: string; name: string } | null>(null);
  const [movingModule, setMovingModule] = useState<{ id: string; name: string } | null>(null);

  // 新增状态：模块树数据、选中模块
  const [modules, setModules] = useState<any[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

  useEffect(() => {
    if (!moduleIdFromUrl) return;
    if (moduleIdFromUrl === "all") setSelectedModuleId(null);
    else setSelectedModuleId(moduleIdFromUrl);
  }, [moduleIdFromUrl]);

  const selectionContextKey = useMemo(() => {
    return JSON.stringify({
      repositoryId,
      selectedModuleId,
      filters,
      filterExpression,
      ordering,
    });
  }, [repositoryId, selectedModuleId, filters, filterExpression, ordering]);
  const lastSelectionContextKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastSelectionContextKeyRef.current !== null && lastSelectionContextKeyRef.current !== selectionContextKey) {
      setSelectedCaseIds([]);
    }
    lastSelectionContextKeyRef.current = selectionContextKey;
  }, [selectionContextKey]);

  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  const batchUpdateModuleCounts = (modules: any[], countsMap: Record<string, number>): any[] => {
    return modules.map((m) => {
      const updatedM = { ...m };
      if (m.id && countsMap[String(m.id)] !== undefined) {
        updatedM.total = countsMap[String(m.id)];
      }
      if (m.children) {
        updatedM.children = batchUpdateModuleCounts(m.children, countsMap);
      }
      return updatedM;
    });
  };

  useEffect(() => {
    if (repositoryId) {
      const resetFilters: TCasesFilters = filters.search ? { search: filters.search } : {};
      setFilterExpression(EMPTY_CASE_FILTER_EXPRESSION);
      setFilters(resetFilters);
      fetchModules();
      fetchCases(1, pageSize, resetFilters); // 初始加载所有用例
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositoryId]);

  useEffect(() => {
    // 模板模式不拉评审枚举：评审筛选会因 options 为空自动禁用
    if (!workspaceSlug || isTemplateMode) return;
    reviewService
      .getReviewEnums(String(workspaceSlug))
      .then((data) => setReviewEnums(data || {}))
      .catch(() => {});
  }, [workspaceSlug, isTemplateMode]);

  // 解析 URL 参数以自动打开用例模态框
  useEffect(() => {
    const peekCase = searchParams.get("peekCase");
    if (peekCase) {
      setActiveCase({ id: peekCase });
      setIsUpdateModalOpen(true);
    }
  }, [searchParams]);

  // 新增：获取模块列表
  const fetchModules = async () => {
    if (!workspaceSlug || !repositoryId) return;
    try {
      const moduleData = await caseService.getModules(workspaceSlug as string, repositoryId as string);

      // 调用新接口获取 counts
      const countsResponse = await caseService.getModulesCount(workspaceSlug as string, repositoryId);

      // 提取 total 和模块 countsMap
      const { total = 0, ...countsMap } = countsResponse;
      setAllTotal(total);

      // 批量更新 moduleData 的 total
      const updatedModules = batchUpdateModuleCounts(moduleData, countsMap as Record<string, number>);

      setModules(updatedModules);
    } catch (err) {
      console.error("获取模块或计数失败:", err);
    }
  };

  // 添加：在该节点的子级末尾出现行内输入框（根 key 表示新建一级模块）
  const handleAddUnderNode = (parentId: string) => {
    if (!canCreateCase) return;
    if (!repositoryId) return;
    setEditing({ kind: "create", parentKey: parentId });
    if (parentId !== MODULE_TREE_ROOT_KEY)
      setExpandedKeys((prev) => (prev.includes(parentId) ? prev : [...prev, parentId]));
  };

  const handleCreateCommit = async (parentId: string, inputValue: string) => {
    setEditing(null);
    if (!canCreateCase) return;
    const name = inputValue.trim();
    if (!name || !workspaceSlug || !repositoryId) return;
    const payload: any = {
      name,
      repository: repositoryId,
    };
    if (parentId !== MODULE_TREE_ROOT_KEY) {
      payload.parent = parentId;
    }
    try {
      await caseService.createModules(workspaceSlug as string, payload);
      await fetchModules();
      await fetchCases(1, pageSize, filters);
    } catch (e) {
      console.error("创建模块失败:", e);
      qaCaseSetToastError(e, t, "创建模块失败");
    }
  };
  // 新增：删除确认弹窗与删除逻辑
  // 修改：仅接收模块 id，删除单个模块（及其子模块和用例）
  const confirmDeleteNode = (moduleId: string, nodeName: string) => {
    if (!canDeleteCase) return;
    Modal.confirm({
      title: "确认删除",
      content: "将删除该模块及其所有子模块和用例，操作不可撤销。请确认是否继续？",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          if (!workspaceSlug) return;
          await caseModuleService.deleteCaseModule(workspaceSlug as string, moduleId);
          if (selectedModuleId === moduleId) {
            setSelectedModuleId(null);
          }
          await fetchModules();
          const targetPage = selectedModuleId === moduleId ? 1 : currentPage;
          await fetchCases(targetPage, pageSize, filters);
        } catch (e) {
          console.error("删除失败:", e);
        }
      },
    });
  };

  const startRenameNode = (moduleId: string, currentName: string) => {
    if (!canEditCase) return;
    setEditing({ kind: "rename", key: moduleId, initialValue: currentName });
  };

  const handleRenameCommit = async (moduleId: string, inputValue: string) => {
    setEditing(null);
    if (!canEditCase) return;
    const name = inputValue.trim();
    if (!name || !workspaceSlug) return;
    try {
      await caseModuleService.updateCaseModule(workspaceSlug as string, moduleId, { name });
      await fetchModules();
    } catch (e) {
      console.error("重命名失败:", e);
      qaCaseSetToastError(e, t, "重命名失败");
    }
  };

  const handleEditCommit = (value: string) => {
    if (!editing) return;
    if (editing.kind === "create") void handleCreateCommit(editing.parentKey, value);
    else void handleRenameCommit(editing.key, value);
  };

  // 修改 fetchCases：支持 module_id 过滤
  const confirmDeleteCases = () => {
    if (!canDeleteCase) return;
    if (selectedCaseIds.length === 0) return;
    const deletingCount = selectedCaseIds.length;

    Modal.confirm({
      title: "确认删除",
      content: `确定要删除选中的 ${deletingCount} 个用例吗？操作不可撤销。`,
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!workspaceSlug) return;
        if (!isTemplateMode && !projectId) return;
        try {
          for (let i = 0; i < selectedCaseIds.length; i += DELETE_BATCH_SIZE) {
            const batch = selectedCaseIds.slice(i, i + DELETE_BATCH_SIZE);
            if (isTemplateMode) await caseService.deleteTemplateCases(workspaceSlugString, batch);
            else await caseService.deleteCase(workspaceSlug as string, String(projectId), batch);
          }
          qaCaseSetToastSuccess("删除成功");
          setSelectedCaseIds([]);
          await fetchModules();
          const isAllOnPageDeleted = deletingCount >= cases.length;
          const targetPage = isAllOnPageDeleted && currentPage > 1 ? currentPage - 1 : currentPage;
          await fetchCases(targetPage, pageSize, filters);
        } catch (e) {
          console.error("批量删除失败:", e);
          qaCaseSetToastError(e, t, "删除失败");
        }
      },
    });
  };

  // 当前库 + 模块 + 搜索/筛选，列表分页与「选择全部」共用
  const buildCaseQueryParams = (filterParams: typeof filters) => {
    const queryParams: any = { repository_id: repositoryId };

    // 新增：如果有选中模块，添加 module_id 参数
    if (selectedModuleId && selectedModuleId !== "all") {
      queryParams.module_id = selectedModuleId;
    }

    // search + rich filters
    if (filterParams.search) queryParams.search = filterParams.search;
    if (filterParams.review__in) queryParams.review__in = filterParams.review__in;
    if (filterParams.type__in) queryParams.type__in = filterParams.type__in;
    if (filterParams.priority__in) queryParams.priority__in = filterParams.priority__in;
    if (filterParams.assignee__in) queryParams.assignee__in = filterParams.assignee__in;
    if (filterParams.labels__name__icontains)
      queryParams.labels__name__icontains = filterParams.labels__name__icontains;
    return queryParams;
  };

  const fetchCases = async (
    page: number = currentPage,
    size: number = pageSize,
    filterParams: typeof filters = filters,
    orderingParam?: string | null
  ) => {
    if (!workspaceSlug || !repositoryId) return;
    if (!isTemplateMode && !projectId) return;
    try {
      setError(null);
      setAccessDenied(false);

      const effectiveOrdering = orderingParam === undefined ? ordering : (orderingParam ?? undefined);
      const queryParams: any = {
        page,
        page_size: size,
        ...buildCaseQueryParams(filterParams),
      };

      if (effectiveOrdering) queryParams.ordering = effectiveOrdering;

      const response: TestCaseResponse = isTemplateMode
        ? await caseService.getTemplateCases(workspaceSlugString, queryParams)
        : await caseService.getCases(workspaceSlug as string, String(projectId), queryParams);
      setCases(response?.data || []);
      setTotal(response?.count || 0); // 保留：用于当前查询的分页
      setCurrentPage(page);
      setPageSize(size);
    } catch (err) {
      console.error("获取测试用例数据失败:", err);
      if (isProjectPermissionError(err)) {
        setAccessDenied(true);
        setError(null);
      } else {
        setAccessDenied(false);
        setError("获取测试用例数据失败，请稍后重试");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRichFiltersChange = useCallback(
    (expression: TCaseFilterExpression) => {
      const mappedQuery = casesExpressionToQueryParams(expression);
      const nextFilters: TCasesFilters = {
        ...(filters.search ? { search: filters.search } : {}),
        ...mappedQuery,
      };
      setFilterExpression(expression);
      setFilters(nextFilters);
      fetchCases(1, pageSize, nextFilters);
    },
    [fetchCases, filters.search, pageSize]
  );

  const casesFilter = useCasesFilter({
    instanceKey: `${repositoryId || "all"}-${projectId || "all"}`,
    initialExpression: EMPTY_CASE_FILTER_EXPRESSION,
    areAllConfigsInitialized,
    configs: casesFilterConfigs,
    onExpressionChange: handleRichFiltersChange,
  });

  // 新增：监听模块选择变化，触发列表刷新（避免使用旧状态）
  useEffect(() => {
    if (!repositoryId) return;
    // 切换模块时，从第一页开始刷新
    fetchCases(1, pageSize, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModuleId]);

  const handleTreeSelect = (key: string) => {
    const nextModuleId = key === MODULE_TREE_ROOT_KEY ? null : key;
    if (nextModuleId === selectedModuleId) return;
    fetchModules();
    setSelectedModuleId(nextModuleId);
    // 切换模块后重置选中
    setSelectedCaseIds([]);
  };

  // Helper：获取节点数量（兼容不同字段名），没有则返回 undefined 不展示
  const getNodeCount = (m: any) => {
    const c = m?.case_count ?? m?.count ?? m?.total ?? m?.cases_count;
    return typeof c === "number" ? c : undefined;
  };

  const treeNodes = useMemo<TModuleTreeNode[]>(() => {
    const build = (list: any[]): TModuleTreeNode[] =>
      (Array.isArray(list) ? list : []).map((node: any) => ({
        key: String(node?.id),
        label: String(node?.name ?? "-"),
        count: getNodeCount(node),
        children: build(node?.children || []),
      }));
    return build(modules);
  }, [modules]);

  const getMenuItems = (node: TModuleTreeNode): TModuleTreeMenuItem[] => {
    if (!repositoryId) return [];
    return [
      {
        key: "add",
        label: "添加子模块",
        icon: <FolderPlus className="size-3.5" strokeWidth={1.75} />,
        disabled: !canCreateCase,
        onClick: () => handleAddUnderNode(node.key),
      },
      {
        key: "rename",
        label: "重命名",
        icon: <Pencil className="size-3.5" strokeWidth={1.75} />,
        disabled: !canEditCase,
        onClick: () => startRenameNode(node.key, node.label),
      },
      {
        key: "copy",
        label: "复制",
        icon: <Copy className="size-3.5" strokeWidth={1.75} />,
        disabled: !canCreateCase,
        onClick: () => setCopyingModule({ id: node.key, name: node.label }),
      },
      {
        key: "move",
        label: "移动到…",
        icon: <FolderInput className="size-3.5" strokeWidth={1.75} />,
        disabled: !canEditCase,
        onClick: () => setMovingModule({ id: node.key, name: node.label }),
      },
      {
        key: "delete",
        label: "删除",
        icon: <Trash2 className="size-3.5" strokeWidth={1.75} />,
        danger: true,
        disabled: !canDeleteCase,
        onClick: () => confirmDeleteNode(node.key, node.label),
      },
    ];
  };

  const selectedModuleName = selectedModuleId
    ? treeNodesFind(treeNodes, selectedModuleId)?.label
    : undefined;

  const moduleMove = useCaseModuleMove({
    workspaceSlug: workspaceSlug as string | undefined,
    modules,
    canEdit: canEditCase,
    onMoved: async (newParentId) => {
      if (newParentId) {
        setExpandedKeys((prev) => (prev.includes(newParentId) ? prev : [...prev, newParentId]));
      }
      // 选中的是祖先模块时右侧列表范围会变，一起刷新
      await fetchModules();
      await fetchCases(currentPage, pageSize, filters);
    },
  });

  const handlePaginationChange = (page: number, size?: number) => {
    const newPageSize = size || pageSize;
    const nextPage = newPageSize !== pageSize ? 1 : page;
    fetchCases(nextPage, newPageSize, filters);
  };

  const handleSortChange = (nextOrdering?: string) => {
    setOrdering(nextOrdering);
    fetchCases(1, pageSize, filters, nextOrdering ?? null);
  };

  const handleDisplayPropertiesUpdate = (updatedDisplayProperties: Partial<TCaseDisplayProperties>) => {
    setCaseDisplayProperties((prev) => ({ ...prev, ...updatedDisplayProperties }));
  };

  const handleRowSelectChange = (selectedKeysOnCurrentPage: string[]) => {
    const currentPageIds = (cases || []).map((item) => String(item.id));
    setSelectedCaseIds((prev) => {
      const next = new Set(prev.map((id) => String(id)));
      currentPageIds.forEach((id) => next.delete(id));
      selectedKeysOnCurrentPage.forEach((id) => next.add(id));
      return Array.from(next);
    });
  };

  const handleSelectAllCases = async () => {
    if (!workspaceSlug || !repositoryId) return;
    if (!isTemplateMode && !projectId) return;
    setSelectingAll(true);
    try {
      const queryParams = { ...buildCaseQueryParams(filters), only_ids: "true" };
      const response = isTemplateMode
        ? await caseService.getTemplateCases(workspaceSlugString, queryParams)
        : await caseService.getCases(workspaceSlugString, String(projectId), queryParams);
      setSelectedCaseIds((response?.data || []).map((id: string) => String(id)));
    } catch (e) {
      qaCaseSetToastError(e, t, "选择全部失败");
    } finally {
      setSelectingAll(false);
    }
  };

  const bulkEdit = useCasesBulkEdit({
    isTemplateMode,
    workspaceSlug: workspaceSlugString,
    projectId,
    cases: cases as TCaseTableRecord[],
    selectedCaseIds,
    clearSelection: () => setSelectedCaseIds([]),
    onUpdated: () => fetchCases(currentPage, pageSize, filters),
  });

  const handleSetColumnWidth = (columnKey: string, width: number) => {
    setColumnWidths((prev) => ({ ...prev, [columnKey]: width }));
  };

  const handleEditCase = (record: any) => {
    if (!canEditCase) return;
    if (!record || !record.id) return;
    setActiveCase(record);
    setIsUpdateModalOpen(true);
  };

  const handleViewCase = (record: TCaseTableRecord) => {
    if (!record || !record.id) return;
    setActiveCase(record);
    setIsUpdateModalOpen(true);
  };

  const handleViewLastExecution = (record: TCaseTableRecord) => {
    const ws = String(workspaceSlug || "");
    const pid = String(projectId || "");
    if (!record?.id || !record?.latest_execution_plan_id || !ws || !pid) return;
    router.push(
      `/${ws}/projects/${pid}/testhub/test-execution?case_id=${encodeURIComponent(
        String(record.id)
      )}&plan_id=${encodeURIComponent(String(record.latest_execution_plan_id))}`
    );
  };

  const handleDeleteCase = (record: any) => {
    if (!canDeleteCase) return;
    if (!record || !record.id || !workspaceSlug) return;
    if (!isTemplateMode && !projectId) return;
    Modal.confirm({
      title: "确认删除用例",
      content: "删除后不可恢复，是否继续？",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          if (isTemplateMode) await caseService.deleteTemplateCases(workspaceSlugString, String(record.id));
          else await caseService.deleteCase(String(workspaceSlug), String(projectId), String(record.id));
          try {
            qaCaseSetToastSuccess("删除成功");
          } catch {}
          await fetchModules();
          const isLastItemOnPage = cases.length <= 1;
          const targetPage = isLastItemOnPage && currentPage > 1 ? currentPage - 1 : currentPage;
          await fetchCases(targetPage, pageSize, filters);
        } catch (e) {
          console.error("删除用例失败:", e);
          try {
            qaCaseSetToastError(e, t, "删除失败，请稍后重试");
          } catch {}
        }
      },
    });
  };

  // 根据全局枚举输出标签
  const getEnumLabel = (group: "case_state" | "case_type" | "case_priority", value?: number) => {
    if (value === null || value === undefined) return "-";
    const map = (globalEnums.Enums as any)?.[group] || {};
    const label = map[value] ?? map[String(value)] ?? value;
    return label;
  };

  const renderEnumTag = (
    group: "case_state" | "case_type" | "case_priority",
    value?: number,
    color: "default" | "processing" | "success" | "warning" | "magenta" = "default"
  ) => {
    const label = getEnumLabel(group, value);
    if (label === "-" || label === undefined) return <span className="text-placeholder">-</span>;
    return <Tag color={color}>{label}</Tag>;
  };

  const renderReviewTag = (value?: string) => {
    const rawColor = reviewEnums?.CaseReviewThrough_Result?.[value || ""]?.color || "default";
    const color = rawColor === "gray" ? "default" : rawColor;
    return (
      <Tag color={color} className="!inline-flex w-[55px] justify-center">
        {value || "-"}
      </Tag>
    );
  };

  const renderLastExecutionResult = (record: TCaseTableRecord) => {
    const label = record?.latest_execution_result;
    if (!label) return <span className="text-placeholder">-</span>;

    const rawColor = ((globalEnums.Enums as any)?.plan_case_result || {})[label] || "default";
    const color = rawColor === "gray" ? "default" : rawColor;
    const resultTag = (
      <Tag color={color} className="!inline-flex w-[55px] justify-center">
        {label}
      </Tag>
    );

    if (!record?.latest_execution_plan_id) return resultTag;

    return (
      <button
        type="button"
        className="inline-flex items-center hover:opacity-80"
        onClick={() => handleViewLastExecution(record)}
      >
        {resultTag}
      </button>
    );
  };

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  if (accessDenied) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  const useExternalToolbar = Boolean(toolbarPortalEl);
  const toolbarActions = (
    <div className="flex items-center gap-2">
      <CasesSearchInput
        disabled={!repositoryId}
        value={filters.search ?? ""}
        onSearch={(query) => {
          const nextFilters = { ...filters, search: query.trim() || undefined };
          setFilters(nextFilters);
          fetchCases(1, pageSize, nextFilters);
        }}
      />
      {repositoryId && (
        <FiltersToggle filter={casesFilter} triggerClassName="h-8 w-8" iconButtonSize="xl" />
      )}
      {repositoryId && (
        <CasesDisplayFilters
          displayProperties={caseDisplayProperties}
          ordering={ordering}
          onDisplayPropertiesChange={handleDisplayPropertiesUpdate}
          onOrderByChange={handleSortChange}
          hiddenPropertyKeys={isTemplateMode ? ["review", "last_execution_result"] : undefined}
        />
      )}
      {!isTemplateMode && (
        <button
          type="button"
          onClick={() => {
            if (!repositoryId) return;
            const ws = String(workspaceSlug || "");
            const pid = String(projectId || "");
            const params = new URLSearchParams();
            params.set("repositoryId", String(repositoryId));
            if (selectedModuleId) params.set("moduleId", String(selectedModuleId));
            router.push(`/${ws}/projects/${pid}/testhub/cases/mind?${params.toString()}`);
          }}
          disabled={!repositoryId}
          className="flex h-8 w-8 items-center justify-center rounded border border-subtle text-secondary hover:bg-layer-1 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="脑图视图"
        >
          <ShareAltOutlined />
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          if (!repositoryId || !canCreateCase) return;
          setIsCreateModalOpen(true);
        }}
        disabled={!repositoryId || !canCreateCase}
        className="flex items-center justify-center gap-1.5 rounded bg-accent-primary px-3 py-1.5 text-xs font-medium whitespace-nowrap text-on-color transition-all hover:bg-accent-primary-hover focus:bg-accent-primary-hover focus:text-on-color disabled:cursor-not-allowed disabled:opacity-50"
      >
        新建用例
      </button>
      {!isTemplateMode ? (
        <div className="inline-flex items-stretch">
          <button
            type="button"
            onClick={() => {
              // 从模板导入还要能读模板库（后端 workspace.case_template.view）
              if (!repositoryId || !canCreateCase || !canViewCaseTemplates) return;
              setIsTemplateImportOpen(true);
            }}
            disabled={!repositoryId || !canCreateCase || !canViewCaseTemplates}
            className="flex items-center justify-center gap-1.5 rounded-l border border-r-0 border-accent-strong bg-transparent px-3 py-1.5 text-xs font-medium whitespace-nowrap text-accent-primary transition-all hover:bg-accent-subtle focus:bg-accent-subtle-hover focus:text-accent-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            导入
          </button>
          <Dropdown
            trigger={["click"]}
            placement="bottomRight"
            menu={{
              items: [
                {
                  key: "from-file",
                  label: "从文件导入",
                  disabled: !repositoryId || !canImportExportCase,
                  onClick: () => {
                    if (!repositoryId || !canImportExportCase) return;
                    setIsImportModalOpen(true);
                  },
                },
              ],
            }}
          >
            <button
              type="button"
              disabled={!repositoryId}
              className="flex items-center justify-center rounded-r border border-accent-strong bg-transparent px-1.5 text-accent-primary transition-all hover:bg-accent-subtle focus:bg-accent-subtle-hover disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="更多导入方式"
            >
              <ChevronDownIcon className="size-3.5" strokeWidth={2.5} />
            </button>
          </Dropdown>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (!repositoryId || !canImportExportCase) return;
            setIsImportModalOpen(true);
          }}
          disabled={!repositoryId || !canImportExportCase}
          className="flex items-center justify-center gap-1.5 rounded border border-accent-strong bg-transparent px-3 py-1.5 text-xs font-medium whitespace-nowrap text-accent-primary transition-all hover:bg-accent-subtle focus:bg-accent-subtle-hover focus:text-accent-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          导入
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          if (!repositoryId || !canImportExportCase) return;
          setIsExportModalOpen(true);
        }}
        disabled={!repositoryId || !canImportExportCase}
        className="flex items-center justify-center gap-1.5 rounded border border-accent-strong bg-transparent px-3 py-1.5 text-xs font-medium whitespace-nowrap text-accent-primary transition-all hover:bg-accent-subtle focus:bg-accent-subtle-hover focus:text-accent-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        导出
      </button>
    </div>
  );

  return (
    <>
      {/* 页面标题 */}
      <PageHead title={`${isTemplateMode ? "模板用例" : "测试用例"}${repositoryName ? " - " + repositoryName : ""}`} />
      <div className="h-full w-full">
        <div className="flex h-full w-full flex-col">
          <Row wrap={false} className="flex-1 overflow-hidden pb-0" gutter={[0, 16]}>
            <ModuleTreePanel
              headerLeft={treeHeader}
              root={{ label: "全部用例", count: allTotal }}
              nodes={treeNodes}
              selectedKey={selectedModuleId ?? MODULE_TREE_ROOT_KEY}
              onSelect={handleTreeSelect}
              expandedKeys={expandedKeys}
              onExpandedKeysChange={setExpandedKeys}
              editing={editing}
              onEditCommit={handleEditCommit}
              onEditCancel={() => setEditing(null)}
              getMenuItems={getMenuItems}
              dragMode={repositoryId && canEditCase ? "sort" : "none"}
              onDrop={moduleMove.onDrop}
              onAddRoot={repositoryId && canCreateCase ? () => handleAddUnderNode(MODULE_TREE_ROOT_KEY) : undefined}
              railLabel={selectedModuleName || "全部用例"}
            />
            {/* 右侧表格 */}
            <Col flex="auto" className="h-full overflow-hidden">
              <div className="flex h-full flex-col">
                {useExternalToolbar && toolbarPortalEl && createPortal(toolbarActions, toolbarPortalEl)}
                {!useExternalToolbar && (
                  <div className="flex flex-shrink-0 items-center justify-end px-3 pt-2 pb-2">{toolbarActions}</div>
                )}
                {repositoryId && <FiltersRow filter={casesFilter} />}
                <div className="min-h-0 flex-1 overflow-hidden">
                  {/* 加载/错误/空状态 */}
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

                  {!repositoryId && !loading && (
                    <div className="flex items-center justify-center py-12">
                      <div className="text-secondary">未找到用例库ID，请先在顶部选择一个用例库</div>
                    </div>
                  )}

                  {repositoryId && !loading && !error && (
                    <div className="flex h-full flex-col overflow-hidden">
                      <div className="relative min-w-0 flex-1 overflow-hidden px-0">
                        <CasesTable
                          canDelete={canDeleteCase}
                          canEdit={canEditCase}
                          cases={cases as TCaseTableRecord[]}
                          selectedCaseIds={selectedCaseIds}
                          displayProperties={caseDisplayProperties}
                          columnWidths={columnWidths}
                          setColumnWidth={handleSetColumnWidth}
                          onRowSelectChange={handleRowSelectChange}
                          onViewCase={handleViewCase}
                          onEdit={handleEditCase}
                          onDelete={handleDeleteCase}
                          renderReviewTag={renderReviewTag}
                          renderLastExecutionResult={renderLastExecutionResult}
                          renderTypeTag={(value) => renderEnumTag("case_type", value, "magenta")}
                          renderPriorityTag={(value) => <PlanCasePriorityBadge value={value} />}
                          renderUpdatedAt={(value) => formatDateTime(value || "")}
                          flashedCells={bulkEdit.flashedCells}
                        />
                      </div>
                      <div className="relative flex flex-shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-4 py-3">
                        <CasesBulkOperationsBar
                          selectedCount={selectedCaseIds.length}
                          total={total}
                          selectingAll={selectingAll}
                          onSelectAll={handleSelectAllCases}
                          onClearSelection={() => setSelectedCaseIds([])}
                          isEditPanelOpen={bulkEdit.isPanelOpen}
                          onToggleEditPanel={bulkEdit.togglePanel}
                          editPanel={
                            <CasesBulkEditPanel
                              workspaceSlug={workspaceSlugString}
                              projectId={projectId}
                              repositoryId={repositoryId}
                              selectedCount={selectedCaseIds.length}
                              knownCases={bulkEdit.knownCases}
                              submitting={bulkEdit.submitting}
                              onCancel={bulkEdit.closePanel}
                              onApply={bulkEdit.apply}
                            />
                          }
                          canEdit={canEditCase}
                          canCreate={canCreateCase}
                          canDelete={canDeleteCase}
                          onMove={() => canEditCase && setIsMoveModalOpen(true)}
                          onCopy={() => canCreateCase && setIsCopyModalOpen(true)}
                          onDelete={confirmDeleteCases}
                        />
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
                </div>

                <style
                  dangerouslySetInnerHTML={{
                    __html: `
                      .testhub-cases-table-scroll {
                        scrollbar-gutter: stable;
                      }

                      .testhub-cases-table-scroll ::-webkit-scrollbar {
                        width: 8px;
                        height: 8px;
                      }

                      .testhub-cases-table-scroll ::-webkit-scrollbar-thumb {
                        background-color: #d9d9d9;
                        border-radius: 4px;
                      }

                      .testhub-cases-table-scroll ::-webkit-scrollbar-thumb:hover {
                        background-color: #bfbfbf;
                      }

                      .testhub-cases-table-scroll ::-webkit-scrollbar-track {
                        background: color-mix(in oklch, var(--border-subtle) 40%, transparent);
                        border-radius: 4px;
                      }
                    `,
                  }}
                />
              </div>
            </Col>
          </Row>
        </div>
      </div>

      {repositoryId && (
        <CreateCaseModal
          isOpen={isCreateModalOpen}
          handleClose={() => {
            setIsCreateModalOpen(false);
            fetchModules();
          }}
          workspaceSlug={workspaceSlug as string}
          repositoryId={repositoryId as string}
          repositoryName={repositoryName || ""}
          initialModuleId={selectedModuleId}
          templateMode={isTemplateMode}
          onSuccess={async () => {
            // 新增成功后刷新当前列表与分页/筛选状态
            await fetchCases(currentPage, pageSize, filters);
            fetchModules();
            fetchCases(1, pageSize, filters);
          }}
        />
      )}

      {repositoryId && (
        <ImportCaseModal
          isOpen={isImportModalOpen}
          handleClose={() => setIsImportModalOpen(false)}
          workspaceSlug={workspaceSlug as string}
          repositoryId={repositoryId as string}
          onSuccess={async () => {
            await fetchCases(currentPage, pageSize, filters);
            await fetchModules();
          }}
        />
      )}
      {!isTemplateMode && repositoryId && (
        <ImportFromTemplateModal
          isOpen={isTemplateImportOpen}
          handleClose={() => setIsTemplateImportOpen(false)}
          workspaceSlug={workspaceSlugString}
          targetRepositoryId={repositoryId}
          onSuccess={() => {
            fetchModules();
            fetchCases(1, pageSize, filters);
          }}
        />
      )}
      {repositoryId && (
        <CasesExportModal
          open={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          workspaceSlug={workspaceSlug as string}
          repositoryId={repositoryId as string}
          moduleId={selectedModuleId || undefined}
          selectedCaseIds={selectedCaseIds}
        />
      )}
      <UpdateModal
        open={isUpdateModalOpen}
        canEdit={canEditCase}
        templateMode={isTemplateMode}
        onClose={() => {
          setActiveCase(null);
          fetchModules();
          fetchCases(currentPage, pageSize, filters);
          setIsUpdateModalOpen(false);
          if (searchParams.get("peekCase")) {
            const updatedRoute = updateQueryParams({ paramsToRemove: ["peekCase"] });
            router.push(updatedRoute);
          }
        }}
        caseId={activeCase?.id}
      />

      {repositoryId && (
        <MoveCaseModal
          isOpen={isMoveModalOpen}
          handleClose={() => setIsMoveModalOpen(false)}
          workspaceSlug={workspaceSlug as string}
          repositoryId={repositoryId}
          selectedCaseIds={selectedCaseIds}
          onSuccess={() => {
            fetchModules();
            fetchCases(1, pageSize, filters);
            setSelectedCaseIds([]);
          }}
        />
      )}

      {repositoryId && (
        <CopyCaseModal
          isOpen={isCopyModalOpen}
          handleClose={() => setIsCopyModalOpen(false)}
          workspaceSlug={workspaceSlug as string}
          repositoryId={repositoryId}
          projectId={projectId}
          repositoryQuery={isTemplateMode ? { is_template: true } : undefined}
          emptyProjectGroupLabel={isTemplateMode ? "模板库" : undefined}
          selectedCaseIds={selectedCaseIds}
          onSuccess={() => {
            fetchModules();
            fetchCases(currentPage, pageSize, filters);
            setSelectedCaseIds([]);
          }}
        />
      )}

      {copyingModule && (
        <CopyModuleModal
          isOpen={!!copyingModule}
          handleClose={() => setCopyingModule(null)}
          workspaceSlug={workspaceSlug as string}
          moduleId={copyingModule.id}
          moduleName={copyingModule.name}
          repositoryQuery={isTemplateMode ? { is_template: true } : undefined}
          emptyProjectGroupLabel={isTemplateMode ? "模板库" : undefined}
          onSuccess={() => {
            setCopyingModule(null);
            fetchModules();
          }}
        />
      )}

      {movingModule && repositoryId && (
        <ModulePickerModal
          isOpen={!!movingModule}
          title={`移动模块「${movingModule.name}」`}
          handleClose={() => setMovingModule(null)}
          workspaceSlug={workspaceSlug as string}
          repositoryId={repositoryId}
          disabledSubtreeOf={movingModule.id}
          allowRoot
          onConfirm={async (targetParentId) => {
            const moved = await moduleMove.moveModule(movingModule.id, targetParentId);
            if (moved) {
              qaCaseSetToastSuccess("移动成功");
              setMovingModule(null);
            }
          }}
        />
      )}
    </>
  );
};
