"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHead } from "@/components/core/page-title";
import { Breadcrumbs } from "@plane/ui";
import { Button as PlaneButton } from "@plane/propel/button";
import PlanCasesModal from "@/components/qa/plans/plan-cases-modal";
import PlanPlanningModal, { type TPlanPlanningTab } from "@/components/qa/plans/plan-planning-modal";
import PlanCasesExportModal from "@/components/qa/plans/plan-cases-export-modal";
import PlanCasesCopyModal from "@/components/qa/plans/copy-to-plan-modal";
import UpdateModal from "@/components/qa/cases/update-modal";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { message, Dropdown, Pagination, Select } from "antd";
import { CaseService } from "@/services/qa/case.service";
import {
  PLAN_CASE_ENUM_GROUP_QUERY_PARAM,
  PlanService,
  getPlanReviewRuleLabel,
  isPlanCaseEnumGroupBy,
  type TPlanCaseItem,
  type TPlanListItem,
} from "@/services/qa/plan.service";
import { formatDateTime, globalEnums } from "../util";
import { useUser } from "@/hooks/store/user";
import { useTranslation } from "@plane/i18n";
import {
  qaCaseErrorContent,
  qaCaseSetToastError,
  qaCaseSetToastSuccess,
  qaCaseSetToastWarning,
} from "@/utils/qa-case-error";
import { ChevronDownIcon } from "@plane/propel/icons";
import { useProjectPermissions } from "@/hooks/store/use-project-permissions";
import { CasesSearchInput } from "@/components/qa/cases/cases-search";
import { PlanCaseFiltersInline } from "@/components/qa/plans/plan-case-filters-inline";
import { FiltersToggle } from "@/components/rich-filters/filters-toggle";
import {
  DEFAULT_PLAN_CASE_DISPLAY_PROPERTIES,
  DEFAULT_PLAN_CASE_GROUP_BY,
  PlanCaseDisplayFilters,
  type TPlanCaseDisplayProperties,
  type TPlanCaseGroupBy,
  type TPlanCaseOrderBy,
} from "@/components/qa/plans/plan-case-display-filters";
import { PlanCaseAssigneeTree } from "@/components/qa/plans/plan-case-assignee-tree";
import { PlanCasePriorityBadge } from "@/components/qa/plans/plan-case-priority-badge";
import { PlanCaseRailTree, type TPlanCaseRailTreeNode } from "@/components/qa/plans/plan-case-rail-tree";
import { PlanCasesBulkBar } from "@/components/qa/plans/plan-cases-bulk-bar";
import { usePlanAssigneeTree } from "@/components/qa/plans/use-plan-assignee-tree";
import { PlanCaseGroupTree } from "@/components/qa/plans/plan-case-group-tree";
import { usePlanGroupTree } from "@/components/qa/plans/use-plan-group-tree";
import { PlanCasesTable } from "@/components/qa/plans/plan-cases-table";
import { PlanCaseResultTag, PlanCaseReviewStatusTag } from "@/components/qa/plans/plan-case-tags";
import { PlanCaseReviewModal } from "@/components/qa/plans/plan-case-review-modal";
import { usePlanCaseReview } from "@/components/qa/plans/use-plan-case-review";
import {
  planCaseExpressionToQueryParams,
  type TPlanCaseFilterQueryParams,
} from "@/components/qa/plans/plan-case-list-filters/expression-to-query";
import { usePlanCaseFilter } from "@/components/qa/plans/plan-case-list-filters/use-plan-case-filter";
import { usePlanCaseFiltersConfig } from "@/components/qa/plans/plan-case-list-filters/use-plan-case-filters-config";
import type { TPlanCaseFilterExpression } from "@/components/qa/plans/plan-case-list-filters/types";
import type { TPlanCaseFilterSelectOption } from "@/components/qa/plans/plan-case-list-filters/use-plan-case-filters-config";

const QA_PLAN_EDIT_PERMISSION_KEY = "qa.plan.edit" as const;

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
  module?: string;
  repository_name?: string;
  assignee?: { id?: string } | null;
};
type TPlanCaseListFilters = {
  search?: string;
} & TPlanCaseFilterQueryParams;

const EMPTY_PLAN_CASE_FILTER_EXPRESSION: TPlanCaseFilterExpression = {};
const DEFAULT_PLAN_CASE_ORDERING: TPlanCaseOrderBy = "-case__updated_at";
const toStringArray = (value: unknown): string[] => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

type TModuleTreeNodeMeta = { kind: string; repositoryId: string | null; moduleId: string | null };

function getTreeNodeKey(node: any): string {
  const kind = String(node?.kind || "");
  const id = String(node?.id || "");
  const nodeRepositoryId = node?.repository_id ? String(node.repository_id) : null;

  if (kind === "root") return "root";
  if (kind === "repository") return `repo:${id}`;
  if (kind === "repository_modules_all") return `repo:${nodeRepositoryId}:all_modules`;
  if (kind === "module") return `module:${id}`;
  return id;
}

