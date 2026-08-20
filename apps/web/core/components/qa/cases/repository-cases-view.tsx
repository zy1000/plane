"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { PageHead } from "@/components/core/page-title";
import { Button, Col, Dropdown, Input, Modal, Pagination, Row, Tag, Tree } from "antd";
import { AppstoreOutlined, EllipsisOutlined, PlusOutlined, ShareAltOutlined } from "@ant-design/icons";
import type { TreeProps } from "antd";
import { CaseService } from "@/services/qa/case.service";
import { CreateCaseModal } from "./create-modal";
import { ImportCaseModal } from "./import-modal";
import { ImportFromTemplateModal } from "./import-from-template-modal";
import { MoveCaseModal } from "./move-modal";
import { CopyCaseModal } from "./copy-modal";
import { CopyModuleModal } from "./copy-module-modal";
import CasesExportModal from "./cases-export-modal";
import { CasesSearchInput } from "./cases-search";
import { CaseModuleService } from "@/services/qa";
import UpdateModal from "./update-modal";
import { useQueryParams } from "@/hooks/use-query-params";
import { CaseService as ReviewApiService } from "@/services/qa/review.service";
import { FolderOpenDot } from "lucide-react";
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
import { FiltersRow } from "@/components/rich-filters/filters-row";
import { FiltersToggle } from "@/components/rich-filters/filters-toggle";
import { CasesDisplayFilters, DEFAULT_CASE_DISPLAY_PROPERTIES } from "./cases-display-filters";
import type { TCaseDisplayProperties } from "./cases-display-filters";
import { CasesTable } from "./cases-table";
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
const QA_CASE_CREATE_PERMISSION_KEY = "qa.case.create" as const;
const QA_CASE_EDIT_PERMISSION_KEY = "qa.case.edit" as const;
const QA_CASE_DELETE_PERMISSION_KEY = "qa.case.delete" as const;
const QA_CASE_IMPORT_EXPORT_PERMISSION_KEY = "qa.case.import_export" as const;

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

export type TRepositoryCasesViewProps = {
  workspaceSlug: string;
  projectId?: string; // 本次抽取后项目页必传；可选是为后续模板模式预留
  repositoryId: string | null; // 页面在 URL/sessionStorage 解析完成前可能为 null，组件按原页面行为处理空态
  repositoryName?: string;
  mode?: "project" | "template"; // 本次只实现 "project"（默认），类型先预留
  headerLeft?: ReactNode; // 工具栏左侧的页面级内容（面包屑 + 库切换器），由壳层传入
  toolbarPortalEl?: HTMLElement | null; // 传入后搜索/筛选/操作按钮挂到页头右侧
};

