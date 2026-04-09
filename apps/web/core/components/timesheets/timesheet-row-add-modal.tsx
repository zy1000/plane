/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Dialog, Transition } from "@headlessui/react";
import * as LucideIcons from "lucide-react";
import {
  ChevronRight,
  ClipboardCheck,
  Clock,
  FolderOpen,
  Layers,
  Loader2,
  Search,
  Square,
  SquareCheckBig,
  X,
} from "lucide-react";
import { observer } from "mobx-react";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { cn } from "@plane/utils";
import { useProject } from "@/hooks/store/use-project";
import { useUser } from "@/hooks/store/user";
import { IssueService } from "@/services/issue/issue.service";
import { CaseService } from "@/services/qa/case.service";
import { ProjectIssueTypeService, type TIssueType } from "@/services/project";
import type { TTimesheetRow } from "@/hooks/store/use-timesheet-page";

const issueService = new IssueService();
const caseService = new CaseService();
const projectIssueTypeService = new ProjectIssueTypeService();


type TCategoryType = "issue" | "test_case" | "project";

type TSelectedCategory = {
  projectId: string;
  type: TCategoryType;
};

type TIssueItem = {
  id: string;
  name: string;
  sequence_id: number;
  type_id: string | null;
  type?: TIssueType | null;
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

function renderIssueTypeIcon(issue: TIssueItem, issueTypesMap: Record<string, TIssueType>) {
  const typeId = (issue.type?.id as string | undefined) ?? issue.type_id ?? undefined;

  const logoProps = issue.type?.logo_props?.icon ?? (typeId ? issueTypesMap[typeId]?.logo_props?.icon : undefined);

  if (logoProps) {
    const { name, color, background_color } = logoProps;
    const IconComp = (LucideIcons as any)[name] as
      | ComponentType<{ className?: string; strokeWidth?: number }>
      | undefined;
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-sm"
        style={{
          backgroundColor: background_color || "transparent",
          color: color || "currentColor",
          width: "16px",
          height: "16px",
        }}
      >
        {IconComp ? <IconComp className="h-3.5 w-3.5" strokeWidth={2} /> : <Layers className="h-3.5 w-3.5" />}
      </span>
    );
  }

  return <Layers className="h-3.5 w-3.5 shrink-0 text-tertiary" aria-hidden />;
}