export default function PlanCasesPage() {
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const planId = searchParams.get("planId");
  const repositoryIdFromUrl = searchParams.get("repositoryId");
  const repositoryId =
    repositoryIdFromUrl || (typeof window !== "undefined" ? sessionStorage.getItem("selectedRepositoryId") : null);
  const repositoryName = typeof window !== "undefined" ? sessionStorage.getItem("selectedRepositoryName") : "";
  const Enums = globalEnums.Enums;

  const planService = useRef(new PlanService()).current;
  const caseService = useRef(new CaseService()).current;
  const { data: currentUser } = useUser();
  const { fetched: permissionsFetched, hasPermission } = useProjectPermissions(
    String(workspaceSlug || ""),
    String(projectId || "")
  );
  const canEditPlan = permissionsFetched && hasPermission(QA_PLAN_EDIT_PERMISSION_KEY);

  const [expandedKeys, setExpandedKeys] = useState<string[] | undefined>(undefined);
  const [selectedTreeKey, setSelectedTreeKey] = useState<string>("root");
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [planTree, setPlanTree] = useState<any | null>(null);
  // 分组方式：每次进入页面都回到默认「模块」，不做持久化
  const [groupBy, setGroupBy] = useState<TPlanCaseGroupBy>(DEFAULT_PLAN_CASE_GROUP_BY);
  // 执行人分组下左树的选中项：用户 id 或 "unassigned"
  const [selectedAssigneeKey, setSelectedAssigneeKey] = useState<string | null>(null);
  const {
    tree: assigneeTree,
    loading: assigneeTreeLoading,
    refresh: refreshAssigneeTree,
  } = usePlanAssigneeTree({
    workspaceSlug: workspaceSlug ? String(workspaceSlug) : undefined,
    planId,
    enabled: groupBy === "assignee",
  });
  // 类型/优先级/执行结果分组下左树的选中值（枚举值字符串），null 表示「全部」
  const [selectedGroupValue, setSelectedGroupValue] = useState<string | null>(null);
  const {
    tree: groupTree,
    loading: groupTreeLoading,
    refresh: refreshGroupTree,
  } = usePlanGroupTree({
    workspaceSlug: workspaceSlug ? String(workspaceSlug) : undefined,
    planId,
    groupBy,
  });

  const [cases, setCases] = useState<TPlanCaseItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [ordering, setOrdering] = useState<TPlanCaseOrderBy>(DEFAULT_PLAN_CASE_ORDERING);
  const [filters, setFilters] = useState<TPlanCaseListFilters>({});
  const [filterExpression, setFilterExpression] = useState<TPlanCaseFilterExpression>(
    EMPTY_PLAN_CASE_FILTER_EXPRESSION
  );
  const [planCaseDisplayProperties, setPlanCaseDisplayProperties] = useState<TPlanCaseDisplayProperties>(() => ({
    ...DEFAULT_PLAN_CASE_DISPLAY_PROPERTIES,
  }));
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});

  const [activeCase, setActiveCase] = useState<TestCase | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isPlanningModalOpen, setIsPlanningModalOpen] = useState(false);
  const [planningTab, setPlanningTab] = useState<TPlanPlanningTab>("cycle");
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  // 选中行的快照：批量执行要 case_id 与执行人，批量复核还要执行结果，跨页选择时当前页拿不到行数据
  const [selectedPlanCaseMetaMap, setSelectedPlanCaseMetaMap] = useState<
    Record<string, { caseId?: string; assignee: string | null; result?: string; name?: string }>
  >({});
  const [bulkExecuteLoading, setBulkExecuteLoading] = useState<boolean>(false);
  const [bulkAssigneeUpdating, setBulkAssigneeUpdating] = useState<boolean>(false);

  const [planList, setPlanList] = useState<TPlanListItem[]>([]);
  const [planListLoading, setPlanListLoading] = useState<boolean>(false);
  const currentPlan = useMemo(() => planList.find((p) => String(p.id) === String(planId)), [planList, planId]);

  const caseTypeEnums = useMemo(
    () =>
      Object.fromEntries(
        Object.entries((Enums as any)?.case_type || {}).map(([value, label]) => [String(value), String(label)])
      ) as Record<string, string>,
    [Enums]
  );
  const casePriorityEnums = useMemo(
    () =>
      Object.fromEntries(
        Object.entries((Enums as any)?.case_priority || {}).map(([value, label]) => [String(value), String(label)])
      ) as Record<string, string>,
    [Enums]
  );
  const planCaseResultEnums = useMemo(
    () =>
      Object.fromEntries(
        Object.entries((Enums as any)?.plan_case_result || {}).map(([value, color]) => [String(value), String(color)])
      ) as Record<string, string>,
    [Enums]
  );

  const planCaseReviewStatusEnums = useMemo(
    () =>
      Object.fromEntries(
        Object.entries((Enums as any)?.plan_case_review_status || {}).map(([value, color]) => [
          String(value),
          String(color),
        ])
      ) as Record<string, string>,
    [Enums]
  );

  const { repositoryFilterOptions, moduleFilterOptions, moduleDescendantIdsMap } = useMemo(() => {
    const repositoryMap = new Map<string, TPlanCaseFilterSelectOption>();
    const moduleMap = new Map<string, TPlanCaseFilterSelectOption>();
    const moduleChildrenMap = new Map<string, string[]>();

    const walk = (node: any, repositoryLabel = "", modulePath: string[] = [], parentModuleId?: string) => {
      const kind = String(node?.kind || "");
      const id = node?.id ? String(node.id) : "";
      const name = String(node?.name || "-");
      const children = Array.isArray(node?.children) ? node.children : [];

      if (kind === "repository" && id) {
        repositoryMap.set(id, { id, value: id, label: name });
        children.forEach((child: any) => walk(child, name, []));
        return;
      }

      if (kind === "repository_modules_all") {
        children.forEach((child: any) => walk(child, repositoryLabel, [], parentModuleId));
        return;
      }

      if (kind === "module" && id) {
        if (parentModuleId) {
          const siblings = moduleChildrenMap.get(parentModuleId) ?? [];
          moduleChildrenMap.set(parentModuleId, [...siblings, id]);
        }

        const nextPath = [...modulePath, name];
        moduleMap.set(id, {
          id,
          value: id,
          label: [repositoryLabel, ...nextPath].filter(Boolean).join(" / "),
        });
        children.forEach((child: any) => walk(child, repositoryLabel, nextPath, id));
        return;
      }

      children.forEach((child: any) => walk(child, repositoryLabel, modulePath, parentModuleId));
    };

    if (planTree) walk(planTree);

    const descendantsMap = new Map<string, string[]>();
    const collectDescendants = (moduleId: string): string[] => {
      if (descendantsMap.has(moduleId)) return descendantsMap.get(moduleId) ?? [moduleId];
      const descendants = [moduleId];
      (moduleChildrenMap.get(moduleId) ?? []).forEach((childId) => {
        descendants.push(...collectDescendants(childId));
      });
      const uniqueDescendants = Array.from(new Set(descendants));
      descendantsMap.set(moduleId, uniqueDescendants);
      return uniqueDescendants;
    };

    moduleMap.forEach((_, moduleId) => collectDescendants(moduleId));

    return {
      repositoryFilterOptions: Array.from(repositoryMap.values()),
      moduleFilterOptions: Array.from(moduleMap.values()),
      moduleDescendantIdsMap: descendantsMap,
    };
  }, [planTree]);

  const selectionContextKey = useMemo(() => {
    return JSON.stringify({
      planId,
      groupBy,
      selectedRepositoryId,
      selectedModuleId,
      selectedAssigneeKey,
      ordering,
      filters,
      filterExpression,
    });
  }, [planId, groupBy, selectedRepositoryId, selectedModuleId, selectedAssigneeKey, ordering, filters, filterExpression]);
  const lastSelectionContextKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastSelectionContextKeyRef.current !== null && lastSelectionContextKeyRef.current !== selectionContextKey) {
      setSelectedCaseIds([]);
      setSelectedPlanCaseMetaMap({});
    }
    lastSelectionContextKeyRef.current = selectionContextKey;
  }, [selectionContextKey]);

  const dropdownItems = [
    { key: "by_iteration", label: "通过迭代规划" },
    { key: "by_release", label: "通过发布规划" },
  ];

  useEffect(() => {
    if (!workspaceSlug || !planId) return;
    setLoading(true);
    fetchPlanTree();
    fetchCases(1, pageSize, { repositoryId: null, moduleId: null, assigneeKey: null });
    setSelectedTreeKey("root");
    setSelectedRepositoryId(null);
    setSelectedModuleId(null);
    setSelectedAssigneeKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, planId]);

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    setPlanListLoading(true);
    planService
      .getPlanList(String(workspaceSlug), { project_id: String(projectId) })
      .then((data) => setPlanList(Array.isArray(data) ? data : []))
      .catch(() => setPlanList([]))
      .finally(() => setPlanListLoading(false));
  }, [workspaceSlug, projectId, planService]);

  const onChangePlan = (nextPlanId: string) => {
    const found = planList.find((p) => String(p.id) === String(nextPlanId));
    if (typeof window !== "undefined") {
      if (found?.name) sessionStorage.setItem("selectedPlanName", String(found.name));
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("planId", String(nextPlanId));
    router.push(`/${workspaceSlug}/projects/${projectId}/testhub/plan-cases?${params.toString()}`);
  };

  const fetchPlanTree = async () => {
    if (!workspaceSlug || !planId) return;
    try {
      const data = await caseService.getPlanCaseTree(String(workspaceSlug), { plan_id: String(planId) });
      setPlanTree(data || null);
      setExpandedKeys(data ? collectDefaultExpandedKeys(data) : undefined);
    } catch {}
  };

  const expandModuleIds = (moduleIds: string[]): string[] => {
    const expanded = new Set<string>();
    moduleIds.forEach((moduleId) => {
      const descendants = moduleDescendantIdsMap.get(String(moduleId));
      if (descendants && descendants.length > 0) {
        descendants.forEach((id) => expanded.add(String(id)));
      } else if (moduleId) {
        expanded.add(String(moduleId));
      }
    });
    return Array.from(expanded);
  };

  const getEffectiveModuleIds = (treeModuleId?: string | null, filterModuleIdsCsv?: string): string[] => {
    const treeModuleIds = treeModuleId ? expandModuleIds([treeModuleId]) : [];
    const filterModuleIds = filterModuleIdsCsv ? expandModuleIds(toStringArray(filterModuleIdsCsv)) : [];

    if (treeModuleIds.length > 0 && filterModuleIds.length > 0) {
      const filterSet = new Set(filterModuleIds);
      const intersection = treeModuleIds.filter((moduleId) => filterSet.has(moduleId));
      return intersection.length > 0 ? intersection : ["00000000-0000-0000-0000-000000000000"];
    }

    return treeModuleIds.length > 0 ? treeModuleIds : filterModuleIds;
  };

  const fetchCases = async (
    page: number = currentPage,
    size: number = pageSize,
    options?: {
      assigneeKey?: string | null;
      filtersParam?: TPlanCaseListFilters;
      groupValue?: string | null;
      moduleId?: string | null;
      orderingParam?: TPlanCaseOrderBy | null;
      repositoryId?: string | null;
    }
  ) => {
    if (!workspaceSlug || !planId) return;
    try {
      setLoading(true);
      setError(null);
      const hasRepositoryOverride = Object.prototype.hasOwnProperty.call(options || {}, "repositoryId");
      const hasModuleOverride = Object.prototype.hasOwnProperty.call(options || {}, "moduleId");
      const hasAssigneeOverride = Object.prototype.hasOwnProperty.call(options || {}, "assigneeKey");
      const hasGroupValueOverride = Object.prototype.hasOwnProperty.call(options || {}, "groupValue");
      const effectiveRepositoryId = hasRepositoryOverride ? options?.repositoryId : selectedRepositoryId;
      const effectiveModuleId = hasModuleOverride ? options?.moduleId : selectedModuleId;
      const effectiveAssigneeKey = hasAssigneeOverride ? options?.assigneeKey : selectedAssigneeKey;
      const effectiveGroupValue = hasGroupValueOverride ? options?.groupValue : selectedGroupValue;
      const effectiveOrdering = options?.orderingParam === undefined ? ordering : (options.orderingParam ?? undefined);
      const effectiveFilters = options?.filtersParam ?? filters;
      const { search, case__module_id__in: moduleFilter, ...filterParams } = effectiveFilters;
      const effectiveModuleIds = getEffectiveModuleIds(effectiveModuleId, moduleFilter);

      const params: any = {
        page,
        page_size: size,
        plan_id: planId,
        ...filterParams,
      };

      if (search) params.search = search;
      if (effectiveRepositoryId) params["case__repository_id"] = effectiveRepositoryId;
      if (effectiveModuleIds.length > 0) params["case__module_id__in"] = effectiveModuleIds.join(",");
      if (effectiveOrdering) params.ordering = effectiveOrdering;
      // 执行人分组的树选择：exact 过滤与富过滤器的 assignee_id__in 由后端 AND 组合，天然取交集
      if (effectiveAssigneeKey === "unassigned") params.assignee_isnull = true;
      else if (effectiveAssigneeKey) params.assignee_id = effectiveAssigneeKey;
      // 类型/优先级/执行结果分组的树选择：同样是 exact 过滤，与富过滤器的 __in 条件由后端 AND 组合
      if (isPlanCaseEnumGroupBy(groupBy) && effectiveGroupValue != null)
        params[PLAN_CASE_ENUM_GROUP_QUERY_PARAM[groupBy]] = effectiveGroupValue;

      const response = await planService.getPlanCases(workspaceSlug as string, params);
      setCases(response?.data || []);
      setTotal(response?.count || 0);
      setCurrentPage(page);
      setPageSize(size);
    } catch (e: unknown) {
      const fallback = "用例加载失败";
      setError(qaCaseErrorContent(e, t, fallback));
      qaCaseSetToastError(e, t, fallback);
    } finally {
      setLoading(false);
    }
  };

  const handleModuleTreeSelect = (key: string) => {
    setSelectedTreeKey(key);
    const meta = moduleTreeNodeMetaMap.get(key);
    const kind = meta?.kind;

    if (!kind || kind === "root") {
      setSelectedRepositoryId(null);
      setSelectedModuleId(null);
      fetchCases(1, pageSize, { repositoryId: null, moduleId: null });
      return;
    }

    if (kind === "repository" || kind === "repository_modules_all") {
      setSelectedRepositoryId(meta.repositoryId);
      setSelectedModuleId(null);
      fetchCases(1, pageSize, { repositoryId: meta.repositoryId, moduleId: null });
      return;
    }

    if (kind === "module") {
      setSelectedRepositoryId(meta.repositoryId);
      setSelectedModuleId(meta.moduleId);
      fetchCases(1, pageSize, { repositoryId: meta.repositoryId, moduleId: meta.moduleId });
    }
  };

  const handlePaginationChange = (page: number, size?: number) => {
    const nextSize = size || pageSize;
    const nextPage = nextSize !== pageSize ? 1 : page;
    fetchCases(nextPage, nextSize);
  };

  const handleSortChange = (nextOrdering: TPlanCaseOrderBy) => {
    setOrdering(nextOrdering);
    fetchCases(1, pageSize, { orderingParam: nextOrdering });
  };

  const handleDisplayPropertiesUpdate = (updatedDisplayProperties: Partial<TPlanCaseDisplayProperties>) => {
    setPlanCaseDisplayProperties((prev) => ({ ...prev, ...updatedDisplayProperties }));
  };

  // 模块树始终要刷（富过滤器的用例库/模块选项依赖它）；执行人树 / 枚举分组树在未启用时 refresh 为 no-op
  const refreshGroupTrees = () => Promise.all([fetchPlanTree(), refreshAssigneeTree(), refreshGroupTree()]);

  const handleGroupByChange = (nextGroupBy: TPlanCaseGroupBy) => {
    if (nextGroupBy === groupBy) return;
    setGroupBy(nextGroupBy);
    setSelectedTreeKey("root");
    setSelectedRepositoryId(null);
    setSelectedModuleId(null);
    setSelectedAssigneeKey(null);
    setSelectedGroupValue(null);
    fetchCases(1, pageSize, { repositoryId: null, moduleId: null, assigneeKey: null, groupValue: null });
  };

  const handleAssigneeTreeSelect = (key: string) => {
    setSelectedTreeKey(key);
    const nextAssigneeKey = key === "root" ? null : key === "unassigned" ? "unassigned" : key.replace(/^assignee:/, "");
    setSelectedAssigneeKey(nextAssigneeKey);
    fetchCases(1, pageSize, { assigneeKey: nextAssigneeKey });
  };

  const handleGroupTreeSelect = (key: string) => {
    setSelectedTreeKey(key);
    // key 形如 "<kind>:<枚举值>"；执行结果的枚举值是中文，不含冒号，取首个冒号后的整段即可
    const nextGroupValue = key === "root" ? null : key.slice(key.indexOf(":") + 1);
    setSelectedGroupValue(nextGroupValue);
    fetchCases(1, pageSize, { groupValue: nextGroupValue });
  };

  const handleRichFiltersChange = (expression: TPlanCaseFilterExpression) => {
    const nextFilters: TPlanCaseListFilters = {
      ...(filters.search ? { search: filters.search } : {}),
      ...planCaseExpressionToQueryParams(expression),
    };
    setFilterExpression(expression);
    setFilters(nextFilters);
    fetchCases(1, pageSize, { filtersParam: nextFilters });
  };

  const { areAllConfigsInitialized, configs: planCaseFilterConfigs } = usePlanCaseFiltersConfig({
    casePriorityEnums,
    caseTypeEnums,
    moduleOptions: moduleFilterOptions,
    planCaseResultEnums,
    planCaseReviewStatusEnums,
    projectId: String(projectId || ""),
    repositoryOptions: repositoryFilterOptions,
    workspaceSlug: String(workspaceSlug || ""),
  });

  const planCaseFilter = usePlanCaseFilter({
    areAllConfigsInitialized,
    configs: planCaseFilterConfigs,
    initialExpression: filterExpression,
    instanceKey: `plan-case-list-${workspaceSlug || "workspace"}-${projectId || "project"}-${planId || "plan"}`,
    onExpressionChange: handleRichFiltersChange,
  });

  const [leftWidth, setLeftWidth] = useState<number>(260);
  const isDraggingRef = useRef<boolean>(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);
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
    const next = Math.min(320, Math.max(200, startWidthRef.current + (e.clientX - startXRef.current)));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  function collectDefaultExpandedKeys(node: any): string[] {
    const keys = new Set<string>();
    const visit = (n: any) => {
      const kind = String(n?.kind || "");
      if (kind === "root" || kind === "repository" || kind === "repository_modules_all") {
        keys.add(getTreeNodeKey(n));
      }
      const children = Array.isArray(n?.children) ? n.children : [];
      children.forEach(visit);
    };
    visit(node);
    return Array.from(keys);
  }

  // 左栏模块树：「全部模块」这一层不单独显示，子模块直接挂在用例库下；每个节点带计划用例数
  const moduleRailNodes = useMemo<TPlanCaseRailTreeNode[]>(() => {
    if (!planTree) return [];
    const build = (node: any): TPlanCaseRailTreeNode => {
      const children: any[] = Array.isArray(node?.children) ? node.children : [];
      const visibleChildren = children.flatMap((child) =>
        String(child?.kind || "") === "repository_modules_all"
          ? Array.isArray(child?.children)
            ? child.children
            : []
          : [child]
      );
      return {
        key: getTreeNodeKey(node),
        label: node?.name ?? "-",
        count: typeof node?.count === "number" ? node.count : undefined,
        children: visibleChildren.map(build),
      };
    };
    return [build(planTree)];
  }, [planTree]);

  const moduleTreeNodeMetaMap = useMemo(() => {
    const map = new Map<string, TModuleTreeNodeMeta>();
    const visit = (node: any) => {
      const kind = String(node?.kind || "");
      map.set(getTreeNodeKey(node), {
        kind,
        repositoryId: node?.repository_id ? String(node.repository_id) : null,
        moduleId: kind === "module" && node?.id ? String(node.id) : null,
      });
      (Array.isArray(node?.children) ? node.children : []).forEach(visit);
    };
    if (planTree) visit(planTree);
    return map;
  }, [planTree]);

  const onCancelRelation = async (ids: string | string[]) => {
    if (!workspaceSlug || !planId) return;
    try {
      await planService.cancelPlanCase(String(workspaceSlug), String(projectId), ids);
      if (Array.isArray(ids)) {
        setSelectedCaseIds([]);
        setSelectedPlanCaseMetaMap({});
      }
      await refreshGroupTrees();
      await fetchCases(1, pageSize);
      qaCaseSetToastSuccess("取消关联成功");
    } catch (e: unknown) {
      const fallback = "取消关联失败";
      qaCaseSetToastError(e, t, fallback);
    }
  };

  const getSuccessResultLabel = () => {
    const map = (Enums as any)?.plan_case_result || {};
    const keys = Object.keys(map);
    if (keys.includes("通过")) return "通过";
    if (keys.includes("成功")) return "成功";
    return keys.find((key) => key !== "未执行") ?? "通过";
  };

  const handleOpenCaseDetail = (caseId?: string) => {
    if (!caseId) {
      qaCaseSetToastWarning("缺少用例信息，无法打开");
      return;
    }
    setActiveCase({ id: caseId, name: "" });
    setIsUpdateModalOpen(true);
  };

  const onBulkExecuteSelected = async () => {
    if (!workspaceSlug || !planId) return;
    if (!currentUser?.id) {
      message.warning("缺少用户信息，无法提交执行结果");
      return;
    }
    const currentUserId = String(currentUser.id);
    const unauthorizedPlanCases = selectedCaseIds.filter(
      (planCaseId) => String(selectedPlanCaseMetaMap[String(planCaseId)]?.assignee ?? "") !== currentUserId
    );
    if (unauthorizedPlanCases.length > 0) {
      message.warning("选中用例中包含非本人执行项或未设置执行人的项，请调整后重试");
      return;
    }
    const caseIds = Array.from(
      new Set(selectedCaseIds.map((planCaseId) => selectedPlanCaseMetaMap[String(planCaseId)]?.caseId).filter(Boolean))
    );
    if (caseIds.length === 0) {
      message.warning("未找到选中用例的 case_id");
      return;
    }

    setBulkExecuteLoading(true);
    const successLabel = getSuccessResultLabel();
    try {
      const payload: any = {
        plan_id: String(planId),
        case_id: caseIds.map(String),
        result: successLabel,
        assignee: String(currentUser.id),
        issue_ids: [],
      };
      await planService.caseExecute(String(workspaceSlug), payload);
      message.success("批量执行结果提交成功");
      setSelectedCaseIds([]);
      setSelectedPlanCaseMetaMap({});
      await refreshGroupTrees();
      await fetchCases(currentPage, pageSize);
    } catch (e: any) {
      const msg = e?.message || e?.detail || e?.error || "批量提交结果失败";
      message.error(msg);
    } finally {
      setBulkExecuteLoading(false);
    }
  };

  const handlePlanCaseAssigneeChange = async (planCaseId: string, assignee: string | null) => {
    if (!workspaceSlug || !projectId) return;
    const id = String(planCaseId);
    const nextAssignee = assignee ? String(assignee) : null;
    const previousAssignee = (cases || []).find((item) => String(item.id) === id)?.assignee ?? null;
    const applyLocalAssignee = (value: string | null) => {
      setCases((prev) =>
        (prev || []).map((item) => (String(item.id) === id ? Object.assign({}, item, { assignee: value }) : item))
      );
      setSelectedPlanCaseMetaMap((prev) =>
        prev[id] ? { ...prev, [id]: { ...prev[id], assignee: value } } : prev
      );
    };
    // 先乐观更新，失败再回滚
    applyLocalAssignee(nextAssignee);
    try {
      await planService.updatePlanCaseAssignee(String(workspaceSlug), String(projectId), {
        plan_case_id: id,
        assignee: nextAssignee,
      });
      qaCaseSetToastSuccess("执行人已更新");
      void refreshAssigneeTree();
      // 左树选中了某执行人/未分配时，行的归属可能已变化，按当前筛选重取
      if (selectedAssigneeKey) fetchCases(currentPage, pageSize);
    } catch (e: unknown) {
      applyLocalAssignee(previousAssignee);
      qaCaseSetToastError(e, t, "更新执行人失败");
    }
  };

  // 批量分配：选中行的执行人统一覆盖为所选人员
  const handleBulkPlanCaseAssigneeChange = async (assignee: string) => {
    if (!workspaceSlug || !projectId) return;
    const targetPlanCaseIds = Array.from(new Set((selectedCaseIds || []).map((id) => String(id))));
    if (targetPlanCaseIds.length === 0) {
      qaCaseSetToastWarning("请先选择用例");
      return;
    }

    try {
      setBulkAssigneeUpdating(true);
      const settledResults = await Promise.allSettled(
        targetPlanCaseIds.map((planCaseId) =>
          planService.updatePlanCaseAssignee(String(workspaceSlug), String(projectId), {
            plan_case_id: String(planCaseId),
            assignee,
          })
        )
      );

      const successPlanCaseIds: string[] = [];
      const failedErrors: unknown[] = [];
      settledResults.forEach((result, idx) => {
        if (result.status === "fulfilled") {
          successPlanCaseIds.push(targetPlanCaseIds[idx]);
        } else {
          failedErrors.push(result.reason);
        }
      });

      if (successPlanCaseIds.length > 0) {
        const successIdSet = new Set(successPlanCaseIds.map((id) => String(id)));
        const nextAssignee = String(assignee);

        setCases((prev) =>
          (prev || []).map((item) =>
            successIdSet.has(String(item.id)) ? Object.assign({}, item, { assignee: nextAssignee }) : item
          )
        );
        setSelectedPlanCaseMetaMap((prev) => {
          const next = { ...prev };
          successPlanCaseIds.forEach((planCaseId) => {
            const key = String(planCaseId);
            if (next[key]) next[key] = { ...next[key], assignee: nextAssignee };
          });
          return next;
        });
      }

      if (failedErrors.length === 0) {
        qaCaseSetToastSuccess("批量更新执行人成功");
      } else if (successPlanCaseIds.length > 0) {
        message.warning(`已更新 ${successPlanCaseIds.length} 条，${failedErrors.length} 条失败`);
      } else {
        qaCaseSetToastError(failedErrors[0], t, "批量更新执行人失败");
      }

      if (successPlanCaseIds.length > 0) {
        void refreshAssigneeTree();
        if (selectedAssigneeKey) fetchCases(currentPage, pageSize);
      }
    } catch (e: unknown) {
      qaCaseSetToastError(e, t, "批量更新执行人失败");
    } finally {
      setBulkAssigneeUpdating(false);
    }
  };

  const handleRowSelectChange = (selectedKeysOnCurrentPage: string[]) => {
    const currentPageIds = (cases || []).map((row) => String(row.id));

    setSelectedCaseIds((prev) => {
      const next = new Set(prev.map((key) => String(key)));
      currentPageIds.forEach((id) => next.delete(id));
      selectedKeysOnCurrentPage.forEach((id) => next.add(String(id)));
      return Array.from(next);
    });

    const currentPageSelected = new Set(selectedKeysOnCurrentPage.map((id) => String(id)));

    setSelectedPlanCaseMetaMap((prev) => {
      const next = { ...prev };
      currentPageIds.forEach((planCaseId) => {
        if (!currentPageSelected.has(planCaseId)) delete next[planCaseId];
      });
      currentPageSelected.forEach((planCaseId) => {
        const row = (cases || []).find((item) => String(item.id) === planCaseId);
        next[planCaseId] = {
          caseId: row?.case?.id ? String(row.case.id) : undefined,
          assignee: row?.assignee ? String(row.assignee) : null,
          result: row?.result,
          name: row?.case?.name,
        };
      });
      return next;
    });
  };

  // 复核权限：当前用户在该计划的复核人名单里才能复核
  const isCurrentUserPlanReviewer = Boolean(
    currentUser?.id && (currentPlan?.reviewers ?? []).map(String).includes(String(currentUser.id))
  );

  const planReviewRuleLabel = getPlanReviewRuleLabel(currentPlan);

  const planCaseReview = usePlanCaseReview({
    workspaceSlug: workspaceSlug ? String(workspaceSlug) : undefined,
    projectId: projectId ? String(projectId) : undefined,
    planId,
    onReviewed: (statuses) => {
      // 多人复核时本次投票未必就是最终状态，用后端按规则折算的结果回填
      setCases((prev) =>
        (prev || []).map((item) =>
          statuses[String(item.id)] ? Object.assign({}, item, { review_status: statuses[String(item.id)] }) : item
        )
      );
      void refreshGroupTree();
      // 正按复核状态分组时，行的归属已变化，按当前筛选重取
      if (groupBy === "review_status" && selectedGroupValue) fetchCases(currentPage, pageSize);
      setSelectedCaseIds([]);
      setSelectedPlanCaseMetaMap({});
    },
  });

  const handleBulkReview = () => {
    planCaseReview.openReview(
      selectedCaseIds.map((planCaseId) => {
        const meta = selectedPlanCaseMetaMap[String(planCaseId)];
        return { id: String(planCaseId), name: meta?.name, result: meta?.result };
      })
    );
  };

  const handleSetColumnWidth = (columnKey: string, width: number) => {
    setColumnWidths((prev) => ({ ...prev, [columnKey]: width }));
  };

  const handleViewExecution = (record: TPlanCaseItem) => {
    const caseId = record?.case?.id;
    if (!caseId) return;
    // 分组方式随 URL 带到执行页，让执行页左树沿用当前结构；模块分组是默认值，不带参数
    const groupByQuery = groupBy !== "module" ? `&group_by=${encodeURIComponent(groupBy)}` : "";
    router.push(
      `/${workspaceSlug}/projects/${projectId}/testhub/test-execution?case_id=${encodeURIComponent(
        String(caseId)
      )}&plan_id=${encodeURIComponent(String(planId || ""))}${groupByQuery}`
    );
  };

  // 类型列在表格里是普通文本，空值留白
  const renderTypeText = (value?: number | null) => {
    if (value === null || value === undefined) return null;
    const label = (Enums as any)?.case_type?.[value] ?? (Enums as any)?.case_type?.[String(value)] ?? "";
    if (!label || label === "-") return null;
    return <span className="truncate text-13 text-secondary">{label}</span>;
  };

  const renderResultTag = (value?: string) => <PlanCaseResultTag value={value} colors={planCaseResultEnums} />;

  const renderReviewStatusTag = (value?: string) => (
    <PlanCaseReviewStatusTag value={value} colors={planCaseReviewStatusEnums} />
  );

  return (
    <div className="h-full w-full">
      <PageHead title="计划用例" description={repositoryName || ""} />
      <div className="flex h-full w-full flex-col">
        {/* 页头横跨整行，左栏与表格从它下面开始，两者等高 */}
        <div className="flex flex-shrink-0 items-start justify-between border-b border-subtle px-3 pt-2 pb-2">
          <div>
            <Breadcrumbs>
              <Breadcrumbs.Item
                component={
                  <BreadcrumbLink
                    href={`/${workspaceSlug}/projects/${projectId}/testhub/plans`}
                    label="测试计划"
                  />
                }
              />
              {(currentPlan?.module_path ?? []).map((m) => (
                <Breadcrumbs.Item
                  key={m.id}
                  component={
                    <BreadcrumbLink
                      href={`/${workspaceSlug}/projects/${projectId}/testhub/plans?moduleId=${m.id}`}
                      label={m.name}
                    />
                  }
                />
              ))}
              <Breadcrumbs.Item
                component={
                  <div className="flex h-full items-center">
                    <Select
                      value={planId || undefined}
                      placeholder="选择测试计划"
                      loading={planListLoading}
                      size="small"
                      showSearch
                      optionFilterProp="label"
                      style={{ height: "100%" }}
                      className="h-full min-w-[200px] cursor-pointer [&_.ant-select-selection-item]:!text-sm [&_.ant-select-selection-item]:!leading-4 [&_.ant-select-selection-item]:!text-primary [&_.ant-select-selection-placeholder]:!text-sm [&_.ant-select-selection-placeholder]:!leading-4 [&_.ant-select-selection-placeholder]:!text-secondary [&_.ant-select-selection-search]:!h-full [&_.ant-select-selection-search-input]:!h-full [&_.ant-select-selection-wrap]:!flex [&_.ant-select-selection-wrap]:!h-full [&_.ant-select-selection-wrap]:!items-center [&_.ant-select-selector]:!h-full [&_.ant-select-selector]:!min-h-full [&_.ant-select-selector]:!cursor-pointer [&_.ant-select-selector]:!items-center [&_.ant-select-selector]:!p-0"
                      variant="borderless"
                      suffixIcon={null}
                      showArrow={false}
                      options={planList.map((p) => ({ value: String(p.id), label: String(p.name || "-") }))}
                      onChange={onChangePlan}
                    />
                  </div>
                }
              />
            </Breadcrumbs>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-1">
              {/* 已选筛选条件接在页头信息后面，没有条件时不渲染 */}
              <PlanCaseFiltersInline filter={planCaseFilter} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <CasesSearchInput
              disabled={!planId}
              value={filters.search ?? ""}
              onSearch={(query) => {
                const trimmedQuery = query.trim();
                const nextFilters: TPlanCaseListFilters = { ...filters };
                if (trimmedQuery) nextFilters.search = trimmedQuery;
                else delete nextFilters.search;
                setFilters(nextFilters);
                fetchCases(1, pageSize, { filtersParam: nextFilters });
              }}
            />
            <FiltersToggle filter={planCaseFilter} triggerClassName="h-8 w-8" iconButtonSize="xl" />
            <PlanCaseDisplayFilters
              disabled={!planId}
              displayProperties={planCaseDisplayProperties}
              groupBy={groupBy}
              ordering={ordering}
              onDisplayPropertiesChange={handleDisplayPropertiesUpdate}
              onGroupByChange={handleGroupByChange}
              onOrderByChange={handleSortChange}
            />
            <div className="inline-flex items-center [&>*:first-child]:rounded-r-none [&>*:last-child]:rounded-l-none">
              <PlaneButton
                variant="primary"
                size="xl"
                disabled={!canEditPlan}
                onClick={() => {
                  if (!canEditPlan) return;
                  setIsPlanModalOpen(true);
                }}
              >
                规划用例
              </PlaneButton>
              <Dropdown
                menu={{
                  items: dropdownItems.map((item) => Object.assign({}, item, { disabled: !canEditPlan })),
                  onClick: ({ key }) => {
                    if (!canEditPlan) return;
                    if (key === "by_work_item") {
                      setIsPlanModalOpen(true);
                    } else if (key === "by_iteration" || key === "by_release") {
                      setPlanningTab(key === "by_iteration" ? "cycle" : "release");
                      setIsPlanningModalOpen(true);
                    }
                  },
                }}
                disabled={!canEditPlan}
                trigger={["click"]}
              >
                <PlaneButton variant="primary" size="xl" disabled={!canEditPlan} className="px-1">
                  <ChevronDownIcon className="h-4 w-4" />
                </PlaneButton>
              </Dropdown>
            </div>
            <PlaneButton
              variant="secondary"
              size="xl"
              className="mr-4"
              onClick={() => setIsExportModalOpen(true)}
              disabled={!planId}
            >
              导出
            </PlaneButton>
          </div>
        </div>
        <div className="flex min-h-0 overflow-hidden">
          <div
            className="relative min-h-0 flex-shrink-0 overflow-y-auto border-r border-subtle pt-3 pl-3"
            style={{ width: leftWidth, minWidth: 200, maxWidth: 320 }}
          >
            <div
              onMouseDown={onMouseDownResize}
              className="absolute top-0 right-0 h-full w-2"
              style={{ cursor: "col-resize", zIndex: 10 }}
              role="presentation"
            />
            {groupBy === "module" ? (
              <PlanCaseRailTree
                nodes={moduleRailNodes}
                selectedKey={selectedTreeKey}
                onSelect={handleModuleTreeSelect}
                expandedKeys={expandedKeys}
                onExpandedKeysChange={setExpandedKeys}
                className="pr-3 pb-2"
              />
            ) : groupBy === "assignee" ? (
              <PlanCaseAssigneeTree
                tree={assigneeTree}
                loading={assigneeTreeLoading}
                selectedKey={selectedTreeKey}
                onSelect={handleAssigneeTreeSelect}
              />
            ) : (
              <PlanCaseGroupTree
                tree={groupTree}
                loading={groupTreeLoading}
                selectedKey={selectedTreeKey}
                onSelect={handleGroupTreeSelect}
                resultColors={planCaseResultEnums}
                reviewStatusColors={planCaseReviewStatusEnums}
              />
            )}
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {/* h-full + min-h-0：内容少时整块跟着表格高度走，内容多时被行高压缩、表格内部滚动 */}
            <div className="flex h-full min-h-0 min-w-0 flex-col">
              <div className="min-h-0 min-w-0 overflow-hidden">
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
                  <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
                    <div className="relative min-h-0 min-w-0 overflow-hidden">
                      <PlanCasesTable
                        cases={cases}
                        columnWidths={columnWidths}
                        currentUserId={currentUser?.id ? String(currentUser.id) : undefined}
                        displayProperties={planCaseDisplayProperties}
                        selectedPlanCaseIds={selectedCaseIds}
                        setColumnWidth={handleSetColumnWidth}
                        onAssigneeChange={handlePlanCaseAssigneeChange}
                        onCancelRelation={(planCaseId) => onCancelRelation([planCaseId])}
                        onOpenCase={handleOpenCaseDetail}
                        onRowSelectChange={handleRowSelectChange}
                        onViewExecution={handleViewExecution}
                        projectId={projectId ? String(projectId) : undefined}
                        bulkAssigneeUpdating={bulkAssigneeUpdating}
                        canReview={isCurrentUserPlanReviewer}
                        onReview={(record) =>
                          planCaseReview.openReview([
                            {
                              id: String(record.id),
                              code: record.case?.code,
                              name: record.case?.name,
                              result: record.result,
                            },
                          ])
                        }
                        renderResultTag={renderResultTag}
                        renderReviewStatusTag={renderReviewStatusTag}
                        renderTypeTag={(value) => renderTypeText(value)}
                        renderPriorityTag={(value) => <PlanCasePriorityBadge value={value} />}
                        renderUpdatedAt={(value) => (value ? formatDateTime(value).slice(0, 16) : "")}
                      />
                      <PlanCasesBulkBar
                        selectedCount={selectedCaseIds.length}
                        projectId={projectId ? String(projectId) : undefined}
                        assigneeUpdating={bulkAssigneeUpdating}
                        executeLoading={bulkExecuteLoading}
                        canReview={isCurrentUserPlanReviewer}
                        canCopy={canEditPlan}
                        onAssigneeChange={(assignee) => void handleBulkPlanCaseAssigneeChange(assignee)}
                        onReview={handleBulkReview}
                        onExecute={onBulkExecuteSelected}
                        onCancelRelation={() => onCancelRelation(selectedCaseIds)}
                        onCopyToPlan={() => setIsCopyModalOpen(true)}
                        onClear={() => {
                          setSelectedCaseIds([]);
                          setSelectedPlanCaseMetaMap({});
                        }}
                      />
                    </div>
                    <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-4 py-2.5">
                      <span className="text-13 text-secondary tabular-nums">
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
                    <style
                      dangerouslySetInnerHTML={{
                        __html: `
                  .testhub-plan-cases-table-scroll{
                    scrollbar-gutter: stable;
                    scrollbar-width: thin;
                    scrollbar-color: #dddde0 transparent;
                  }

                  .testhub-plan-cases-table-scroll::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                  }

                  .testhub-plan-cases-table-scroll::-webkit-scrollbar-thumb {
                    background-color: #d9d9d9;
                    border-radius: 4px;
                  }

                  .testhub-plan-cases-table-scroll::-webkit-scrollbar-thumb:hover {
                    background-color: #bfbfbf;
                  }

                  .testhub-plan-cases-table-scroll::-webkit-scrollbar-track {
                    background: color-mix(in oklch, var(--border-subtle) 40%, transparent);
                    border-radius: 4px;
                  }
                `,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {canEditPlan && (
        <>
          <PlanCasesModal
            isOpen={isPlanModalOpen}
            onClose={() => setIsPlanModalOpen(false)}
            workspaceSlug={String(workspaceSlug)}
            projectId={String(projectId || "")}
            repositoryId={String(repositoryId)}
            repositoryName={repositoryName || ""}
            planId={String(planId || "")}
            initialSelectedCaseIds={(cases || []).map((c) => c?.case?.id).filter((id): id is string => Boolean(id))}
            onClosed={() => {
              // 关闭后刷新列表，保留当前查询参数与筛选
              refreshGroupTrees();
              fetchCases(currentPage, pageSize);
            }}
          />
          <PlanPlanningModal
            isOpen={isPlanningModalOpen}
            initialTab={planningTab}
            onClose={() => setIsPlanningModalOpen(false)}
            workspaceSlug={String(workspaceSlug)}
            projectId={String(projectId)}
            planId={String(planId || "")}
            onClosed={() => {
              refreshGroupTrees();
              fetchCases(currentPage, pageSize);
            }}
          />
          <PlanCasesCopyModal
            open={isCopyModalOpen}
            onClose={() => setIsCopyModalOpen(false)}
            workspaceSlug={String(workspaceSlug)}
            projectId={String(projectId || "")}
            sourcePlanId={String(planId || "")}
            sourcePlanName={planList.find((p) => String(p.id) === String(planId))?.name}
            planOptions={planList.filter((p) => String(p.id) !== String(planId))}
            selectedPlanCaseIds={selectedCaseIds}
            onSuccess={() => {
              setSelectedCaseIds([]);
              setSelectedPlanCaseMetaMap({});
            }}
          />
          <PlanCaseReviewModal
            open={planCaseReview.isOpen}
            targets={planCaseReview.targets}
            skippedCount={planCaseReview.skippedCount}
            submitting={planCaseReview.submitting}
            workspaceSlug={workspaceSlug ? String(workspaceSlug) : undefined}
            resultColors={planCaseResultEnums}
            reviewerIds={(currentPlan?.reviewers ?? []).map(String)}
            reviewRuleLabel={planReviewRuleLabel}
            currentUserId={currentUser?.id ? String(currentUser.id) : undefined}
            onClose={planCaseReview.close}
            onSubmit={planCaseReview.submit}
          />
        </>
      )}
      <PlanCasesExportModal
        open={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        workspaceSlug={String(workspaceSlug)}
        planId={planId}
        repositoryId={selectedRepositoryId}
        moduleId={selectedModuleId}
        selectedCaseIds={selectedCaseIds}
        filteredCount={total}
      />
      <UpdateModal
        open={isUpdateModalOpen}
        onClose={() => {
          setIsUpdateModalOpen(false);
          setActiveCase(null);
          // 弹窗内可能提交了执行结果，「执行结果」分组树的计数需要同步（未启用时 no-op）
          void refreshGroupTree();
          fetchCases(currentPage, pageSize);
        }}
        caseId={activeCase?.id}
        workspaceSlug={String(workspaceSlug)}
        projectId={String(projectId || "")}
      />
    </div>
  );
}