export const RepositoryCasesView = (props: TRepositoryCasesViewProps) => {
  const { workspaceSlug, repositoryId, repositoryName, headerLeft, toolbarPortalEl, mode = "project" } = props;
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
  // 模板模式下工作区成员即可维护（与后端 allow_workspace_member 口径一致）
  const canCreateCase =
    isTemplateMode ||
    allowProjectPermissionKeys([QA_CASE_CREATE_PERMISSION_KEY], workspaceSlugString, projectIdString);
  const canEditCase =
    isTemplateMode ||
    allowProjectPermissionKeys([QA_CASE_EDIT_PERMISSION_KEY], workspaceSlugString, projectIdString);
  const canDeleteCase =
    isTemplateMode ||
    allowProjectPermissionKeys([QA_CASE_DELETE_PERMISSION_KEY], workspaceSlugString, projectIdString);
  const canImportExportCase =
    isTemplateMode ||
    allowProjectPermissionKeys([QA_CASE_IMPORT_EXPORT_PERMISSION_KEY], workspaceSlugString, projectIdString);
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

  // 分页状态管理
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
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
  // 新增：创建子模块的临时状态
  const [creatingParentId, setCreatingParentId] = useState<string | "all" | null>(null);
  const [renamingModuleId, setRenamingModuleId] = useState<string | null>(null);
  const [copyingModule, setCopyingModule] = useState<{ id: string; name: string } | null>(null);

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

  const [expandedKeys, setExpandedKeys] = useState<string[]>(["all"]);
  const [autoExpandParent, setAutoExpandParent] = useState<boolean>(true);
  const onExpand: TreeProps["onExpand"] = (keys) => {
    setExpandedKeys(keys as string[]);
    setAutoExpandParent(false);
  };
  const [searchModule, setSearchModule] = useState<string>("");

  const [leftWidth, setLeftWidth] = useState<number>(250);
  const isDraggingRef = useRef<boolean>(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);
  const onMouseDownResize = (e: any) => {
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = leftWidth;
    window.addEventListener("mousemove", onMouseMoveResize);
    window.addEventListener("mouseup", onMouseUpResize);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    if (e && typeof e.preventDefault === "function") e.preventDefault();
  };
  const onMouseMoveResize = (e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    const delta = e.clientX - startXRef.current;
    const next = Math.min(300, Math.max(200, startWidthRef.current + delta));
    setLeftWidth(next);
  };
  const onMouseUpResize = () => {
    isDraggingRef.current = false;
    window.removeEventListener("mousemove", onMouseMoveResize);
    window.removeEventListener("mouseup", onMouseUpResize);
    document.body.style.cursor = "auto";
    document.body.style.userSelect = "auto";
  };

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

  // 新增：添加行为 - 在当前节点下插入临时输入框
  const handleAddUnderNode = (parentId: string | "all") => {
    if (!canCreateCase) return;
    if (!repositoryId) return;
    setCreatingParentId(parentId);

    // 新增：确保当前父节点展开，便于显示临时输入框
    setExpandedKeys((prev) => {
      const prevKeys = prev || [];
      const pid = String(parentId);
      return prevKeys.includes(pid) ? prevKeys : [...prevKeys, pid];
    });
    setAutoExpandParent(true);
  };

  // 新增：输入框失焦或回车时调用创建接口
  const handleCreateBlurOrEnter = async (parentId: string | "all", inputValue: string) => {
    if (!canCreateCase) {
      setCreatingParentId(null);
      return;
    }
    const name = inputValue.trim();
    if (!name || !workspaceSlug || !repositoryId) {
      setCreatingParentId(null);
      return;
    }
    const payload: any = {
      name,
      repository: repositoryId,
    };
    if (parentId !== "all") {
      payload.parent = parentId;
    }
    try {
      await caseService.createModules(workspaceSlug as string, payload);
      // 刷新模块树与列表
      setCreatingParentId(null);
      await fetchModules();
      await fetchCases(1, pageSize, filters);
    } catch (e) {
      console.error("创建模块失败:", e);
      qaCaseSetToastError(e, t, "创建模块失败");
      setCreatingParentId(null);
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
    setCreatingParentId(null);
    setRenamingModuleId(moduleId);
    setExpandedKeys((prev) => {
      const prevKeys = prev || [];
      return prevKeys.includes(moduleId) ? prevKeys : [...prevKeys, moduleId];
    });
    setAutoExpandParent(true);
  };

  const handleRenameBlurOrEnter = async (moduleId: string, inputValue: string) => {
    if (!canEditCase) {
      setRenamingModuleId(null);
      return;
    }
    const name = inputValue.trim();
    if (!name || !workspaceSlug) {
      setRenamingModuleId(null);
      return;
    }
    try {
      await caseModuleService.updateCaseModule(workspaceSlug as string, moduleId, { name });
      setRenamingModuleId(null);
      await fetchModules();
    } catch (e) {
      console.error("重命名失败:", e);
      qaCaseSetToastError(e, t, "重命名失败");
      setRenamingModuleId(null);
    }
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
          if (isTemplateMode) await caseService.deleteTemplateCases(workspaceSlugString, selectedCaseIds);
          else await caseService.deleteCase(workspaceSlug as string, String(projectId), selectedCaseIds);
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
        repository_id: repositoryId,
      };

      if (effectiveOrdering) queryParams.ordering = effectiveOrdering;

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

  // 新增：Tree onSelect 处理（仅更新选中状态，不直接调用 fetchCases）
  const onSelect: TreeProps["onSelect"] = (selectedKeys, info) => {
    const keyStr = String(info?.node?.key);
    // 忽略临时创建节点，避免设置成选中模块从而发起错误过滤请求
    if (keyStr.startsWith("__creating__")) {
      return;
    }

    // 如果是“取消选择”事件（再次点击同一模块），则忽略，保持当前选中不变
    if (!info.selected) {
      if (String(info?.node?.key) === "all") {
        setSelectedModuleId(null);
      }
      return;
    }
    fetchModules();
    const key = selectedKeys[0] as string | undefined;
    const nextModuleId = !key || key === "all" ? null : key;
    setSelectedModuleId(nextModuleId);
    // 切换模块后重置选中
    setSelectedCaseIds([]);
  };

  // Helper：获取节点数量（兼容不同字段名），没有则返回 undefined 不展示
  const getNodeCount = (m: any) => {
    const c = m?.case_count ?? m?.count ?? m?.total ?? m?.cases_count;
    return typeof c === "number" ? c : undefined;
  };

  // 自定义节点标题：统一图标 + 名称 + 右侧数量
  const renderNodeTitle = (title: string, count?: number, nodeId?: string | "all") => {
    const actualId = String(nodeId || "all");
    if (renamingModuleId && renamingModuleId === actualId) {
      return (
        <ModuleInput
          placeholder="请输入模块名称"
          defaultValue={title}
          onCommit={(val) => handleRenameBlurOrEnter(actualId, val)}
        />
      );
    }
    const items = [
      {
        key: "add",
        label: (
          <Button
            type="text"
            size="small"
            disabled={!canCreateCase}
            onClick={() => handleAddUnderNode(nodeId || "all")}
          >
            添加
          </Button>
        ),
      },
      {
        key: "rename",
        label: (
          <Button type="text" size="small" disabled={!canEditCase} onClick={() => startRenameNode(actualId, title)}>
            重命名
          </Button>
        ),
      },
      {
        key: "copy",
        label: (
          <Button
            type="text"
            size="small"
            disabled={!canCreateCase}
            onClick={() => {
              if (!canCreateCase) return;
              if (actualId && actualId !== "all") {
                setCopyingModule({ id: actualId, name: title });
              }
            }}
          >
            复制
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
            disabled={!canDeleteCase}
            onClick={() => confirmDeleteNode(nodeId || "all", title)}
          >
            删除
          </Button>
        ),
      },
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
          {repositoryId && (
            <Dropdown trigger={["hover"]} menu={{ items }}>
              <Button
                type="text"
                icon={<EllipsisOutlined />}
                size="small"
                className="opacity-0 transition-opacity group-hover:opacity-100"
              ></Button>
            </Dropdown>
          )}
        </div>
      </div>
    );
  };
  const renderCreatingInput = (parentId: string | "all") => (
    <ModuleInput placeholder="请输入模块名称" onCommit={(val) => handleCreateBlurOrEnter(parentId, val)} />
  );

  // 新增：递归构建树节点，任意层级都支持插入“添加”的临时输入框
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
                icon: <PlusOutlined />,
                selectable: false, // 防止选中临时输入节点
              },
            ]
          : [];
      return {
        title: renderNodeTitle(node?.name ?? "-", getNodeCount(node), nodeId),
        key: nodeId,
        icon: <AppstoreOutlined />,
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

  const treeData = [
    {
      // 修改：根节点“全部用例”仅显示添加，不显示删除
      title: (
        <div className="group flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center text-secondary">
              <AppstoreOutlined />
            </span>
            <span className="text-sm font-medium text-primary">全部用例</span>
          </div>
          <div className="flex items-center gap-2">
            {typeof total === "number" && <span className="text-xs text-secondary">{allTotal}</span>}
            {repositoryId && (
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
                          disabled={!canCreateCase}
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
                ></Button>
              </Dropdown>
            )}
          </div>
        </div>
      ),
      key: "all",
      icon: <AppstoreOutlined />,
      children: [
        ...(creatingParentId === "all"
          ? [
              {
                title: renderCreatingInput("all"),
                key: "__creating__root",
                icon: <PlusOutlined />,
                selectable: false, // 防止选中根下临时输入节点
              },
            ]
          : []),
        // 递归构建所有模块与子模块（任意层级）
        ...buildTreeNodes(filteredModules),
      ],
    },
  ];

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
      {!isTemplateMode && (
        <button
          type="button"
          onClick={() => {
            if (!repositoryId || !canCreateCase) return;
            setIsTemplateImportOpen(true);
          }}
          disabled={!repositoryId || !canCreateCase}
          className="flex items-center justify-center gap-1.5 rounded border border-accent-strong bg-transparent px-3 py-1.5 text-xs font-medium whitespace-nowrap text-accent-primary transition-all hover:bg-accent-subtle focus:bg-accent-subtle-hover focus:text-accent-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          从模板导入
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
            <Col
              className="relative flex h-full flex-col border-r border-subtle"
              flex="0 0 auto"
              style={{ width: leftWidth, minWidth: 200, maxWidth: 300 }}
            >
              <div
                onMouseDown={onMouseDownResize}
                className="absolute top-0 right-0 h-full w-2"
                style={{ cursor: "col-resize", zIndex: 10 }}
              />
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
              <div className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto pt-3">
                <Tree
                  showLine={false}
                  defaultExpandAll
                  switcherIcon={(nodeProps) => (
                    <span className="inline-flex h-5 w-5 items-center justify-center text-secondary">
                      <ChevronDownIcon className={`size-4 rotate-0 transition-transform`} strokeWidth={2.5} />
                    </span>
                  )}
                  onSelect={onSelect}
                  onExpand={onExpand}
                  expandedKeys={expandedKeys}
                  autoExpandParent={autoExpandParent}
                  treeData={treeData}
                  selectedKeys={selectedModuleId ? [selectedModuleId] : ["all"]}
                  className="custom-tree-indent py-2 pl-2"
                />
              </div>
            </Col>
            {/* 右侧表格 */}
            <Col flex="auto" className="h-full overflow-hidden">
              <div className="flex h-full flex-col">
                {useExternalToolbar && toolbarPortalEl && createPortal(toolbarActions, toolbarPortalEl)}
                {(headerLeft || !useExternalToolbar) && (
                  <div className="flex flex-shrink-0 items-center justify-between px-3 pt-2 pb-2 sm:pt-2">
                    <div>{headerLeft}</div>
                    {!useExternalToolbar && toolbarActions}
                  </div>
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
                          renderPriorityTag={(value) => renderEnumTag("case_priority", value, "warning")}
                          renderUpdatedAt={(value) => formatDateTime(value || "")}
                        />
                      </div>
                      <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-4 py-3">
                        <div className="flex items-center gap-4 text-sm">
                          {selectedCaseIds.length > 0 && (
                            <div className="flex items-center gap-2">
                              <span className="text-secondary">已选择 {selectedCaseIds.length} 条</span>
                              <span
                                className="cursor-pointer text-sm transition-colors"
                                style={{ color: "#2a83ff" }}
                                onClick={() => setSelectedCaseIds([])}
                              >
                                清除选择
                              </span>
                              <span
                                className={`text-sm transition-colors ${
                                  canEditCase ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                                }`}
                                style={{ color: "#2a83ff" }}
                                onClick={() => {
                                  if (!canEditCase) return;
                                  setIsMoveModalOpen(true);
                                }}
                              >
                                移动到
                              </span>
                              <span
                                className={`text-sm transition-colors ${
                                  canCreateCase ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                                }`}
                                style={{ color: "#2a83ff" }}
                                onClick={() => {
                                  if (!canCreateCase) return;
                                  setIsCopyModalOpen(true);
                                }}
                              >
                                复制到
                              </span>
                              <span
                                className={`text-sm transition-colors ${
                                  canDeleteCase ? "cursor-pointer" : "cursor-not-allowed opacity-50"
                                }`}
                                style={{ color: "#ff4d4f" }}
                                onClick={confirmDeleteCases}
                              >
                                删除
                              </span>
                            </div>
                          )}
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
    </>
  );
};
