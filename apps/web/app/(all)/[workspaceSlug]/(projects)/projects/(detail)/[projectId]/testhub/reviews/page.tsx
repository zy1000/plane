"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PageHead } from "@/components/core/page-title";
import { Modal, Pagination } from "antd";
import { FolderPlus, Pencil, Trash2 } from "lucide-react";
import styles from "./reviews.module.css";
import { CaseService } from "@/services/qa/review.service";
import {
  MODULE_TREE_ROOT_KEY,
  ModuleTreePanel,
  type TModuleTreeDropEvent,
  type TModuleTreeEditing,
  type TModuleTreeMenuItem,
  type TModuleTreeNode,
} from "@/components/qa/module-tree";
import CreateReviewModal from "@/components/qa/review/CreateReviewModal";
import { DEFAULT_REVIEW_DISPLAY_PROPERTIES } from "@/components/qa/review/reviews-display-filters";
import { ReviewsTable } from "@/components/qa/review/reviews-table";
import type { TReviewTableRecord } from "@/components/qa/review/reviews-table";
import { useAppRouter } from "@/hooks/use-app-router";
import { useTestHub } from "../testhub-context";
import { useProjectPermissions } from "@/hooks/store/use-project-permissions";
import UnauthorizedImg from "@/app/assets/auth/unauthorized.svg?url";
import { useTranslation } from "@plane/i18n";
import { qaCaseErrorContent, qaCaseSetToastError, qaCaseSetToastSuccess } from "@/utils/qa-case-error";

type ReviewModule = {
  id: string;
  name: string;
  review_count?: number;
  is_default?: boolean;
  repository?: string;
  parent?: string | null;
  children?: ReviewModule[];
};

type ReviewItem = {
  id: string;
  name: string;
  case_count?: number;
  state?: string;
  pass_rate?: any;
  mode?: string;
  assignees?: string[];
  created_by?: string | null;
  module_name?: string;
  started_at?: string | null;
  ended_at?: string | null;
  created_at?: string;
  module_id?: string | null;
};

const initialReviews: ReviewItem[] = [];
const QA_REVIEW_CREATE_PERMISSION_KEY = "qa.review.create" as const;
const QA_REVIEW_EDIT_PERMISSION_KEY = "qa.review.edit" as const;
const QA_REVIEW_DELETE_PERMISSION_KEY = "qa.review.delete" as const;
type TReviewFilters = {
  search?: string;
};

const getNodeCount = (module: any) => {
  const count = module?.review_count ?? module?.count ?? module?.total;
  return typeof count === "number" ? count : undefined;
};

const findModuleById = (list: ReviewModule[], id: string): ReviewModule | null => {
  for (const item of list || []) {
    if (String(item.id) === id) return item;
    const child = findModuleById(item.children || [], id);
    if (child) return child;
  }
  return null;
};

const hasDescendant = (node: ReviewModule, targetId: string): boolean => {
  for (const child of node.children || []) {
    if (String(child.id) === targetId) return true;
    if (hasDescendant(child, targetId)) return true;
  }
  return false;
};

const normalizeReviewsResponse = (response: unknown): { count: number; data: ReviewItem[] } => {
  const responseRecord = response as { count?: unknown; data?: unknown; results?: unknown; total_count?: unknown };
  const data = Array.isArray(response)
    ? response
    : Array.isArray(responseRecord?.data)
      ? responseRecord.data
      : Array.isArray(responseRecord?.results)
        ? responseRecord.results
        : [];
  const rawCount = responseRecord?.count ?? responseRecord?.total_count ?? data.length;

  return {
    count: Number(rawCount || 0),
    data: data as ReviewItem[],
  };
};

