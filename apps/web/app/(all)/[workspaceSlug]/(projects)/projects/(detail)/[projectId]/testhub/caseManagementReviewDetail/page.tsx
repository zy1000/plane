"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useMemo } from "react";
import { PageHead } from "@/components/core/page-title";
import { Breadcrumbs } from "@plane/ui";
import { ChevronDownIcon } from "@plane/propel/icons";
import { ClipboardCheck } from "lucide-react";
import { TestHubEntityBar } from "@/components/qa/shared/testhub-entity-bar";
import { TestHubHeaderActions } from "@/components/qa/shared/testhub-header-actions";
import { Pagination, Popconfirm, Select } from "antd";
import { CaseService as CaseApiService } from "@/services/qa/case.service";
import { CaseService as ReviewApiService, type ReviewCaseListItem } from "@/services/qa/review.service";
import UpdateModal from "@/components/qa/cases/update-modal";
import {
  ModuleTreePanel,
  UNASSIGNED_MODULE_KEY,
  UNASSIGNED_MODULE_LABEL,
  UnassignedModuleIcon,
  buildRepositoryModuleNodes,
  findModuleTreeLabel,
  type TModuleTreeNode,
} from "@/components/qa/module-tree";
import TestCaseSelectionModal from "@/components/qa/review/TestCaseSelectionModal";
import { CasesSearchInput } from "@/components/qa/cases/cases-search";
import {
  DEFAULT_REVIEW_CASE_DISPLAY_PROPERTIES,
  DEFAULT_REVIEW_CASE_ORDERING,
  ReviewCaseDisplayFilters,
} from "@/components/qa/review/review-case-display-filters";
import type {
  TReviewCaseDisplayProperties,
  TReviewCaseOrderBy,
} from "@/components/qa/review/review-case-display-filters";
import { ReviewCaseDetailTable } from "@/components/qa/review/review-case-detail-table";
import { FiltersRow } from "@/components/rich-filters/filters-row";
import { FiltersToggle } from "@/components/rich-filters/filters-toggle";
import {
  reviewCaseExpressionToQueryParams,
  type TReviewCaseFilterQueryParams,
} from "@/components/qa/review/review-case-list-filters/expression-to-query";
import { useReviewCaseFilter } from "@/components/qa/review/review-case-list-filters/use-review-case-filter";
import { useReviewCaseFiltersConfig } from "@/components/qa/review/review-case-list-filters/use-review-case-filters-config";
import type {
  TReviewCaseFilterExpression,
} from "@/components/qa/review/review-case-list-filters/types";
import type { TReviewCaseFilterSelectOption } from "@/components/qa/review/review-case-list-filters/use-review-case-filters-config";
import { useUser } from "@/hooks/store/user";
import { useMember } from "@/hooks/store/use-member";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { useTranslation } from "@plane/i18n";
import {
  qaCaseErrorContent,
  qaCaseSetToastError,
  qaCaseSetToastSuccess,
  qaCaseSetToastWarning,
} from "@/utils/qa-case-error";
import { useProjectPermissions } from "@/hooks/store/use-project-permissions";
import { globalEnums } from "../util";

const QA_REVIEW_EDIT_PERMISSION_KEY = "qa.review.edit" as const;

type ReviewCaseRow = ReviewCaseListItem;
type TReviewCaseListFilters = {
  search?: string;
} & TReviewCaseFilterQueryParams;

const EMPTY_REVIEW_CASE_FILTER_EXPRESSION: TReviewCaseFilterExpression = {};

