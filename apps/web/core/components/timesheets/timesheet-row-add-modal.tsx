/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, Transition } from "@headlessui/react";
import {
  Beaker,
  Bug,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FolderOpen,
  Layers,
  ListTodo,
  Loader2,
  Search,
  Square,
  SquareCheckBig,
  Target,
  Tag,
  X,
} from "lucide-react";
import { observer } from "mobx-react";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { cn } from "@plane/utils";
import {
  getCategoryIconName,
  getCategoryIssueTypeNames,
  getCategoryPanelKind,
  getTimesheetCategoryChroma,
} from "@/constants/timesheet-category";
import { useProject } from "@/hooks/store/use-project";
import { useTimesheetCategories } from "@/hooks/store/use-timesheet-categories";
import { useUser } from "@/hooks/store/user";
import { IssueService } from "@/services/issue/issue.service";
import { CaseService } from "@/services/qa/case.service";
import type { TTimesheetRow } from "@/hooks/store/use-timesheet-page";
import type { TTimesheetCategory } from "@/services/issue/timesheet-category.service";
import { WorkItemTypeIcon } from "@/components/issues/work-item-type-icon";

const issueService = new IssueService();
const caseService = new CaseService();

const TEST_CASE_PAGE_SIZE = 50;

/**
 * 左侧菜单被选中的节点：既要记住是哪个项目，又要记住选了哪个类别 key。
 * 类别 key 直接决定右侧渲染哪种面板（项目 / 工作项 / 测试用例）。
 */
type TSelectedCategory = {
  projectId: string;
  categoryKey: string;
};

type TIssueItem = {
  id: string;
  name: string;
  sequence_id: number;
  type_id: string | null;
  type_name?: string | null;
};

type TTestCaseItem = {
  id: string;
  name: string;
  code: string;
};

type TTimesheetRowAddModalProps = {
  open: boolean;
  workspaceSlug: string;
  onAdd: (row: TTimesheetRow) => void;
  onClose: () => void;
};

function renderIssueTypeIcon(issue: TIssueItem) {
  return <WorkItemTypeIcon typeName={issue.type_name} />;
}

function parseIssueItems(raw: any): TIssueItem[] {
  const list = Array.isArray(raw) ? raw : raw?.results ?? [];
  return list.map((i: any) => ({
    id: String(i.id),
    name: String(i.name || ""),
    sequence_id: Number(i.sequence_id || 0),
    type_id: i.type_id != null && i.type_id !== "" ? String(i.type_id) : null,
    type_name: i.type_name ?? i.type?.name ?? null,
  }));
}

function deduplicateIssues(a: TIssueItem[], b: TIssueItem[]): TIssueItem[] {
  const seen = new Set<string>();
  const result: TIssueItem[] = [];
  for (const item of [...a, ...b]) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      result.push(item);
    }
  }
  return result;
}

function CategoryIcon({ keyName, className }: { keyName: string | undefined; className?: string }) {
  const iconName = getCategoryIconName(keyName);
  const chroma = getTimesheetCategoryChroma(keyName);
  const cls = className ?? "h-3.5 w-3.5 shrink-0";
  const inner =
    iconName === "Layers" ? (
      <Layers className={cls} />
    ) : iconName === "ClipboardCheck" ? (
      <ClipboardCheck className={cls} />
    ) : iconName === "Beaker" ? (
      <Beaker className={cls} />
    ) : iconName === "Target" ? (
      <Target className={cls} />
    ) : iconName === "ListTodo" ? (
      <ListTodo className={cls} />
    ) : iconName === "Bug" ? (
      <Bug className={cls} />
    ) : (
      <Clock className={cls} />
    );
  return (
    <span
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center"
      style={{ color: chroma.color }}
    >
      {inner}
    </span>
  );
}