function parseIssueItems(raw: any): TIssueItem[] {
  const list = Array.isArray(raw) ? raw : raw?.results ?? [];
  return list.map((i: any) => ({
    id: String(i.id),
    name: String(i.name || ""),
    sequence_id: Number(i.sequence_id || 0),
    type_id: i.type_id != null && i.type_id !== "" ? String(i.type_id) : null,
    type: i.type ?? undefined,
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

export const TimesheetRowAddModal = observer(function TimesheetRowAddModal({
  open,
  workspaceSlug,
  onAdd,
  onClose,
}: TTimesheetRowAddModalProps) {
  const { joinedProjectIds, favoriteProjectIds, getProjectById } = useProject();
  const { data: currentUser } = useUser();
  const currentUserId = currentUser?.id;

  // Tree state
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<TSelectedCategory | null>(null);
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [itemSearchQuery, setItemSearchQuery] = useState("");

  // Data state
  const [issues, setIssues] = useState<TIssueItem[]>([]);
  const [testCases, setTestCases] = useState<TTestCaseItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [issueTypesCache, setIssueTypesCache] = useState<Record<string, Record<string, TIssueType>>>({});

  // Selection state: Map<rowId, TTimesheetRow>
  const [selectedItems, setSelectedItems] = useState<Map<string, TTimesheetRow>>(new Map());

  const searchInputRef = useRef<HTMLInputElement>(null);

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

  const ensureIssueTypes = useCallback(
    (projectId: string) => {
      if (issueTypesCache[projectId] || !workspaceSlug) return;
      projectIssueTypeService
        .fetchProjectIssueTypes(workspaceSlug, projectId)
        .then((types) => {
          const map: Record<string, TIssueType> = {};
          for (const t of types) {
            if (t?.id) map[t.id] = t;
          }
          setIssueTypesCache((prev) => ({ ...prev, [projectId]: map }));
        })
        .catch(() => {
          setIssueTypesCache((prev) => ({ ...prev, [projectId]: {} }));
        });
    },
    [workspaceSlug, issueTypesCache]
  );

  const fetchItems = useCallback(
    async (category: TSelectedCategory, query: string) => {
      if (!workspaceSlug || !category || category.type === "project") return;
      setIsLoadingItems(true);
      setItemsError(null);

      try {
        if (category.type === "issue") {
          ensureIssueTypes(category.projectId);

          const baseParams: Record<string, any> = {
            ...(query ? { name: query } : {}),
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
        }
      } catch {
        if (category.type === "issue") {
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
    [workspaceSlug, currentUserId, ensureIssueTypes]
  );

  useEffect(() => {
    if (!open || !selectedCategory || selectedCategory.type === "project") return;
    const timer = setTimeout(() => {
      fetchItems(selectedCategory, itemSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [open, selectedCategory, itemSearchQuery, fetchItems]);

  useEffect(() => {
    if (open) {
      setExpandedProjects(new Set());
      setSelectedCategory(null);
      setProjectSearchQuery("");
      setItemSearchQuery("");
      setIssues([]);
      setTestCases([]);
      setSelectedItems(new Map());
      setItemsError(null);
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [open]);

  const toggleProjectExpand = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const handleSelectCategory = (projectId: string, type: TCategoryType) => {
    setSelectedCategory({ projectId, type });
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

  const makeIssueRow = (issue: TIssueItem, projectId: string): TTimesheetRow => {
    const project = getProjectById(projectId);
    return {
      id: `issue-${issue.id}`,
      type: "issue",
      projectId,
      projectName: project?.name,
      issueId: issue.id,
      issueName: issue.name,
      issueSequenceId: issue.sequence_id,
      issueTypeId: issue.type?.id ?? issue.type_id ?? null,
      displayName: `#${issue.sequence_id} ${issue.name}`,
    };
  };

  const makeTestCaseRow = (tc: TTestCaseItem, projectId: string): TTimesheetRow => {
    const project = getProjectById(projectId);
    return {
      id: `test_case-${tc.id}`,
      type: "test_case",
      projectId,
      projectName: project?.name,
      testCaseId: tc.id,
      testCaseName: tc.name,
      displayName: tc.name,
    };
  };

  const makeProjectRow = (projectId: string): TTimesheetRow => {
    const project = getProjectById(projectId);
    const name = project?.name || "项目工时";
    return {
      id: `project-${projectId}`,
      type: "project",
      projectId,
      projectName: name,
      displayName: name,
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

  const selectedProject = selectedCategory ? getProjectById(selectedCategory.projectId) : null;

  const renderProjectNode = (pid: string) => {
    const project = getProjectById(pid);
    if (!project) return null;
    const isExpanded = expandedProjects.has(pid);
    const isIssueSelected = selectedCategory?.projectId === pid && selectedCategory?.type === "issue";
    const isTestCaseSelected = selectedCategory?.projectId === pid && selectedCategory?.type === "test_case";
    const isProjectSelected = selectedCategory?.projectId === pid && selectedCategory?.type === "project";

    return (
      <div key={pid}>
        <button
          onClick={() => toggleProjectExpand(pid)}
          className="group w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-layer-1 cursor-pointer"
        >
          <ChevronRight
            className={cn("h-3 w-3 shrink-0 text-tertiary transition-transform duration-150", isExpanded && "rotate-90")}
          />
          <div className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-2">
            {project.logo_props ? (
              <Logo logo={project.logo_props} size={14} />
            ) : (
              <FolderOpen className="h-3.5 w-3.5 text-tertiary" />
            )}
          </div>
          <span className="text-sm font-medium text-primary truncate">{project.name}</span>
          <span className="text-[10px] font-mono text-tertiary ml-auto shrink-0">{project.identifier}</span>
        </button>

        {isExpanded && (
          <div className="ml-5 border-l border-subtle pl-2 space-y-0.5 mt-0.5">
            <button
              onClick={() => handleSelectCategory(pid, "project")}
              className={cn(
                "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors cursor-pointer",
                isProjectSelected ? "bg-accent-primary/10 text-accent-primary" : "text-secondary hover:bg-layer-1"
              )}
            >
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>项目工时</span>
            </button>
            <button
              onClick={() => handleSelectCategory(pid, "issue")}
              className={cn(
                "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors cursor-pointer",
                isIssueSelected ? "bg-accent-primary/10 text-accent-primary" : "text-secondary hover:bg-layer-1"
              )}
            >
              <Layers className="h-3.5 w-3.5 shrink-0" />
              <span>工作项</span>
            </button>
            <button
              onClick={() => handleSelectCategory(pid, "test_case")}
              className={cn(
                "w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors cursor-pointer",
                isTestCaseSelected ? "bg-accent-primary/10 text-accent-primary" : "text-secondary hover:bg-layer-1"
              )}
            >
              <ClipboardCheck className="h-3.5 w-3.5 shrink-0" />
              <span>测试用例</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  // Right panel: project category content
  const renderProjectCategoryPanel = () => {
    if (!selectedCategory || selectedCategory.type !== "project") return null;
    const project = getProjectById(selectedCategory.projectId);
    if (!project) return null;

    const projectRow = makeProjectRow(selectedCategory.projectId);
    const isSelected = selectedItems.has(projectRow.id);

    return (
      <>
        <div className="px-4 pt-3 pb-2 border-b border-subtle shrink-0">
          <div className="flex items-center gap-1.5 text-sm text-secondary">
            <span className="font-medium text-primary truncate">{project.name}</span>
            <ChevronRight className="h-3 w-3 text-tertiary shrink-0" />
            <span className="text-accent-primary font-medium">项目工时</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          <p className="text-sm text-tertiary mb-4">
            将工时直接记录在项目级别，不关联具体的工作项或测试用例。
          </p>
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
              <p className="text-xs text-tertiary">{project.identifier} · 项目工时</p>
            </div>
          </button>
        </div>
      </>
    );
  };

  // Right panel: issue / test_case list content
  const renderItemListPanel = () => {
    if (!selectedCategory || selectedCategory.type === "project") return null;

    const categoryLabel = selectedCategory.type === "issue" ? "工作项" : "测试用例";
    const searchPlaceholder = selectedCategory.type === "issue" ? "搜索工作项…" : "搜索测试用例…";

    return (
      <>
        {/* Category header with breadcrumb + search */}
        <div className="px-4 pt-3 pb-2 border-b border-subtle shrink-0 space-y-2">
          <div className="flex items-center gap-1.5 text-sm text-secondary">
            <span className="font-medium text-primary truncate">{selectedProject?.name}</span>
            <ChevronRight className="h-3 w-3 text-tertiary shrink-0" />
            <span className="text-accent-primary font-medium">{categoryLabel}</span>
            {selectedCategory.type === "issue" && (
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
        <div className="flex-1 overflow-y-auto px-2 py-1 relative vertical-scrollbar scrollbar-sm">
          {isLoadingItems && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-1/60 backdrop-blur-[1px]">
              <Loader2 className="h-5 w-5 animate-spin text-tertiary" />
            </div>
          )}
          {itemsError ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-danger-primary">{itemsError}</p>
            </div>
          ) : selectedCategory.type === "issue" ? (
            issues.length === 0 && !isLoadingItems ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-tertiary">未找到与我相关的工作项</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {issues.map((issue) => {
                  const rowId = `issue-${issue.id}`;
                  const isSelected = selectedItems.has(rowId);
                  const row = makeIssueRow(issue, selectedCategory.projectId);
                  const typesMap = issueTypesCache[selectedCategory.projectId] ?? {};
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
                      {renderIssueTypeIcon(issue, typesMap)}
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
              <p className="text-sm text-tertiary">未找到测试用例</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {testCases.map((tc) => {
                const rowId = `test_case-${tc.id}`;
                const isSelected = selectedItems.has(rowId);
                const row = makeTestCaseRow(tc, selectedCategory.projectId);
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
                          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-tertiary">
                            收藏
                          </p>
                          {favoriteFiltered.map(renderProjectNode)}
                        </div>
                      )}
                      {otherFiltered.length > 0 && (
                        <div>
                          {favoriteFiltered.length > 0 && (
                            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-tertiary">
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

                  {/* Right: Content panel */}
                  <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                    {selectedCategory ? (
                      selectedCategory.type === "project" ? (
                        renderProjectCategoryPanel()
                      ) : (
                        renderItemListPanel()
                      )
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <div className="flex flex-col items-center gap-3 text-center">
                          <FolderOpen className="h-10 w-10 text-tertiary/30" />
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-secondary">展开左侧项目</p>
                            <p className="text-xs text-tertiary">选择「项目工时」「工作项」或「测试用例」以浏览和添加</p>
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