export default function CaseManagementReviewDetailPage() {
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams<{ workspaceSlug: string; projectId: string }>();
  const searchParams = useSearchParams();
  const reviewId = searchParams.get("review_id") ?? "";
  const repositoryIdFromUrl = searchParams.get("repositoryId");
  const repositoryId =
    repositoryIdFromUrl || (typeof window !== "undefined" ? sessionStorage.getItem("selectedRepositoryId") : null);
  const router = useRouter();
  const workspaceSlugString = String(workspaceSlug || "");
  const projectIdString = String(projectId || "");
  const { fetched: permissionsFetched, hasPermission } = useProjectPermissions(
    workspaceSlugString,
    projectIdString
  );
  const canEditReview = permissionsFetched && hasPermission(QA_REVIEW_EDIT_PERMISSION_KEY);

  const caseService = useMemo(() => new CaseApiService(), []);
  const reviewService = useMemo(() => new ReviewApiService(), []);

  const [reviewTree, setReviewTree] = useState<any | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  // 只在选中用例库下的「未归类」时有值（配合 selectedModuleId = none）
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [treeLoading, setTreeLoading] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewCases, setReviewCases] = useState<ReviewCaseRow[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [total, setTotal] = useState<number>(0);
  const [ordering, setOrdering] = useState<TReviewCaseOrderBy>(DEFAULT_REVIEW_CASE_ORDERING);
  const [reviewCaseDisplayProperties, setReviewCaseDisplayProperties] = useState<TReviewCaseDisplayProperties>(() => ({
    ...DEFAULT_REVIEW_CASE_DISPLAY_PROPERTIES,
  }));
  const [filters, setFilters] = useState<TReviewCaseListFilters>({});
  const [filterExpression, setFilterExpression] = useState<TReviewCaseFilterExpression>(
    EMPTY_REVIEW_CASE_FILTER_EXPRESSION
  );
  const [reviewEnums, setReviewEnums] = useState<Record<string, Record<string, { label: string; color: string }>>>({});
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(false);
  const [activeCaseId, setActiveCaseId] = useState<string | undefined>(undefined);
  const [selectedTreeKey, setSelectedTreeKey] = useState<string>("root");
  const [isCaseSelectionOpen, setIsCaseSelectionOpen] = useState(false);
  const { data: currentUser } = useUser();
  const {
    project: { getProjectMemberIds },
  } = useMember();
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [selectedCaseMap, setSelectedCaseMap] = useState<Record<string, string>>({});
  // 批量工具条里暂存的评审人，点「应用」才提交
  const [bulkAssignees, setBulkAssignees] = useState<string[]>([]);
  const [bulkAssigneeUpdating, setBulkAssigneeUpdating] = useState(false);

  const [reviewList, setReviewList] = useState<Array<{ id: string; name: string }>>([]);
  const [reviewListLoading, setReviewListLoading] = useState<boolean>(false);

  const casePriorityEnums = useMemo(
    () =>
      Object.fromEntries(
        Object.entries((globalEnums.Enums as any)?.case_priority || {}).map(([value, label]) => [
          String(value),
          String(label),
        ])
      ) as Record<string, string>,
    []
  );

  const { repositoryFilterOptions, moduleFilterOptions } = useMemo(() => {
    const repositoryMap = new Map<string, TReviewCaseFilterSelectOption>();
    const moduleMap = new Map<string, TReviewCaseFilterSelectOption>();
    let hasUnassigned = false;

    const walk = (node: any, repositoryName = "", modulePath: string[] = []) => {
      const kind = String(node?.kind || "");
      const id = node?.id ? String(node.id) : "";
      const name = String(node?.name || "-");

      if (kind === "repository_unassigned") {
        hasUnassigned = true;
        return;
      }

      if (kind === "repository" && id) {
        repositoryMap.set(id, { id, value: id, label: name });
        (node?.children || []).forEach((child: any) => walk(child, name, []));
        return;
      }

      if (kind === "repository_modules_all") {
        (node?.children || []).forEach((child: any) => walk(child, repositoryName, []));
        return;
      }

      if (kind === "module" && id) {
        const nextPath = [...modulePath, name];
        moduleMap.set(id, {
          id,
          value: id,
          label: [repositoryName, ...nextPath].filter(Boolean).join(" / "),
        });
        (node?.children || []).forEach((child: any) => walk(child, repositoryName, nextPath));
        return;
      }

      (node?.children || []).forEach((child: any) => walk(child, repositoryName, modulePath));
    };

    if (reviewTree) walk(reviewTree);

    // 评审里有未挂模块的用例时，模块筛选第一项是「未归类」（值 none，后端按 module 为空过滤）
    const unassignedOption: TReviewCaseFilterSelectOption = {
      id: UNASSIGNED_MODULE_KEY,
      value: UNASSIGNED_MODULE_KEY,
      label: UNASSIGNED_MODULE_LABEL,
      icon: <UnassignedModuleIcon />,
    };

    return {
      repositoryFilterOptions: Array.from(repositoryMap.values()),
      moduleFilterOptions: hasUnassigned
        ? [unassignedOption, ...Array.from(moduleMap.values())]
        : Array.from(moduleMap.values()),
    };
  }, [reviewTree]);

  const selectionContextKey = useMemo(() => {
    return JSON.stringify({
      reviewId,
      selectedModuleId,
      selectedRepositoryId,
      ordering,
      filters,
    });
  }, [filters, reviewId, selectedModuleId, selectedRepositoryId, ordering]);
  const lastSelectionContextKeyRef = useRef<string | null>(null);
  const hasPendingAssigneeRefreshRef = useRef(false);

  useEffect(() => {
    if (selectedCaseIds.length === 0) setBulkAssignees([]);
  }, [selectedCaseIds.length]);

  useEffect(() => {
    if (lastSelectionContextKeyRef.current !== null && lastSelectionContextKeyRef.current !== selectionContextKey) {
      setSelectedCaseIds([]);
      setSelectedCaseMap({});
    }
    lastSelectionContextKeyRef.current = selectionContextKey;
  }, [selectionContextKey]);

  const fetchReviewTree = async () => {
    if (!workspaceSlug || !reviewId) return;
    setTreeLoading(true);
    try {
      const data = await caseService.getReviewCaseTree(workspaceSlug as string, { review_id: reviewId });
      setReviewTree(data || null);
    } catch (e) {
      setError("获取用例树失败，请稍后重试");
    } finally {
      setTreeLoading(false);
    }
  };

  const fetchReviewEnums = async () => {
    if (!workspaceSlug) return;
    try {
      const data = await reviewService.getReviewEnums(workspaceSlug as string);
      setReviewEnums(data || {});
    } catch (e) {}
  };

  const fetchReviewCaseList = async (
    page: number = currentPage,
    size: number = pageSize,
    options?: {
      filtersParam?: TReviewCaseListFilters;
      moduleId?: string | null;
      orderingParam?: TReviewCaseOrderBy | null;
      repositoryId?: string | null;
    }
  ) => {
    if (!workspaceSlug || !reviewId) return;
    try {
      setLoading(true);
      setError(null);
      const hasModuleOverride = Object.prototype.hasOwnProperty.call(options || {}, "moduleId");
      const effectiveModuleId = hasModuleOverride ? options?.moduleId : selectedModuleId;
      const hasRepositoryOverride = Object.prototype.hasOwnProperty.call(options || {}, "repositoryId");
      const effectiveRepositoryId = hasRepositoryOverride ? options?.repositoryId : selectedRepositoryId;
      const effectiveOrdering = options?.orderingParam === undefined ? ordering : (options.orderingParam ?? undefined);
      const effectiveFilters = options?.filtersParam ?? filters;
      const { search, ...filterParams } = effectiveFilters;
      const listParams = {
        page,
        page_size: size,
        ...(projectId ? { project_id: String(projectId) } : {}),
        ...(effectiveModuleId ? { module_id: effectiveModuleId } : {}),
        ...(effectiveRepositoryId ? { repository_id: effectiveRepositoryId } : {}),
        ...(effectiveOrdering ? { ordering: effectiveOrdering } : {}),
        ...(search ? { name__icontains: search } : {}),
        ...filterParams,
      };
      let res = await reviewService.getReviewCaseList(workspaceSlug as string, reviewId as string, listParams);
      let data = Array.isArray(res?.data) ? (res.data as ReviewCaseRow[]) : [];
      const count = Number(res?.count || 0);
      let pageToUse = page;

      if (data.length === 0 && count > 0 && page > 1) {
        const maxPage = Math.max(1, Math.ceil(count / size));
        pageToUse = Math.min(page, maxPage);
        if (pageToUse !== page) {
          res = await reviewService.getReviewCaseList(workspaceSlug as string, reviewId as string, {
            ...listParams,
            page: pageToUse,
          });
          data = Array.isArray(res?.data) ? (res.data as ReviewCaseRow[]) : [];
        }
      }

      setReviewCases(data);
      setTotal(count);
      setCurrentPage(pageToUse);
      setPageSize(size);
    } catch (e: unknown) {
      const fallback = "获取评审用例列表失败";
      setError(qaCaseErrorContent(e, t, fallback));
      qaCaseSetToastError(e, t, fallback);
    } finally {
      setLoading(false);
    }
  };

  const handlePaginationChange = (page: number, size?: number) => {
    const nextSize = size || pageSize;
    const nextPage = nextSize !== pageSize ? 1 : page;
    fetchReviewCaseList(nextPage, nextSize);
  };

  const handleDisplayPropertiesUpdate = (updatedDisplayProperties: Partial<TReviewCaseDisplayProperties>) => {
    setReviewCaseDisplayProperties((prev) => ({ ...prev, ...updatedDisplayProperties }));
  };

  const handleSortChange = (nextOrdering: TReviewCaseOrderBy) => {
    setOrdering(nextOrdering);
    fetchReviewCaseList(1, pageSize, { orderingParam: nextOrdering });
  };

  const handleRichFiltersChange = (expression: TReviewCaseFilterExpression) => {
    const nextFilters: TReviewCaseListFilters = {
      ...(filters.search ? { search: filters.search } : {}),
      ...reviewCaseExpressionToQueryParams(expression),
    };
    setFilterExpression(expression);
    setFilters(nextFilters);
    fetchReviewCaseList(1, pageSize, { filtersParam: nextFilters });
  };

  const projectMemberIds = useMemo(
    () => getProjectMemberIds(projectIdString, false) ?? [],
    [getProjectMemberIds, projectIdString]
  );

  const { areAllConfigsInitialized, configs: reviewCaseFilterConfigs } = useReviewCaseFiltersConfig({
    assigneeIds: projectMemberIds,
    casePriorityEnums,
    moduleOptions: moduleFilterOptions,
    repositoryOptions: repositoryFilterOptions,
    reviewEnums,
    workspaceSlug: workspaceSlugString,
  });

  const reviewCaseFilter = useReviewCaseFilter({
    areAllConfigsInitialized,
    configs: reviewCaseFilterConfigs,
    initialExpression: filterExpression,
    instanceKey: `review-case-detail-${workspaceSlugString}-${projectIdString}-${reviewId}`,
    onExpressionChange: handleRichFiltersChange,
  });

  const handleRowSelectChange = (selectedKeysOnCurrentPage: string[]) => {
    const currentPageIds = (reviewCases || []).map((item) => String(item.id));
    setSelectedCaseIds((prev) => {
      const next = new Set(prev.map((id) => String(id)));
      currentPageIds.forEach((id) => next.delete(id));
      selectedKeysOnCurrentPage.forEach((id) => next.add(id));
      return Array.from(next);
    });

    setSelectedCaseMap((prev) => {
      const next = { ...prev };
      (reviewCases || []).forEach((row) => {
        const id = String(row.id);
        if (selectedKeysOnCurrentPage.includes(id)) {
          next[id] = String(row.case_id);
        } else {
          delete next[id];
        }
      });
      return next;
    });
  };

  /** 整体覆盖一批评审用例的评审人；行内编辑与批量设置共用 */
  const applyReviewCaseAssignees = async (throughIds: string[], assigneeIds: string[]) => {
    if (!workspaceSlug || !projectId || !reviewId || throughIds.length === 0) return false;
    try {
      await reviewService.updateReviewCaseAssignees(workspaceSlug as string, projectId as string, {
        review_id: reviewId as string,
        ids: throughIds,
        assignees: assigneeIds,
      });
      const idSet = new Set(throughIds.map((id) => String(id)));
      setReviewCases((prev) =>
        prev.map((row) => (idSet.has(String(row.id)) ? { ...row, assignees: assigneeIds } : row))
      );
      return true;
    } catch (e: unknown) {
      qaCaseSetToastError(e, t, "设置评审人失败");
      return false;
    }
  };

  const handleCaseAssigneesChange = async (record: ReviewCaseRow, assigneeIds: string[]) => {
    const ok = await applyReviewCaseAssignees([String(record.id)], assigneeIds);
    if (ok) hasPendingAssigneeRefreshRef.current = true;
  };

  // 评审人变了会连带影响评审结论，下拉关掉后统一拉一次当前页；没改过就不拉
  const handleCaseAssigneesEditClose = () => {
    if (!hasPendingAssigneeRefreshRef.current) return;
    hasPendingAssigneeRefreshRef.current = false;
    fetchReviewCaseList(currentPage, pageSize);
  };

  const handleBulkAssigneesApply = async () => {
    setBulkAssigneeUpdating(true);
    const ok = await applyReviewCaseAssignees(selectedCaseIds, bulkAssignees);
    setBulkAssigneeUpdating(false);
    if (!ok) return;
    qaCaseSetToastSuccess(`已为 ${selectedCaseIds.length} 条用例设置评审人`);
    setSelectedCaseIds([]);
    setSelectedCaseMap({});
    setBulkAssignees([]);
    fetchReviewCaseList(currentPage, pageSize);
  };

  const handleOpenCase = (record: ReviewCaseRow) => {
    if (!record?.case_id) {
      qaCaseSetToastWarning("缺少用例信息，无法打开");
      return;
    }
    setActiveCaseId(String(record.case_id));
    setIsCaseModalOpen(true);
  };

  const handleReviewCase = (record: ReviewCaseRow) => {
    if (!workspaceSlug || !reviewId) return;
    // 排序随 URL 带到评审页，让评审页用例顺序沿用当前列表；默认值不带参数
    const orderingQuery =
      ordering !== DEFAULT_REVIEW_CASE_ORDERING ? `&ordering=${encodeURIComponent(ordering)}` : "";
    const href = `/${workspaceSlug}/projects/${projectId}/testhub/case-review?review_id=${encodeURIComponent(
      reviewId
    )}&case_id=${encodeURIComponent(record.case_id)}${orderingQuery}`;
    router.push(href);
  };

  const handleCancelCase = async (record: ReviewCaseRow) => {
    if (!canEditReview) return;
    if (!workspaceSlug || !reviewId) return;
    try {
      await reviewService.CaseCancel(workspaceSlug as string, projectId as string, { ids: [record.id] });
      qaCaseSetToastSuccess("已取消关联");
      fetchReviewCaseList(currentPage, pageSize);
    } catch (e: unknown) {
      qaCaseSetToastError(e, t, "操作失败");
    }
  };

  useEffect(() => {
    try {
      if (repositoryIdFromUrl) sessionStorage.setItem("selectedRepositoryId", repositoryIdFromUrl);
    } catch {}
    setReviewTree(null);
    setFilters({});
    setFilterExpression(EMPTY_REVIEW_CASE_FILTER_EXPRESSION);
    setOrdering(DEFAULT_REVIEW_CASE_ORDERING);
    setSelectedCaseIds([]);
    setSelectedCaseMap({});
    fetchReviewTree();
    fetchReviewEnums();
    setSelectedTreeKey("root");
    setSelectedModuleId(null);
    setSelectedRepositoryId(null);
    fetchReviewCaseList(1, pageSize, {
      filtersParam: {},
      moduleId: null,
      orderingParam: DEFAULT_REVIEW_CASE_ORDERING,
      repositoryId: null,
    });
  }, [repositoryId, reviewId]);

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    setReviewListLoading(true);
    reviewService
      .getReviewList(String(workspaceSlug), { project_id: String(projectId) })
      .then((data) => setReviewList(Array.isArray(data) ? data : []))
      .catch(() => setReviewList([]))
      .finally(() => setReviewListLoading(false));
  }, [workspaceSlug, projectId, reviewService]);

  const onChangeReview = (nextReviewId: string) => {
    const found = reviewList.find((r) => String(r.id) === String(nextReviewId));
    if (typeof window !== "undefined") {
      if (found?.name) sessionStorage.setItem("selectedReviewName", String(found.name));
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("review_id", String(nextReviewId));
    router.push(`/${workspaceSlug}/projects/${projectId}/testhub/caseManagementReviewDetail?${params.toString()}`);
  };

  function getTreeNodeKey(node: any): string {
    const kind = String(node?.kind || "");
    const id = String(node?.id || "");
    const repositoryId = node?.repository_id ? String(node.repository_id) : null;

    if (kind === "root") return "root";
    if (kind === "repository") return `repo:${id}`;
    if (kind === "repository_modules_all") return `repo:${repositoryId}:all_modules`;
    if (kind === "repository_unassigned") return `repo:${repositoryId}:${UNASSIGNED_MODULE_KEY}`;
    if (kind === "module") return `module:${id}`;
    return id;
  }

  // 左栏节点：用例库 → 模块 → 子模块；「全部用例」是树的固定首行
  const moduleTreeNodes = useMemo<TModuleTreeNode[]>(
    () => buildRepositoryModuleNodes(reviewTree, getTreeNodeKey),
    [reviewTree]
  );
  const treeRailLabel =
    selectedTreeKey === "root" ? "全部用例" : findModuleTreeLabel(moduleTreeNodes, selectedTreeKey) || "全部用例";

  // 树刷新后默认展开各用例库，模块层级保持收起
  useEffect(() => {
    setExpandedKeys(moduleTreeNodes.map((node) => node.key));
  }, [moduleTreeNodes]);

  const handleTreeSelect = (key: string) => {
    setSelectedTreeKey(key);
    // 模块节点按模块过滤；用例库下的「未归类」= 该库 + module none；选中用例库或「全部用例」都看整个评审
    const unassignedSuffix = `:${UNASSIGNED_MODULE_KEY}`;
    const isUnassigned = key.startsWith("repo:") && key.endsWith(unassignedSuffix);
    const moduleId = key.startsWith("module:")
      ? key.slice("module:".length)
      : isUnassigned
        ? UNASSIGNED_MODULE_KEY
        : null;
    const nextRepositoryId = isUnassigned ? key.slice("repo:".length, -unassignedSuffix.length) : null;
    setSelectedModuleId(moduleId);
    setSelectedRepositoryId(nextRepositoryId);
    fetchReviewCaseList(1, pageSize, { moduleId, repositoryId: nextRepositoryId });
  };

  return (
    <>
      <div className="h-full w-full">
        <PageHead title="评审详情" />
        <div className="flex h-full w-full flex-col">
          {/* 本页操作 portal 到页签行右侧；实体栏只放评审切换 */}
          <TestHubHeaderActions>
            <CasesSearchInput
              value={filters.search ?? ""}
              onSearch={(query) => {
                const trimmedQuery = query.trim();
                const nextFilters: TReviewCaseListFilters = { ...filters };
                if (trimmedQuery) nextFilters.search = trimmedQuery;
                else delete nextFilters.search;
                setFilters(nextFilters);
                fetchReviewCaseList(1, pageSize, { filtersParam: nextFilters });
              }}
            />
            <FiltersToggle filter={reviewCaseFilter} triggerClassName="h-8 w-8" iconButtonSize="xl" />
            <ReviewCaseDisplayFilters
              displayProperties={reviewCaseDisplayProperties}
              ordering={ordering}
              onDisplayPropertiesChange={handleDisplayPropertiesUpdate}
              onOrderByChange={handleSortChange}
            />
            <button
              type="button"
              disabled={!canEditReview}
              onClick={() => {
                if (!canEditReview) return;
                setIsCaseSelectionOpen(true);
              }}
              className="flex items-center justify-center gap-1.5 rounded bg-accent-primary px-3 py-1.5 text-xs font-medium whitespace-nowrap text-on-color transition-all hover:bg-accent-primary-hover focus:bg-accent-primary-hover focus:text-on-color disabled:cursor-not-allowed disabled:opacity-50"
            >
              关联用例
            </button>
          </TestHubHeaderActions>
          <TestHubEntityBar icon={<ClipboardCheck className="size-4" strokeWidth={1.75} />}>
            <Breadcrumbs.Item
              component={
                <div className="flex h-full items-center">
                  <Select
                    value={reviewId || undefined}
                    placeholder="选择评审"
                    loading={reviewListLoading}
                    size="small"
                    showSearch
                    optionFilterProp="label"
                    style={{ height: "100%" }}
                    popupMatchSelectWidth={260}
                    className="h-full max-w-[360px] cursor-pointer [&_.ant-select-arrow]:!right-0 [&_.ant-select-arrow]:!text-tertiary [&_.ant-select-selection-item]:!max-w-[280px] [&_.ant-select-selection-item]:!truncate [&_.ant-select-selection-item]:!text-14 [&_.ant-select-selection-item]:!font-semibold [&_.ant-select-selection-item]:!leading-4 [&_.ant-select-selection-item]:!text-primary [&_.ant-select-selection-placeholder]:!text-14 [&_.ant-select-selection-placeholder]:!leading-4 [&_.ant-select-selection-placeholder]:!text-secondary [&_.ant-select-selection-search]:!h-full [&_.ant-select-selection-search-input]:!h-full [&_.ant-select-selection-search-input]:!text-14 [&_.ant-select-selection-wrap]:!flex [&_.ant-select-selection-wrap]:!h-full [&_.ant-select-selection-wrap]:!items-center [&_.ant-select-selector]:!h-full [&_.ant-select-selector]:!min-h-full [&_.ant-select-selector]:!cursor-pointer [&_.ant-select-selector]:!items-center [&_.ant-select-selector]:!bg-transparent [&_.ant-select-selector]:!py-0 [&_.ant-select-selector]:!pl-0 [&_.ant-select-selector]:!pr-5 [&_.ant-select-selector]:!shadow-none"
                    variant="borderless"
                    suffixIcon={<ChevronDownIcon className="size-3.5" />}
                    options={reviewList.map((r) => ({ value: String(r.id), label: String(r.name || "-") }))}
                    onChange={onChangeReview}
                  />
                </div>
              }
            />
          </TestHubEntityBar>
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <ModuleTreePanel
              root={{ key: "root", label: "全部用例" }}
              nodes={moduleTreeNodes}
              selectedKey={selectedTreeKey}
              onSelect={handleTreeSelect}
              expandedKeys={expandedKeys}
              onExpandedKeysChange={setExpandedKeys}
              loading={treeLoading}
              emptyText="评审里还没有用例"
              railLabel={treeRailLabel}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div className="flex-shrink-0 px-3 pt-1.5 pb-1">
                <FiltersRow filter={reviewCaseFilter} />
              </div>
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
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
                  <div className="flex h-full min-w-0 flex-col overflow-hidden">
                    <div className="relative min-w-0 flex-1 overflow-hidden">
                      <ReviewCaseDetailTable
                        canEditReview={canEditReview}
                        displayProperties={reviewCaseDisplayProperties}
                        onCancel={handleCancelCase}
                        onOpenCase={handleOpenCase}
                        onReview={handleReviewCase}
                        onAssigneesChange={handleCaseAssigneesChange}
                        onAssigneesEditClose={handleCaseAssigneesEditClose}
                        onRowSelectChange={handleRowSelectChange}
                        projectId={projectIdString}
                        reviewCases={reviewCases}
                        reviewEnums={reviewEnums}
                        selectedCaseIds={selectedCaseIds}
                      />
                    </div>
                    <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-4 py-2">
                      <div className="flex items-center gap-4 text-sm">
                        {selectedCaseIds.length > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-secondary">已选择 {selectedCaseIds.length} 条</span>
                            <span
                              className="cursor-pointer text-sm transition-colors"
                              style={{ color: "#2a83ff" }}
                              onClick={() => {
                                setSelectedCaseIds([]);
                                setSelectedCaseMap({});
                              }}
                            >
                              清除选择
                            </span>
                            <MemberDropdown
                              multiple
                              value={bulkAssignees}
                              onChange={(value) => setBulkAssignees(Array.isArray(value) ? value : [])}
                              disabled={bulkAssigneeUpdating || !canEditReview}
                              projectId={projectId ? String(projectId) : undefined}
                              buttonVariant="transparent-with-text"
                              placement="top-start"
                              optionsClassName="z-[80]"
                              button={
                                <span
                                  className={`text-sm transition-colors ${
                                    canEditReview && !bulkAssigneeUpdating
                                      ? "cursor-pointer"
                                      : "cursor-not-allowed opacity-50"
                                  }`}
                                  style={{ color: "#2a83ff" }}
                                >
                                  {bulkAssigneeUpdating
                                    ? "设置中..."
                                    : bulkAssignees.length > 0
                                      ? `设置评审人（${bulkAssignees.length}）`
                                      : "设置评审人"}
                                </span>
                              }
                            />
                            {bulkAssignees.length > 0 && !bulkAssigneeUpdating && canEditReview && (
                              <span
                                className="cursor-pointer text-sm transition-colors"
                                style={{ color: "#2a83ff" }}
                                onClick={handleBulkAssigneesApply}
                              >
                                应用
                              </span>
                            )}
                            <Popconfirm
                              title="确定通过选中用例？"
                              onConfirm={async () => {
                                if (!workspaceSlug || !reviewId) return;
                                try {
                                  // 评审人是用例级的，只能通过自己是评审人的那些用例
                                  const userId = currentUser?.id ? String(currentUser.id) : "";
                                  const reviewableIds = selectedCaseIds.filter((id) => {
                                    const row = reviewCases.find((item) => String(item.id) === String(id));
                                    return (row?.assignees || []).some((assignee) => String(assignee) === userId);
                                  });
                                  const skippedCount = selectedCaseIds.length - reviewableIds.length;
                                  const caseIds = reviewableIds.map((id) => selectedCaseMap[id]).filter((id) => !!id);

                                  if (caseIds.length === 0) {
                                    qaCaseSetToastWarning("选中的用例里没有你要评审的用例");
                                    return;
                                  }

                                  await caseService.submitCaseReview(workspaceSlug as string, {
                                    review_id: reviewId as string,
                                    case_id: caseIds,
                                    result: "通过",
                                    assignee: userId || undefined,
                                  });

                                  qaCaseSetToastSuccess(
                                    skippedCount > 0
                                      ? `已通过 ${caseIds.length} 条用例，跳过 ${skippedCount} 条（你不是评审人）`
                                      : "已批量通过用例"
                                  );
                                  setSelectedCaseIds([]);
                                  setSelectedCaseMap({});
                                  fetchReviewCaseList(currentPage, pageSize);
                                } catch (e: unknown) {
                                  qaCaseSetToastError(e, t, "操作失败");
                                }
                              }}
                              okText="确定"
                              cancelText="取消"
                            >
                              <span className="cursor-pointer text-sm transition-colors" style={{ color: "#2a83ff" }}>
                                通过
                              </span>
                            </Popconfirm>
                            <Popconfirm
                              title="确定取消关联选中用例？"
                              disabled={!canEditReview}
                              onConfirm={async () => {
                                if (!canEditReview) return;
                                if (!workspaceSlug || !reviewId) return;
                                try {
                                  await reviewService.CaseCancel(workspaceSlug as string, projectId as string, {
                                    ids: selectedCaseIds,
                                  });
                                  qaCaseSetToastSuccess("已批量取消关联");
                                  setSelectedCaseIds([]);
                                  setSelectedCaseMap({});
                                  fetchReviewCaseList(currentPage, pageSize);
                                } catch (e: unknown) {
                                  qaCaseSetToastError(e, t, "操作失败");
                                }
                              }}
                              okText="确定"
                              cancelText="取消"
                            >
                              <span
                                className={`text-sm transition-colors ${
                                  canEditReview
                                    ? "cursor-pointer text-danger-primary hover:opacity-80"
                                    : "cursor-not-allowed text-danger-primary opacity-50"
                                }`}
                              >
                                移除
                              </span>
                            </Popconfirm>
                          </div>
                        )}
                        <span className="text-secondary">
                          {total > 0
                            ? `第 ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, total)} 条，共 ${total} 条`
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
            </div>
          </div>
        </div>
      </div>
      <UpdateModal
        open={isCaseModalOpen}
        onClose={() => {
          setIsCaseModalOpen(false);
          setActiveCaseId(undefined);
          fetchReviewCaseList(currentPage, pageSize);
        }}
        caseId={activeCaseId}
      />
      {canEditReview && isCaseSelectionOpen && (
        <TestCaseSelectionModal
          open={isCaseSelectionOpen}
          onClose={() => setIsCaseSelectionOpen(false)}
          initialSelectedIds={[]}
          projectId={projectId ? String(projectId) : undefined}
          reviewId={reviewId ? String(reviewId) : undefined}
          onConfirm={async (ids, assignees) => {
            if (!canEditReview) return;
            if (!workspaceSlug || !reviewId) return;
            try {
              await reviewService.addReviewCases(String(workspaceSlug), String(projectId), {
                review_id: String(reviewId),
                case_ids: ids || [],
                ...(assignees && assignees.length > 0 ? { assignees } : {}),
              });
              qaCaseSetToastSuccess("已关联所选用例");
              setIsCaseSelectionOpen(false);
              fetchReviewTree();
              fetchReviewCaseList(1, pageSize, { moduleId: selectedModuleId });
            } catch (e: unknown) {
              qaCaseSetToastError(e, t, "关联用例失败");
            }
          }}
        />
      )}
    </>
  );
}
