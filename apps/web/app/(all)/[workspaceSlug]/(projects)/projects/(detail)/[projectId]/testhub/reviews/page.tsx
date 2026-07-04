"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PageHead } from "@/components/core/page-title";
import { Input, Dropdown, Button, Modal, Pagination, Tree } from "antd";
import type { TreeProps } from "antd";
import { AppstoreOutlined, EllipsisOutlined } from "@ant-design/icons";
import { FolderOpenDot } from "lucide-react";
import styles from "./reviews.module.css";
import { CaseService } from "@/services/qa/review.service";
import { ChevronDownIcon } from "@plane/propel/icons";
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

const filterModulesByName = (list: any[], queryValue: string): any[] => {
  if (!queryValue) return list || [];
  const query = queryValue.trim().toLowerCase();
  const walk = (nodes: any[]): any[] =>
    (nodes || [])
      .map((node) => {
        const name = String(node?.name || "").toLowerCase();
        const childMatches = walk(node?.children || []);
        const selfMatch = name.includes(query);
        if (selfMatch || childMatches.length) {
          return Object.assign({}, node, { children: childMatches });
        }
        return null;
      })
      .filter(Boolean) as any[];
  return walk(list || []);
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
    <div
      className="w-full"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="presentation"
    >
      <Input
        size="small"
        // eslint-disable-next-line jsx-a11y/no-autofocus
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
  const [leftWidth, setLeftWidth] = useState<number>(300);
  const isDraggingRef = useRef<boolean>(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);
  const search = "";
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  useEffect(() => {
    selectedModuleIdRef.current = selectedModuleId;
  }, [selectedModuleId]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [modules, setModules] = useState<ReviewModule[]>([]);
  const [creatingParentId, setCreatingParentId] = useState<string | "all" | null>(null);
  const [renamingModuleId, setRenamingModuleId] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>(["all"]);
  const [autoExpandParent, setAutoExpandParent] = useState<boolean>(true);
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

  useEffect(() => {
    return () => {
      window.removeEventListener("mousemove", onMouseMoveResize as any);
      window.removeEventListener("mouseup", onMouseUpResize as any);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const onExpand: TreeProps["onExpand"] = (keys) => {
    setExpandedKeys(keys as string[]);
    setAutoExpandParent(false);
  };

  const handleAddUnderNode = (parentId: string | "all") => {
    if (!canCreateReview) return;
    setRenamingModuleId(null);
    setCreatingParentId(parentId);
    setExpandedKeys((prev) => {
      const pid = String(parentId);
      return prev.includes(pid) ? prev : [...prev, pid];
    });
    setAutoExpandParent(true);
  };

  const handleCreateBlurOrEnter = async (parentId: string | "all", inputValue: string) => {
    if (!canCreateReview) {
      setCreatingParentId(null);
      return;
    }
    const name = inputValue.trim();
    if (!name || !workspaceSlug || !projectId) {
      setCreatingParentId(null);
      return;
    }
    const payload: any = { name, project: projectId };
    if (parentId !== "all") payload.parent = parentId;
    try {
      await caseService.createReviewModule(workspaceSlug as string, payload);
      setCreatingParentId(null);
      await fetchModules();
      await fetchAllReviewsTotal();
    } catch (e: unknown) {
      setCreatingParentId(null);
      qaCaseSetToastError(e, t, "创建评审模块失败");
    }
  };

  const startRenameNode = (moduleId: string) => {
    if (!canEditReview) return;
    setCreatingParentId(null);
    setRenamingModuleId(moduleId);
    setExpandedKeys((prev) => (prev.includes(moduleId) ? prev : [...prev, moduleId]));
    setAutoExpandParent(true);
  };

  const handleRenameBlurOrEnter = async (moduleId: string, inputValue: string) => {
    if (!canEditReview) {
      setRenamingModuleId(null);
      return;
    }
    const name = inputValue.trim();
    if (!name || !workspaceSlug) {
      setRenamingModuleId(null);
      return;
    }
    try {
      await caseService.updateReviewModule(workspaceSlug as string, moduleId, { name });
      setRenamingModuleId(null);
      await fetchModules();
    } catch (e: unknown) {
      setRenamingModuleId(null);
      qaCaseSetToastError(e, t, "重命名评审模块失败");
    }
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

  const renderCreatingInput = (parentId: string | "all") => (
    <ModuleInput placeholder="请输入模块名称" onCommit={(val) => handleCreateBlurOrEnter(parentId, val)} />
  );

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
          <Button type="text" size="small" disabled={!canCreateReview} onClick={() => handleAddUnderNode(nodeId)}>
            添加
          </Button>
        ),
      },
      ...(!isDefault
        ? [
            {
              key: "rename",
              label: (
                <Button
                  type="text"
                  size="small"
                  disabled={!canEditReview}
                  onClick={() => startRenameNode(nodeId)}
                >
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
                  disabled={!canDeleteReview}
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

  const filteredModules = useMemo(() => filterModulesByName(modules, search), [modules, search]);

  const treeData = [
    {
      title: (
        <div className="group flex w-full items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center text-secondary">
              <AppstoreOutlined />
            </span>
            <span className="text-sm font-medium text-primary">全部评审</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-secondary">{totalReviews}</span>
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
                        disabled={!canCreateReview}
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
  };

  const onDrop: TreeProps["onDrop"] = async (info) => {
    if (!canEditReview) return;
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
      await caseService.updateReviewModule(workspaceSlug as string, dragKey, { parent: newParent });
      setExpandedKeys((prev) => {
        if (dropKey === "all" || prev.includes(dropKey)) return prev;
        return [...prev, dropKey];
      });
      await fetchModules();
      await fetchAllReviewsTotal();
    } catch {}
  };

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
      assignees: Array.isArray(record.assignees) ? record.assignees : [],
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
          <div className={`${styles.left} flex h-full flex-col`} style={{ width: leftWidth }}>
            <div className={`${styles.treeRoot} vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto pt-2`}>
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
                draggable={canEditReview}
                showIcon={false}
                switcherIcon={() => (
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
                className="custom-tree-indent testhub-review-module-tree py-2 pl-2"
              />
            </div>
            <div className={styles.resizer} onMouseDown={onMouseDownResize} role="presentation" />
          </div>
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

                .testhub-review-module-tree .ant-tree-draggable-icon{
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
                  padding-inline: 4px !important;
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