export const TimesheetRowAddModal = observer(function TimesheetRowAddModal({
  open,
  workspaceSlug,
  onAdd,
  onClose,
}: TTimesheetRowAddModalProps) {
  const { joinedProjectIds, favoriteProjectIds, getProjectById } = useProject();
  const { data: currentUser } = useUser();
  const currentUserId = currentUser?.id;
  const { categories, isLoading: isCategoriesLoading } = useTimesheetCategories();

  // Tree state
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<TSelectedCategory | null>(null);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [itemSearchQuery, setItemSearchQuery] = useState("");

  // Data state
  const [issues, setIssues] = useState<TIssueItem[]>([]);
  const [testCases, setTestCases] = useState<TTestCaseItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);

  // Pagination state for test cases
  const [testCasePage, setTestCasePage] = useState(1);
  const [testCaseTotal, setTestCaseTotal] = useState(0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Selection state: Map<rowId, TTimesheetRow>
  const [selectedItems, setSelectedItems] = useState<Map<string, TTimesheetRow>>(new Map());

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listScrollRef = useRef<HTMLDivElement>(null);

  const selectedCategoryMeta: TTimesheetCategory | undefined = useMemo(
    () => categories.find((c) => c.key === selectedCategory?.categoryKey),
    [categories, selectedCategory?.categoryKey]
  );
  const selectedPanelKind = selectedCategory ? getCategoryPanelKind(selectedCategory.categoryKey) : undefined;

  // Filtered project IDs
  const filteredProjectIds = useMemo(() => {
    const q = projectSearchQuery.toLowerCase().trim();
    if (!q) return joinedProjectIds;
    return joinedProjectIds.filter((pid) => {
      const p = getProjectById(pid);
      return !!(p?.name?.toLowerCase().includes(q) || p?.identifier?.toLowerCase().includes(q));
    });
  }, [joinedProjectIds, projectSearchQuery, getProjectById]);

  const favoriteSet = useMemo(() => new Set(favoriteProjectIds), [favoriteProjectIds]);
  const favoriteFiltered = useMemo(
    () => filteredProjectIds.filter((pid) => favoriteSet.has(pid)),
    [filteredProjectIds, favoriteSet]
  );
  const otherFiltered = useMemo(
    () => filteredProjectIds.filter((pid) => !favoriteSet.has(pid)),
    [filteredProjectIds, favoriteSet]
  );

  const fetchItems = useCallback(
    async (category: TSelectedCategory, query: string) => {
      if (!workspaceSlug || !category) return;
      const panel = getCategoryPanelKind(category.categoryKey);
      if (panel === "project") return;
      setIsLoadingItems(true);
      setItemsError(null);

      try {
        if (panel === "issue") {
          // 工作项工时被拆分为 REQUIREMENT / TASK / BUG 后，需要把类别允许的 issue type.name
          // 透传到后端做筛选，从而让每个子菜单只看到自己归属的工作项。
          const typeNames = getCategoryIssueTypeNames(category.categoryKey);
          const baseParams: Record<string, any> = {
            ...(query ? { name: query } : {}),
            ...(typeNames && typeNames.length > 0 ? { type__name: typeNames.join(",") } : {}),
          };

          if (currentUserId) {
            const [assignedResult, createdResult] = await Promise.allSettled([
              issueService.getIssuesWithParams(workspaceSlug, category.projectId, {
                ...baseParams,
                assignees: currentUserId,
              }),
              issueService.getIssuesWithParams(workspaceSlug, category.projectId, {
                ...baseParams,
                created_by: currentUserId,
              }),
            ]);

            const assignedItems =
              assignedResult.status === "fulfilled" ? parseIssueItems(assignedResult.value) : [];
            const createdItems =
              createdResult.status === "fulfilled" ? parseIssueItems(createdResult.value) : [];

            setIssues(deduplicateIssues(assignedItems, createdItems));
          } else {
            const result = await issueService.getIssuesWithParams(workspaceSlug, category.projectId, baseParams);
            setIssues(parseIssueItems(result));
          }
        } else {
          const result = await caseService.getProjectCases(workspaceSlug, {
            project_id: category.projectId,
            page: 1,
            page_size: TEST_CASE_PAGE_SIZE,
            ...(query ? { name__icontains: query } : {}),
          });
          const list = Array.isArray(result) ? result : result?.data ?? result?.results ?? [];
          setTestCases(
            list.map((c: any) => ({
              id: String(c.id),
              name: String(c.name || ""),
              code: String(c.code ?? "").trim(),
            }))
          );
          const total = result?.count ?? list.length;
          setTestCasePage(1);
          setTestCaseTotal(total);
        }
      } catch {
        if (panel === "issue") {
          setIssues([]);
          setItemsError("加载工作项失败");
        } else {
          setTestCases([]);
          setItemsError("加载测试用例失败");
        }
      } finally {
        setIsLoadingItems(false);
      }
    },
    [workspaceSlug, currentUserId]
  );

  const loadMoreTestCases = useCallback(async () => {
    if (!selectedCategory || getCategoryPanelKind(selectedCategory.categoryKey) !== "test_case" || isLoadingMore) return;
    const nextPage = testCasePage + 1;
    if (testCasePage * TEST_CASE_PAGE_SIZE >= testCaseTotal) return;

    setIsLoadingMore(true);
    try {
      const result = await caseService.getProjectCases(workspaceSlug, {
        project_id: selectedCategory.projectId,
        page: nextPage,
        page_size: TEST_CASE_PAGE_SIZE,
        ...(itemSearchQuery ? { name__icontains: itemSearchQuery } : {}),
      });
      const list = Array.isArray(result) ? result : result?.data ?? result?.results ?? [];
      const newCases = list.map((c: any) => ({
        id: String(c.id),
        name: String(c.name || ""),
        code: String(c.code ?? "").trim(),
      }));
      setTestCases((prev) => [...prev, ...newCases]);
      setTestCasePage(nextPage);
    } finally {
      setIsLoadingMore(false);
    }
  }, [selectedCategory, testCasePage, testCaseTotal, isLoadingMore, workspaceSlug, itemSearchQuery]);

  const handleListScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      if (!selectedCategory || getCategoryPanelKind(selectedCategory.categoryKey) !== "test_case") return;
      const el = e.currentTarget;
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) {
        loadMoreTestCases();
      }
    },
    [selectedCategory, loadMoreTestCases]
  );

  useEffect(() => {
    if (!open || !selectedCategory) return;
    if (getCategoryPanelKind(selectedCategory.categoryKey) === "project") return;
    const timer = setTimeout(() => {
      fetchItems(selectedCategory, itemSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [open, selectedCategory, itemSearchQuery, fetchItems]);

  useEffect(() => {
    if (open) {
      setSelectedProjectId(null);
      setSelectedCategory(null);
      setProjectSearchQuery("");
      setItemSearchQuery("");
      setIssues([]);
      setTestCases([]);
      setSelectedItems(new Map());
      setItemsError(null);
      setTestCasePage(1);
      setTestCaseTotal(0);
      setIsLoadingMore(false);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSelectProject = (projectId: string) => {
    setSelectedProjectId(projectId);
    // 切换项目时清掉右侧已进入的类别状态，避免把旧项目的类别联动到新项目
    setSelectedCategory(null);
    setItemSearchQuery("");
    setIssues([]);
    setTestCases([]);
    setItemsError(null);
  };

  const handleSelectCategory = (projectId: string, categoryKey: string) => {
    setSelectedCategory({ projectId, categoryKey });
    setItemSearchQuery("");
    setIssues([]);
    setTestCases([]);
    setItemsError(null);
  };

  const toggleItemSelection = (row: TTimesheetRow) => {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      if (next.has(row.id)) {
        next.delete(row.id);
      } else {
        next.set(row.id, row);
      }
      return next;
    });
  };

  const makeIssueRow = (issue: TIssueItem, projectId: string, category: TTimesheetCategory): TTimesheetRow => {
    const project = getProjectById(projectId);
    return {
      id: `issue-${issue.id}`,
      type: "issue",
      projectId,
      projectName: project?.name,
      categoryId: category.id,
      categoryKey: category.key,
      categoryName: category.name,
      categorySortOrder: category.sort_order,
      issueId: issue.id,
      issueName: issue.name,
      issueSequenceId: issue.sequence_id,
      issueTypeId: issue.type_id ?? null,
      issueTypeName: issue.type_name ?? null,
      displayName: `#${issue.sequence_id} ${issue.name}`,
    };
  };

  const makeTestCaseRow = (tc: TTestCaseItem, projectId: string, category: TTimesheetCategory): TTimesheetRow => {
    const project = getProjectById(projectId);
    return {
      id: `test_case-${tc.id}`,
      type: "test_case",
      projectId,
      projectName: project?.name,
      categoryId: category.id,
      categoryKey: category.key,
      categoryName: category.name,
      categorySortOrder: category.sort_order,
      testCaseId: tc.id,
      testCaseName: tc.name,
      displayName: tc.name,
    };
  };

  const makeProjectRow = (projectId: string, category: TTimesheetCategory): TTimesheetRow => {
    const project = getProjectById(projectId);
    const projectLabel = project?.name || "项目";
    const displayName = category.name ? `${projectLabel} · ${category.name}` : projectLabel;
    return {
      id: `project-${projectId}-${category.key}`,
      type: "project",
      projectId,
      projectName: project?.name,
      categoryId: category.id,
      categoryKey: category.key,
      categoryName: category.name,
      categorySortOrder: category.sort_order,
      displayName,
    };
  };

  const handleAddSelected = () => {
    for (const row of selectedItems.values()) {
      onAdd(row);
    }
    onClose();
  };

  const handleClose = () => {
    onClose();
  };

  const selectedProject = selectedCategory
    ? getProjectById(selectedCategory.projectId)
    : selectedProjectId
      ? getProjectById(selectedProjectId)
      : null;

  const renderProjectNode = (pid: string) => {
    const project = getProjectById(pid);
    if (!project) return null;
    const isActive = selectedProjectId === pid;

    return (
      <button
        key={pid}
        onClick={() => handleSelectProject(pid)}
        className={cn(
          "group w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors cursor-pointer",
          isActive ? "bg-accent-primary/10 text-accent-primary" : "hover:bg-layer-1"
        )}
      >
        <div className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-2">
          {project.logo_props ? (
            <Logo logo={project.logo_props} size={14} />
          ) : (
            <FolderOpen className="h-3.5 w-3.5 text-tertiary" />
          )}
        </div>
        <span
          className={cn(
            "text-sm font-medium truncate",
            isActive ? "text-accent-primary" : "text-primary"
          )}
        >
          {project.name}
        </span>
        <span className="text-xs font-mono text-tertiary ml-auto shrink-0">{project.identifier}</span>
      </button>
    );
  };

  const renderCategoryColumn = () => {
    if (!selectedProjectId) return null;
    return (
      <div className="w-[180px] shrink-0 border-r border-subtle flex flex-col overflow-hidden">
        <div className="px-4 pt-3 pb-2 border-b border-subtle shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-tertiary">
            <Tag className="h-3.5 w-3.5 shrink-0 text-accent-primary" />
            <span>工时类别</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 vertical-scrollbar scrollbar-sm">
          {isCategoriesLoading && categories.length === 0 ? (
            <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-tertiary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>加载类别…</span>
            </div>
          ) : categories.length === 0 ? (
            <div className="flex items-center justify-center py-6">
              <p className="text-xs text-tertiary">暂无可用类别</p>
            </div>
          ) : (
            categories.map((cat) => {
              const isSelected =
                selectedCategory?.projectId === selectedProjectId &&
                selectedCategory?.categoryKey === cat.key;
              return (
                <button
                  key={cat.id}
                  onClick={() => handleSelectCategory(selectedProjectId, cat.key)}
                  className={cn(
                    "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors cursor-pointer",
                    isSelected
                      ? "bg-accent-primary/10 text-accent-primary"
                      : "text-secondary hover:bg-layer-1"
                  )}
                >
                  <CategoryIcon keyName={cat.key} />
                  <span className="truncate">{cat.name}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  };

  // Right panel: project-kind content (无二级对象，只登记到项目+类别)
  const renderProjectCategoryPanel = () => {
    if (!selectedCategory || !selectedCategoryMeta) return null;
    const project = getProjectById(selectedCategory.projectId);
    if (!project) return null;

    const projectRow = makeProjectRow(selectedCategory.projectId, selectedCategoryMeta);
    const isSelected = selectedItems.has(projectRow.id);
    const description = selectedCategoryMeta.description?.trim()
      ? selectedCategoryMeta.description
      : `将工时登记在「${selectedCategoryMeta.name}」类别下，不关联具体工作项或测试用例。`;

    return (
      <>
        <div className="px-4 pt-3 pb-2 border-b border-subtle shrink-0">
          <div className="flex items-center gap-1.5 text-sm text-secondary">
            <span className="font-medium text-primary truncate">{project.name}</span>
            <ChevronRight className="h-3 w-3 text-tertiary shrink-0" />
            <span className="text-accent-primary font-medium">{selectedCategoryMeta.name}</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <p className="text-sm text-tertiary mb-4">{description}</p>
          <button
            onClick={() => toggleItemSelection(projectRow)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors cursor-pointer border",
              isSelected
                ? "bg-accent-primary/8 border-accent-primary/20"
                : "border-subtle hover:bg-layer-1"
            )}
          >
            {isSelected ? (
              <SquareCheckBig className="h-4.5 w-4.5 shrink-0 text-accent-primary" />
            ) : (
              <Square className="h-4.5 w-4.5 shrink-0 text-tertiary" />
            )}
            <div className="grid size-8 shrink-0 place-items-center rounded-md bg-surface-2">
              {project.logo_props ? (
                <Logo logo={project.logo_props} size={16} />
              ) : (
                <FolderOpen className="h-4 w-4 text-tertiary" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-primary truncate">{project.name}</p>
              <p className="text-xs text-tertiary">
                {project.identifier} · {selectedCategoryMeta.name}
              </p>
            </div>
          </button>
        </div>
      </>
    );
  };

  // Right panel: issue / test_case list content
  const renderItemListPanel = () => {
    if (!selectedCategory || !selectedCategoryMeta) return null;
    const panel = getCategoryPanelKind(selectedCategory.categoryKey);
    if (panel === "project") return null;

    const categoryLabel = selectedCategoryMeta.name;
    const searchPlaceholder = `搜索${categoryLabel}…`;
    const emptyText = panel === "issue" ? "未找到与我相关的工作项" : "未找到测试用例";

    return (
      <>
        {/* Category header with breadcrumb + search */}
        <div className="px-4 pt-3 pb-2 border-b border-subtle shrink-0 space-y-2">
          <div className="flex items-center gap-1.5 text-sm text-secondary">
            <span className="font-medium text-primary truncate">{selectedProject?.name}</span>
            <ChevronRight className="h-3 w-3 text-tertiary shrink-0" />
            <span className="text-accent-primary font-medium">{categoryLabel}</span>
            {panel === "issue" && (
              <span className="ml-1 text-xs text-tertiary">(我创建 / 我负责)</span>
            )}
          </div>
          <div className="flex items-center gap-2 rounded-md border border-subtle bg-layer-1/70 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-tertiary" />
            <input
              type="text"
              placeholder={searchPlaceholder}
              value={itemSearchQuery}
              onChange={(e) => setItemSearchQuery(e.target.value)}
              className="flex-1 bg-transparent text-sm text-primary placeholder:text-placeholder outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* Item list */}
        <div
          ref={listScrollRef}
          onScroll={handleListScroll}
          className="flex-1 overflow-y-auto px-2 py-1 relative vertical-scrollbar scrollbar-sm"
        >
          {isLoadingItems && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-1/60 backdrop-blur-[1px]">
              <Loader2 className="h-5 w-5 animate-spin text-tertiary" />
            </div>
          )}
          {itemsError ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-danger-primary">{itemsError}</p>
            </div>
          ) : panel === "issue" ? (
            issues.length === 0 && !isLoadingItems ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-tertiary">{emptyText}</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {issues.map((issue) => {
                  const rowId = `issue-${issue.id}`;
                  const isSelected = selectedItems.has(rowId);
                  const row = makeIssueRow(issue, selectedCategory.projectId, selectedCategoryMeta);
                  return (
                    <button
                      key={issue.id}
                      onClick={() => toggleItemSelection(row)}
                      className={cn(
                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors cursor-pointer",
                        isSelected
                          ? "bg-accent-primary/8 ring-1 ring-accent-primary/20"
                          : "hover:bg-layer-1"
                      )}
                    >
                      {isSelected ? (
                        <SquareCheckBig className="h-4 w-4 shrink-0 text-accent-primary" />
                      ) : (
                        <Square className="h-4 w-4 shrink-0 text-tertiary" />
                      )}
                      {renderIssueTypeIcon(issue)}
                      <span className="text-tertiary text-sm tabular-nums shrink-0">
                        #{issue.sequence_id}
                      </span>
                      <span className="text-sm text-primary truncate">{issue.name}</span>
                    </button>
                  );
                })}
              </div>
            )
          ) : testCases.length === 0 && !isLoadingItems ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-tertiary">{emptyText}</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {testCases.map((tc) => {
                const rowId = `test_case-${tc.id}`;
                const isSelected = selectedItems.has(rowId);
                const row = makeTestCaseRow(tc, selectedCategory.projectId, selectedCategoryMeta);
                return (
                  <button
                    key={tc.id}
                    onClick={() => toggleItemSelection(row)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-left transition-colors cursor-pointer",
                      isSelected
                        ? "bg-accent-primary/8 ring-1 ring-accent-primary/20"
                        : "hover:bg-layer-1"
                    )}
                  >
                    {isSelected ? (
                      <SquareCheckBig className="h-4 w-4 shrink-0 text-accent-primary" />
                    ) : (
                      <Square className="h-4 w-4 shrink-0 text-tertiary" />
                    )}
                    <ClipboardCheck className="h-3.5 w-3.5 shrink-0 text-tertiary" />
                    <span className="text-sm text-primary truncate">{tc.name}</span>
                  </button>
                );
              })}
              {isLoadingMore && (
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-tertiary" />
                  <span className="ml-2 text-xs text-tertiary">加载更多…</span>
                </div>
              )}
              {!isLoadingMore && testCases.length > 0 && testCasePage * TEST_CASE_PAGE_SIZE >= testCaseTotal && testCaseTotal > TEST_CASE_PAGE_SIZE && (
                <div className="flex items-center justify-center py-2">
                  <span className="text-xs text-tertiary">共 {testCaseTotal} 条，已全部加载</span>
                </div>
              )}
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <Transition appear show={open} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={handleClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-5xl rounded-xl bg-surface-1 shadow-raised-400 overflow-hidden border border-subtle flex flex-col" style={{ height: "min(75vh, 680px)" }}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-subtle shrink-0">
                  <Dialog.Title className="text-sm font-semibold text-primary">选择任务</Dialog.Title>
                  <button
                    onClick={handleClose}
                    className="p-1 rounded hover:bg-layer-1 text-tertiary hover:text-secondary transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Main content area */}
                <div className="flex flex-1 min-h-0 overflow-hidden">
                  {/* Left: Project tree */}
                  <div className="w-[280px] shrink-0 border-r border-subtle flex flex-col overflow-hidden">
                    <div className="px-3 pt-3 pb-2 shrink-0">
                      <div className="flex items-center gap-2 rounded-md border border-subtle bg-layer-1/70 px-2.5 py-1.5">
                        <Search className="h-3.5 w-3.5 shrink-0 text-tertiary" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          placeholder="搜索项目…"
                          value={projectSearchQuery}
                          onChange={(e) => setProjectSearchQuery(e.target.value)}
                          className="flex-1 bg-transparent text-sm text-primary placeholder:text-placeholder outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
                      {favoriteFiltered.length > 0 && (
                        <div className="mb-2">
                          <p className="px-2 py-1 text-xs font-semibold uppercase tracking-widest text-tertiary">
                            收藏
                          </p>
                          {favoriteFiltered.map(renderProjectNode)}
                        </div>
                      )}
                      {otherFiltered.length > 0 && (
                        <div>
                          {favoriteFiltered.length > 0 && (
                            <p className="px-2 py-1 text-xs font-semibold uppercase tracking-widest text-tertiary">
                              我负责的项目
                            </p>
                          )}
                          {otherFiltered.map(renderProjectNode)}
                        </div>
                      )}
                      {filteredProjectIds.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-10 gap-2">
                          <FolderOpen className="h-6 w-6 text-tertiary/40" />
                          <p className="text-xs text-tertiary">未找到匹配的项目</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Middle: Category list for selected project */}
                  {renderCategoryColumn()}

                  {/* Right: Content panel */}
                  <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                    {selectedCategory ? (
                      selectedPanelKind === "project" ? (
                        renderProjectCategoryPanel()
                      ) : (
                        renderItemListPanel()
                      )
                    ) : selectedProjectId ? (
                      <div className="flex h-full items-center justify-center">
                        <div className="flex flex-col items-center gap-3 text-center">
                          <Tag className="h-10 w-10 text-accent-primary/30" />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-secondary">选择工时类别</p>
                            <p className="text-xs text-tertiary">
                              在中间列选择一个类别，右侧会展示对应的任务列表
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <div className="flex flex-col items-center gap-3 text-center">
                          <FolderOpen className="h-10 w-10 text-tertiary/30" />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-secondary">选择左侧项目</p>
                            <p className="text-xs text-tertiary">再选择工时类别以浏览和添加</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-subtle shrink-0 bg-surface-1">
                  <div className="text-sm text-secondary">
                    {selectedItems.size > 0 ? (
                      <span>
                        已选择 <span className="font-semibold text-accent-primary">{selectedItems.size}</span> 项
                      </span>
                    ) : (
                      <span className="text-tertiary">点击列表中的项目以选择</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleClose}
                      className="px-4 py-1.5 rounded-md text-sm text-secondary hover:text-primary hover:bg-layer-1 transition-colors cursor-pointer"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleAddSelected}
                      disabled={selectedItems.size === 0}
                      className={cn(
                        "px-4 py-1.5 rounded-md text-sm font-semibold transition-colors",
                        selectedItems.size > 0
                          ? "bg-accent-primary text-on-color hover:bg-accent-primary-hover cursor-pointer"
                          : "bg-layer-1 text-placeholder cursor-not-allowed"
                      )}
                    >
                      {selectedItems.size > 0 ? `添加选中 (${selectedItems.size})` : "添加选中"}
                    </button>
                  </div>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
});