export default function ReviewsPage() {
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams<{ workspaceSlug: string; projectId: string }>();
  const searchParams = useSearchParams();
  const router = useAppRouter();
  const repositoryIdFromUrl = searchParams.get("repositoryId");
  const repositoryId =
    repositoryIdFromUrl || (typeof window !== "undefined" ? sessionStorage.getItem("selectedRepositoryId") : null);
  const repositoryKey = repositoryId ? String(repositoryId) : "all";
  const { fetched: permissionsFetched, hasPermission } = useProjectPermissions(
    String(workspaceSlug || ""),
    String(projectId || "")
  );
  const canCreateReview = permissionsFetched && hasPermission(QA_REVIEW_CREATE_PERMISSION_KEY);
  const canEditReview = permissionsFetched && hasPermission(QA_REVIEW_EDIT_PERMISSION_KEY);
  const canDeleteReview = permissionsFetched && hasPermission(QA_REVIEW_DELETE_PERMISSION_KEY);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  useEffect(() => {
    selectedModuleIdRef.current = selectedModuleId;
  }, [selectedModuleId]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [modules, setModules] = useState<ReviewModule[]>([]);
  // 树的行内编辑态（新建 / 重命名），同一时间只有一个
  const [editing, setEditing] = useState<TModuleTreeEditing>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [reviews, setReviews] = useState<ReviewItem[]>(initialReviews);
  const [total, setTotal] = useState<number>(0);
  const [allTotal, setAllTotal] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [reviewEnums, setReviewEnums] = useState<Record<string, Record<string, { label: string; color: string }>>>({});
  const [filters, setFilters] = useState<TReviewFilters>({});
  const caseService = useMemo(() => new CaseService(), []);
  const [createReviewOpen, setCreateReviewOpen] = useState<boolean>(false);
  const [createReviewInitialValues, setCreateReviewInitialValues] = useState<any | undefined>(undefined);
  const selectedModuleIdRef = useRef<string | null>(null);
  const { registerOpenNewReviewModal, registerReviewSearch, setReviewSearchValue } = useTestHub();
  const handleOpenCreateReview = useCallback(() => {
    if (!canCreateReview) return;
    setCreateReviewInitialValues(selectedModuleIdRef.current ? { module_id: selectedModuleIdRef.current } : undefined);
    setCreateReviewOpen(true);
  }, [canCreateReview]);

  useEffect(() => {
    registerOpenNewReviewModal(handleOpenCreateReview);
  }, [handleOpenCreateReview, registerOpenNewReviewModal]);
  const [editOpen, setEditOpen] = useState<boolean>(false);
  const [editReview, setEditReview] = useState<any>(null);

  const modulesTotalReviews = useMemo(() => {
    const sum = (list: ReviewModule[]): number =>
      (list || []).reduce((acc, n) => acc + Number(n?.review_count || 0) + sum(n?.children || []), 0);
    return sum(modules);
  }, [modules]);
  const totalReviews = typeof allTotal === "number" ? allTotal : modulesTotalReviews;

  useEffect(() => {
    if (!workspaceSlug) return;
    if (!permissionsFetched) return;
    if (!hasPermission("qa.review.view")) return;
    try {
      if (repositoryIdFromUrl) sessionStorage.setItem("selectedRepositoryId", repositoryIdFromUrl);
    } catch {}
    fetchModules();
    fetchEnums();
    fetchAllReviewsTotal();
    const storageKey = `reviews_name_filter_${workspaceSlug}_${repositoryKey}`;
    const savedName = sessionStorage.getItem(storageKey) || "";
    const initFilters: TReviewFilters = savedName ? { search: savedName } : {};
    setFilters(initFilters);
    setReviewSearchValue(initFilters.search || "");
    void fetchReviews(1, pageSize, selectedModuleId, initFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceSlug, repositoryKey, permissionsFetched, hasPermission]);

  const fetchModules = async () => {
    if (!workspaceSlug || !projectId) return;
    try {
      const data: ReviewModule[] = await caseService.getReviewModules(workspaceSlug as string, projectId as string);
      setModules(Array.isArray(data) ? data : []);
    } catch {
      // ignore error for placeholder page
    }
  };

  const fetchEnums = async () => {
    if (!workspaceSlug) return;
    try {
      const data = await caseService.getReviewEnums(workspaceSlug as string);
      setReviewEnums(data || {});
    } catch {}
  };

  const fetchAllReviewsTotal = async () => {
    if (!workspaceSlug || !projectId) return;
    try {
      const params: any = { page: 1, page_size: 1 };
      const res = await caseService.getReviews(workspaceSlug as string, projectId as string, params);
      setAllTotal(Number(res?.count || 0));
    } catch {
      setAllTotal(undefined);
    }
  };

  const fetchReviews = useCallback(
    async (
      page: number,
      size: number,
      moduleId: string | null,
      extraFilters: TReviewFilters = {}
    ) => {
      if (!workspaceSlug || !projectId) return;
      setLoading(true);
      setError("");
      try {
        const params: any = { page, page_size: size };
        if (moduleId) params.module_id = moduleId;
        if (extraFilters?.search) params.name__icontains = extraFilters.search;

        const res = await caseService.getReviews(workspaceSlug as string, projectId as string, params);
        const normalizedResponse = normalizeReviewsResponse(res);
        setReviews(normalizedResponse.data);
        setTotal(normalizedResponse.count);
      } catch (e: unknown) {
        const fallback = "加载失败";
        setError(qaCaseErrorContent(e, t, fallback));
        qaCaseSetToastError(e, t, fallback);
      } finally {
        setLoading(false);
      }
    },
    [caseService, projectId, t, workspaceSlug]
  );

  const handleAddUnderNode = (parentId: string) => {
    if (!canCreateReview) return;
    setEditing({ kind: "create", parentKey: parentId });
    if (parentId !== MODULE_TREE_ROOT_KEY)
      setExpandedKeys((prev) => (prev.includes(parentId) ? prev : [...prev, parentId]));
  };

  const handleCreateCommit = async (parentId: string, inputValue: string) => {
    setEditing(null);
    if (!canCreateReview) return;
    const name = inputValue.trim();
    if (!name || !workspaceSlug || !projectId) return;
    const payload: any = { name, project: projectId };
    if (parentId !== MODULE_TREE_ROOT_KEY) payload.parent = parentId;
    try {
      await caseService.createReviewModule(workspaceSlug as string, payload);
      await fetchModules();
      await fetchAllReviewsTotal();
    } catch (e: unknown) {
      qaCaseSetToastError(e, t, "创建评审模块失败");
    }
  };

  const startRenameNode = (moduleId: string, currentName: string) => {
    if (!canEditReview) return;
    setEditing({ kind: "rename", key: moduleId, initialValue: currentName });
  };

  const handleRenameCommit = async (moduleId: string, inputValue: string) => {
    setEditing(null);
    if (!canEditReview) return;
    const name = inputValue.trim();
    if (!name || !workspaceSlug) return;
    try {
      await caseService.updateReviewModule(workspaceSlug as string, moduleId, { name });
      await fetchModules();
    } catch (e: unknown) {
      qaCaseSetToastError(e, t, "重命名评审模块失败");
    }
  };

  const handleEditCommit = (value: string) => {
    if (!editing) return;
    if (editing.kind === "create") void handleCreateCommit(editing.parentKey, value);
    else void handleRenameCommit(editing.key, value);
  };

  const confirmDeleteModule = (module: ReviewModule) => {
    if (!canDeleteReview) return;
    Modal.confirm({
      title: "确认删除",
      content: "删除该评审模块将不可恢复，是否继续？",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!workspaceSlug || !module?.id) return;
        try {
          await caseService.deleteReviewModule(workspaceSlug as string, { ids: [module.id] });
          if (selectedModuleId === module.id) setSelectedModuleId(null);
          await fetchModules();
          await fetchAllReviewsTotal();
        } catch (e: unknown) {
          qaCaseSetToastError(e, t, "删除评审模块失败");
        }
      },
    });
  };

  const confirmDeleteReview = (review: ReviewItem) => {
    if (!canDeleteReview) return;
    Modal.confirm({
      title: "确认删除",
      content: "删除该评审将不可恢复，是否继续？",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!workspaceSlug || !review?.id) return;
        try {
          await caseService.deleteReview(workspaceSlug as string, projectId as string, { ids: [review.id] });
          await fetchReviews(currentPage, pageSize, selectedModuleId, filters);
          await fetchModules();
          await fetchAllReviewsTotal();
          qaCaseSetToastSuccess("评审已删除");
        } catch (e: unknown) {
          qaCaseSetToastError(e, t, "删除评审失败");
        }
      },
    });
  };

  const treeNodes = useMemo<TModuleTreeNode[]>(() => {
    const build = (list: ReviewModule[]): TModuleTreeNode[] =>
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
        disabled: !canCreateReview,
        onClick: () => handleAddUnderNode(node.key),
      },
    ];
    if (!module.is_default) {
      items.push(
        {
          key: "rename",
          label: "重命名",
          icon: <Pencil className="size-3.5" strokeWidth={1.75} />,
          disabled: !canEditReview,
          onClick: () => startRenameNode(node.key, node.label),
        },
        {
          key: "delete",
          label: "删除",
          icon: <Trash2 className="size-3.5" strokeWidth={1.75} />,
          danger: true,
          disabled: !canDeleteReview,
          onClick: () => confirmDeleteModule(module),
        }
      );
    }
    return items;
  };

  const handleTreeSelect = (key: string) => {
    const nextModuleId = key === MODULE_TREE_ROOT_KEY ? null : key;
    if (nextModuleId === selectedModuleId) return;
    setSelectedModuleId(nextModuleId);
    setCurrentPage(1);
    fetchModules();
  };

  // 评审模块树只支持换父级：拖到节点上成为其子模块，拖到「全部评审」上回到一级
  const handleTreeDrop = async ({ dragKey, targetKey, position }: TModuleTreeDropEvent) => {
    if (!canEditReview || !workspaceSlug || position !== "into") return;
    const dragModule = findModuleById(modules, dragKey);
    if (!dragModule) return;
    if (targetKey !== MODULE_TREE_ROOT_KEY && hasDescendant(dragModule, targetKey)) return;
    const newParent = targetKey === MODULE_TREE_ROOT_KEY ? null : targetKey;
    try {
      await caseService.updateReviewModule(workspaceSlug as string, dragKey, { parent: newParent });
      if (newParent) setExpandedKeys((prev) => (prev.includes(newParent) ? prev : [...prev, newParent]));
      await fetchModules();
      await fetchAllReviewsTotal();
    } catch (e: unknown) {
      qaCaseSetToastError(e, t, "移动评审模块失败");
    }
  };

  const selectedModuleName = selectedModuleId ? findModuleById(modules, selectedModuleId)?.name : undefined;

  useEffect(() => {
    if (!permissionsFetched) return;
    if (!hasPermission("qa.review.view")) return;
    void fetchReviews(currentPage, pageSize, selectedModuleId, filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedModuleId, currentPage, pageSize, filters, permissionsFetched, hasPermission]);

  const totalForCurrent = useMemo(() => {
    return total;
  }, [total]);

  const handlePaginationChange = (page: number, size?: number) => {
    const nextSize = size || pageSize;
    if (nextSize !== pageSize) {
      setPageSize(nextSize);
      if (currentPage !== 1) setCurrentPage(1);
      return;
    }
    if (page !== currentPage) setCurrentPage(page);
  };

  const handlePageSizeChange = (_current: number, size: number) => {
    if (size !== pageSize) setPageSize(size);
    if (currentPage !== 1) setCurrentPage(1);
  };

  const handleOpenReview = (record: TReviewTableRecord) => {
    try {
      sessionStorage.setItem("selectedReviewName", record.name || "");
    } catch {}
    router.push(`/${workspaceSlug}/projects/${projectId}/testhub/caseManagementReviewDetail?review_id=${record.id}`);
  };

  const handleEditReview = (record: TReviewTableRecord) => {
    if (!canEditReview) return;
    setEditReview({
      id: record.id,
      name: record.name,
      description: (record as any)?.description ?? "",
      module_id: (record as any)?.module ?? record.module_id ?? null,
      started_at: record.started_at ?? null,
      ended_at: record.ended_at ?? null,
      cases: (record as any)?.cases ?? [],
      case_count: record.case_count ?? undefined,
    });
    setEditOpen(true);
  };

  const handleReviewSearch = (query: string) => {
    const nextFilters: TReviewFilters = { ...filters, search: query.trim() || undefined };
    setFilters(nextFilters);
    setReviewSearchValue(query.trim() || "");
    const storageKey = `reviews_name_filter_${workspaceSlug}_${repositoryKey}`;
    try {
      sessionStorage.setItem(storageKey, nextFilters.search || "");
    } catch {}
    setCurrentPage(1);
  };

  useEffect(() => {
    registerReviewSearch(handleReviewSearch);
  }, [handleReviewSearch, registerReviewSearch]);

  const canViewReviews = permissionsFetched && hasPermission("qa.review.view");

  return (
    <div className={styles.container}>
      <PageHead title="评审" />
      {!permissionsFetched ? (
        <div className="flex h-full min-h-[50vh] w-full items-center justify-center">
          <div className="text-secondary">加载中...</div>
        </div>
      ) : !canViewReviews ? (
        <div className="flex h-full min-h-[50vh] w-full flex-col items-center justify-center gap-y-5 text-center">
          <div className="h-44 w-72">
            <img src={UnauthorizedImg} className="h-[176px] w-[288px] object-contain" alt="unauthorized" />
          </div>
          <h1 className="text-xl font-medium text-primary">您没有查看此页面的权限</h1>
        </div>
      ) : (
        <div className={styles.split}>
          <ModuleTreePanel
            root={{ label: "全部评审", count: totalReviews }}
            nodes={treeNodes}
            selectedKey={selectedModuleId ?? MODULE_TREE_ROOT_KEY}
            onSelect={handleTreeSelect}
            expandedKeys={expandedKeys}
            onExpandedKeysChange={setExpandedKeys}
            editing={editing}
            onEditCommit={handleEditCommit}
            onEditCancel={() => setEditing(null)}
            getMenuItems={getMenuItems}
            dragMode={canEditReview ? "reparent" : "none"}
            onDrop={handleTreeDrop}
            onAddRoot={canCreateReview ? () => handleAddUnderNode(MODULE_TREE_ROOT_KEY) : undefined}
            railLabel={selectedModuleName || "全部评审"}
          />
          <div className={`${styles.right} overflow-hidden !py-0`}>
            <div className="flex h-full flex-col overflow-hidden">
              <div className="min-h-0 flex-1 overflow-hidden">
                {error ? (
                  <div className="m-3 rounded-md border border-danger-subtle bg-danger-subtle p-4">
                    <div className="text-sm text-danger-primary">{error}</div>
                  </div>
                ) : (
                  <div className="flex h-full flex-col overflow-hidden">
                    <div className="relative min-w-0 flex-1 overflow-hidden px-0">
                      <ReviewsTable
                        canDelete={canDeleteReview}
                        canEdit={canEditReview}
                        displayProperties={DEFAULT_REVIEW_DISPLAY_PROPERTIES}
                        loading={loading}
                        onDelete={(record) => confirmDeleteReview(record as ReviewItem)}
                        onEdit={handleEditReview}
                        onOpen={handleOpenReview}
                        reviewEnums={reviewEnums}
                        reviews={reviews as TReviewTableRecord[]}
                      />
                    </div>
                    <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-4 py-3">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-secondary">
                          {totalForCurrent > 0
                            ? `第 ${(currentPage - 1) * pageSize + 1}-${Math.min(
                                currentPage * pageSize,
                                totalForCurrent
                              )} 条，共 ${totalForCurrent} 条`
                            : ""}
                        </span>
                      </div>
                      <Pagination
                        simple
                        current={currentPage}
                        pageSize={pageSize}
                        total={totalForCurrent}
                        showSizeChanger
                        pageSizeOptions={["10", "20", "50", "100"]}
                        onChange={handlePaginationChange}
                        onShowSizeChange={handlePageSizeChange}
                        size="small"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
            <style
              dangerouslySetInnerHTML={{
                __html: `
                .testhub-reviews-table-scroll{
                  scrollbar-gutter: stable;
                }

              `,
              }}
            />
          </div>
          {canCreateReview && (
            <CreateReviewModal
              open={createReviewOpen}
              initialValues={createReviewInitialValues}
              onClose={() => {
                fetchReviews(currentPage, pageSize, selectedModuleId, filters);
                fetchModules();
                fetchAllReviewsTotal();
                setCreateReviewOpen(false);
                setCreateReviewInitialValues(undefined);
              }}
            />
          )}
          {canEditReview && editOpen && (
            <CreateReviewModal
              open={editOpen}
              mode="edit"
              initialValues={editReview || undefined}
              onClose={() => {
                fetchReviews(currentPage, pageSize, selectedModuleId, filters);
                fetchModules();
                fetchAllReviewsTotal();
                setEditOpen(false);
                setEditReview(null);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
