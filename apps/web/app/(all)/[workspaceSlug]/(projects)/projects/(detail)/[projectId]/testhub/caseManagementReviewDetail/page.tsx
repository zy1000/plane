"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useMemo, type ReactNode } from "react";
import { PageHead } from "@/components/core/page-title";
import { Breadcrumbs } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { Row, Col, Tree, Table, Button, Tag, Pagination, Popconfirm, Select } from "antd";
import type { TreeProps, TableProps } from "antd";
import { AppstoreOutlined, DownOutlined } from "@ant-design/icons";
import { CaseService as CaseApiService } from "@/services/qa/case.service";
import { CaseService as ReviewApiService } from "@/services/qa/review.service";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ChevronDownIcon } from "@plane/propel/icons";
import { FolderOpenDot, Atom } from "lucide-react";
import UpdateModal from "@/components/qa/cases/update-modal";
import TestCaseSelectionModal from "@/components/qa/review/TestCaseSelectionModal";
import { useUser } from "@/hooks/store/user";
import { useTranslation } from "@plane/i18n";
import {
  qaCaseErrorContent,
  qaCaseSetToastError,
  qaCaseSetToastSuccess,
  qaCaseSetToastWarning,
} from "@/utils/qa-case-error";
import { useProjectPermissions } from "@/hooks/store/use-project-permissions";

const QA_REVIEW_EDIT_PERMISSION_KEY = "qa.review.edit" as const;

type ReviewCaseRow = {
  id: string;
  case_id: string;
  code?: string;
  name: string;
  priority: number;
  assignees: string[];
  result: string;
  created_by: string | null;
};

export default function CaseManagementReviewDetailPage() {
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams<{ workspaceSlug: string; projectId: string }>();
  const searchParams = useSearchParams();
  const reviewId = searchParams.get("review_id") ?? "";
  const repositoryIdFromUrl = searchParams.get("repositoryId");
  const repositoryId =
    repositoryIdFromUrl || (typeof window !== "undefined" ? sessionStorage.getItem("selectedRepositoryId") : null);
  const reviewName = typeof window !== "undefined" ? sessionStorage.getItem("selectedReviewName") : "";
  const router = useRouter();
  const { fetched: permissionsFetched, hasPermission } = useProjectPermissions(
    String(workspaceSlug || ""),
    String(projectId || "")
  );
  const canEditReview = permissionsFetched && hasPermission(QA_REVIEW_EDIT_PERMISSION_KEY);

  const caseService = useMemo(() => new CaseApiService(), []);
  const reviewService = useMemo(() => new ReviewApiService(), []);

  const [reviewTree, setReviewTree] = useState<any | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[] | undefined>(undefined);
  const [autoExpandParent, setAutoExpandParent] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reviewCases, setReviewCases] = useState<ReviewCaseRow[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [total, setTotal] = useState<number>(0);
  const [ordering, setOrdering] = useState<string | undefined>(undefined);
  const [reviewEnums, setReviewEnums] = useState<Record<string, Record<string, { label: string; color: string }>>>({});
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(false);
  const [activeCaseId, setActiveCaseId] = useState<string | undefined>(undefined);
  const [selectedTreeKey, setSelectedTreeKey] = useState<string>("root");
  const [isCaseSelectionOpen, setIsCaseSelectionOpen] = useState(false);
  const { data: currentUser } = useUser();
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);
  const [selectedCaseMap, setSelectedCaseMap] = useState<Record<string, string>>({});

  const [reviewList, setReviewList] = useState<Array<{ id: string; name: string }>>([]);
  const [reviewListLoading, setReviewListLoading] = useState<boolean>(false);

  const selectionContextKey = useMemo(() => {
    return JSON.stringify({
      reviewId,
      selectedModuleId,
      ordering,
    });
  }, [reviewId, selectedModuleId, ordering]);
  const lastSelectionContextKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (lastSelectionContextKeyRef.current !== null && lastSelectionContextKeyRef.current !== selectionContextKey) {
      setSelectedCaseIds([]);
      setSelectedCaseMap({});
    }
    lastSelectionContextKeyRef.current = selectionContextKey;
  }, [selectionContextKey]);

  const [leftWidth, setLeftWidth] = useState<number>(280);
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
    []
  );

  const onExpand: TreeProps["onExpand"] = (keys) => {
    setExpandedKeys(keys as string[]);
    setAutoExpandParent(false);
  };

  const fetchReviewTree = async () => {
    if (!workspaceSlug || !reviewId) return;
    try {
      const data = await caseService.getReviewCaseTree(workspaceSlug as string, { review_id: reviewId });
      setReviewTree(data || null);
    } catch (e) {
      setError("获取用例树失败，请稍后重试");
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
    moduleId?: string | null,
    orderingParam?: string | null
  ) => {
    if (!workspaceSlug || !reviewId) return;
    try {
      // setLoading(true);
      setError(null);
      const effectiveOrdering = orderingParam === undefined ? ordering : (orderingParam ?? undefined);
      const listParams = {
        page,
        page_size: size,
        module_id: typeof moduleId === "undefined" ? selectedModuleId : moduleId,
        ...(effectiveOrdering ? { ordering: effectiveOrdering } : {}),
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

  useEffect(() => {
    try {
      if (repositoryIdFromUrl) sessionStorage.setItem("selectedRepositoryId", repositoryIdFromUrl);
    } catch {}
    setReviewTree(null);
    fetchReviewTree();
    fetchReviewEnums();
    fetchReviewCaseList(1, pageSize);
    setSelectedTreeKey("root");
    setSelectedModuleId(null);
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

  const renderNodeTitle = (title: string, icon: ReactNode, count?: number, fontMedium?: boolean) => {
    return (
      <div className="group flex w-full items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center text-secondary">{icon}</span>
          <span className={`text-sm text-primary ${fontMedium ? "font-medium" : ""}`}>{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {typeof count === "number" && <span className="text-xs text-secondary">{count}</span>}
        </div>
      </div>
    );
  };

  function getTreeNodeKey(node: any): string {
    const kind = String(node?.kind || "");
    const id = String(node?.id || "");
    const repositoryId = node?.repository_id ? String(node.repository_id) : null;

    if (kind === "root") return "root";
    if (kind === "repository") return `repo:${id}`;
    if (kind === "repository_modules_all") return `repo:${repositoryId}:all_modules`;
    if (kind === "module") return `module:${id}`;
    return id;
  }

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

  const treeData = useMemo(() => {
    if (!reviewTree) return [];
    const buildTreeNodes = (node: any): any => {
      const kind = String(node?.kind || "");
      const id = String(node?.id || "");
      const repositoryId = node?.repository_id ? String(node.repository_id) : null;

      const key = getTreeNodeKey(node);

      const icon =
        kind === "root" ? (
          <AppstoreOutlined />
        ) : kind === "repository" ? (
          <Atom size={14} />
        ) : kind === "repository_modules_all" ? (
          <AppstoreOutlined />
        ) : (
          <FolderOpenDot size={14} />
        );

      const children = Array.isArray(node?.children) ? node.children : [];

      return {
        title: renderNodeTitle(
          node?.name ?? "-",
          icon,
          undefined,
          kind === "root" || kind === "repository_modules_all"
        ),
        key,
        kind,
        repositoryId,
        moduleId: kind === "module" ? id : null,
        children: children.map((c: any) => buildTreeNodes(c)),
      };
    };
    return [buildTreeNodes(reviewTree)];
  }, [reviewTree]);

  useEffect(() => {
    if (!reviewTree) return;
    setExpandedKeys(collectDefaultExpandedKeys(reviewTree));
    setAutoExpandParent(true);
  }, [reviewTree]);

  const onSelect: TreeProps["onSelect"] = (selectedKeys, info) => {
    const key = Array.isArray(selectedKeys) && selectedKeys.length > 0 ? String(selectedKeys[0]) : "root";
    setSelectedTreeKey(key);

    const node: any = (info as any)?.node || {};
    const kind = node?.kind as string | undefined;

    if (!kind || kind === "root" || kind === "repository" || kind === "repository_modules_all") {
      setSelectedModuleId(null);
      fetchReviewCaseList(1, pageSize, null);
      return;
    }

    if (kind === "module") {
      const moduleId = node?.moduleId ? String(node.moduleId) : null;
      setSelectedModuleId(moduleId);
      fetchReviewCaseList(1, pageSize, moduleId);
    }
  };

  const priorityLabelMap: Record<number, string> = { 0: "低", 1: "中", 2: "高" };

  const columns = [
    {
      title: "用例编号",
      dataIndex: "code",
      key: "code",
      sorter: true,
      sortOrder: ordering === "case__code" ? "ascend" : ordering === "-case__code" ? "descend" : null,
      render: (code: string | undefined, record: ReviewCaseRow) => (
        <Button
          type="link"
          size="small"
          className="h-auto p-0 !text-primary hover:!text-primary"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!record?.case_id) {
              qaCaseSetToastWarning("缺少用例信息，无法打开");
              return;
            }
            setActiveCaseId(String(record.case_id));
            setIsCaseModalOpen(true);
          }}
        >
          <span className="text-inherit">{code || "-"}</span>
        </Button>
      ),
    },
    {
      title: "用例名称",
      dataIndex: "name",
      key: "name",
      width: 220,
      render: (name: string, record: ReviewCaseRow) => (
        <Button
          type="link"
          size="small"
          className="h-auto p-0 !text-primary hover:!text-primary"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!record?.case_id) {
              qaCaseSetToastWarning("缺少用例信息，无法打开");
              return;
            }
            setActiveCaseId(String(record.case_id));
            setIsCaseModalOpen(true);
          }}
        >
          <span className="block max-w-[200px] truncate text-inherit" title={name || ""}>
            {name || "-"}
          </span>
        </Button>
      ),
    },
    {
      title: "用例库",
      dataIndex: "repository",
      key: "repository",
      render: (v: string | null) => v ?? "",
    },
    {
      title: "模块",
      dataIndex: "module",
      key: "module",
      render: (v: string | null) => v ?? "",
    },
    {
      title: "用例等级",
      dataIndex: "priority",
      key: "priority",
      render: (v: number) => priorityLabelMap[v] ?? "-",
    },
    {
      title: "评审人",
      dataIndex: "assignees",
      key: "assignees",
      render: (assignees: string[] = []) => (
        <MemberDropdown
          multiple={true}
          value={assignees}
          onChange={() => {}}
          disabled={true}
          placeholder={"未知用户"}
          className="w-full text-sm"
          buttonContainerClassName="w-full text-left p-0 cursor-default"
          buttonVariant="transparent-with-text"
          buttonClassName="text-sm p-0 hover:bg-transparent hover:bg-inherit"
          showUserDetails={true}
          optionsClassName="z-[60]"
        />
      ),
    },
    {
      title: "评审结果",
      dataIndex: "result",
      key: "result",
      render: (result: string) => {
        const color = reviewEnums?.CaseReviewThrough_Result?.[result]?.color || "default";
        return <Tag color={color}>{result || "-"}</Tag>;
      },
    },
    {
      title: "创建人",
      dataIndex: "created_by",
      key: "created_by",
      render: (uid: string | null) => (
        <MemberDropdown
          multiple={false}
          value={uid ?? null}
          onChange={() => {}}
          disabled={true}
          placeholder={"未知用户"}
          className="w-full text-sm"
          buttonContainerClassName="w-full text-left p-0 cursor-default"
          buttonVariant="transparent-with-text"
          buttonClassName="text-sm p-0 hover:bg-transparent hover:bg-inherit"
          showUserDetails={true}
          optionsClassName="z-[60]"
        />
      ),
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 140,
      render: (_: any, record: ReviewCaseRow) => (
        <div className="flex items-center gap-2">
          <Button
            type="link"
            size="small"
            onClick={() => {
              if (!workspaceSlug || !reviewId) return;
              const href = `/${workspaceSlug}/projects/${projectId}/testhub/case-review?review_id=${encodeURIComponent(reviewId)}&case_id=${encodeURIComponent(record.case_id)}`;
              router.push(href);
            }}
          >
            评审
          </Button>
          <Button
            type="link"
            size="small"
            danger
            disabled={!canEditReview}
            onClick={async () => {
              if (!canEditReview) return;
              if (!workspaceSlug || !reviewId) return;
              try {
                await reviewService.CaseCancel(workspaceSlug as string, projectId as string, { ids: [record.id] });
                qaCaseSetToastSuccess("已取消关联");
                fetchReviewCaseList(currentPage, pageSize);
              } catch (e: unknown) {
                qaCaseSetToastError(e, t, "操作失败");
              }
            }}
          >
            取关
          </Button>
        </div>
      ),
    },
  ];

  const handleTableChange: TableProps<ReviewCaseRow>["onChange"] = (_pagination, _filters, sorter) => {
    const sorterValue = Array.isArray(sorter) ? sorter[0] : sorter;
    const sorterField = String((sorterValue as any)?.field ?? "");
    const sorterOrder = (sorterValue as any)?.order as "ascend" | "descend" | undefined;

    const nextOrdering =
      sorterField === "code"
        ? sorterOrder === "ascend"
          ? "case__code"
          : sorterOrder === "descend"
            ? "-case__code"
            : undefined
        : undefined;

    setOrdering(nextOrdering);
    fetchReviewCaseList(1, pageSize, undefined, nextOrdering ?? null);
  };

  return (
    <>
      <div className="flex h-full w-full flex-col overflow-hidden px-4 pt-4 pb-0">
        <PageHead title="评审详情" />
        <div className="flex min-h-0 w-full flex-1 overflow-hidden rounded-md border border-subtle">
          <div
            className="relative h-full min-h-0 flex-shrink-0 overflow-y-auto border-r border-subtle pt-4 pl-4"
            style={{ width: leftWidth, minWidth: 200, maxWidth: 320 }}
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
              treeData={treeData as any}
              selectedKeys={treeData.length > 0 ? [selectedTreeKey] : []}
              className="custom-tree-indent py-2 pl-2"
            />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
              <div className="flex flex-shrink-0 items-center justify-between py-3 pr-4 pl-7">
                <div>
                  <Breadcrumbs className="grow-0">
                    <Breadcrumbs.Item
                      component={
                        <BreadcrumbLink
                          href={`/${workspaceSlug}/projects/${projectId}/testhub/reviews`}
                          label="用例评审"
                        />
                      }
                    />
                    <Breadcrumbs.Item
                      component={
                        <Breadcrumbs.ItemWrapper className="!cursor-pointer">
                          <Select
                            value={reviewId || undefined}
                            placeholder="选择评审"
                            loading={reviewListLoading}
                            showSearch
                            optionFilterProp="label"
                            className="h-full min-w-[200px] !cursor-pointer [&_.ant-select-selection-item]:!text-sm [&_.ant-select-selection-item]:!leading-4 [&_.ant-select-selection-item]:!text-primary [&_.ant-select-selection-placeholder]:!text-sm [&_.ant-select-selection-placeholder]:!leading-4 [&_.ant-select-selection-placeholder]:!text-secondary [&_.ant-select-selection-search]:!h-full [&_.ant-select-selection-search-input]:!h-full [&_.ant-select-selection-wrap]:!flex [&_.ant-select-selection-wrap]:!h-full [&_.ant-select-selection-wrap]:!items-center [&_.ant-select-selector]:!h-full [&_.ant-select-selector]:!min-h-full [&_.ant-select-selector]:!cursor-pointer [&_.ant-select-selector]:!items-center [&_.ant-select-selector]:!p-0"
                            variant="borderless"
                            suffixIcon={null}
                            showArrow={false}
                            options={reviewList.map((r) => ({ value: String(r.id), label: String(r.name || "-") }))}
                            onChange={onChangeReview}
                          />
                        </Breadcrumbs.ItemWrapper>
                      }
                    />
                  </Breadcrumbs>
                </div>
                <div className="flex items-center gap-2">
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
                </div>
              </div>
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden px-4 pt-0 pb-4">
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
                    <div className="testhub-review-detail-table-scroll relative flex-1 overflow-y-auto [&::-webkit-scrollbar]:block [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[var(--scrollbar-thumb)] [&::-webkit-scrollbar-track]:bg-transparent">
                      <Table
                        dataSource={reviewCases}
                        columns={columns as any}
                        rowKey="id"
                        bordered={true}
                        pagination={false}
                        locale={{ emptyText: "暂无数据" }}
                        scroll={{ x: "max-content" }}
                        onChange={handleTableChange}
                        rowSelection={{
                          selectedRowKeys: selectedCaseIds,
                          preserveSelectedRowKeys: true,
                          onChange: (newSelectedRowKeys) => {
                            const nextSelectedKeys = (newSelectedRowKeys as (string | number)[]).map((k) => String(k));
                            const currentPageIds = (reviewCases || []).map((c) => String(c.id));

                            setSelectedCaseIds((prev) => {
                              const next = new Set(prev.map((k) => String(k)));
                              for (const id of currentPageIds) next.delete(id);
                              for (const id of nextSelectedKeys) next.add(id);
                              return Array.from(next);
                            });

                            setSelectedCaseMap((prev) => {
                              const next = { ...prev };
                              (reviewCases || []).forEach((row) => {
                                const id = String(row.id);
                                if (nextSelectedKeys.includes(id)) {
                                  next[id] = String(row.case_id);
                                } else {
                                  delete next[id];
                                }
                              });
                              return next;
                            });
                          },
                        }}
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
                              onClick={() => {
                                setSelectedCaseIds([]);
                                setSelectedCaseMap({});
                              }}
                            >
                              清除选择
                            </span>
                            <Popconfirm
                              title="确定通过选中用例？"
                              onConfirm={async () => {
                                if (!workspaceSlug || !reviewId) return;
                                try {
                                  const caseIds = selectedCaseIds.map((id) => selectedCaseMap[id]).filter((id) => !!id);

                                  if (caseIds.length === 0) return;

                                  await caseService.submitCaseReview(workspaceSlug as string, {
                                    review_id: reviewId as string,
                                    case_id: caseIds,
                                    result: "通过",
                                    assignee: currentUser?.id ? String(currentUser.id) : undefined,
                                  });

                                  qaCaseSetToastSuccess("已批量通过用例");
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
                                    ? "text-red-500 hover:text-red-600 cursor-pointer"
                                    : "text-red-300 cursor-not-allowed"
                                }`}
                              >
                                取关
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
                    <style
                      dangerouslySetInnerHTML={{
                        __html: `
                      .testhub-review-detail-table-scroll .ant-table-body {
                        overflow-y: auto !important;
                      }

                      .testhub-review-detail-table-scroll .ant-table-thead > tr > th {
                        font-size: 13px !important;
                        font-weight: 500 !important;
                        color: var(--text-color-secondary) !important;
                      }

                      .testhub-review-detail-table-scroll ::-webkit-scrollbar {
                        width: 12px;
                        height: 12px;
                      }

                      .testhub-review-detail-table-scroll ::-webkit-scrollbar-thumb {
                        background-color: color-mix(in oklch, var(--scrollbar-thumb) 85%, transparent);
                        border-radius: 999px;
                        border: 3px solid transparent;
                        background-clip: content-box;
                      }

                      .testhub-review-detail-table-scroll ::-webkit-scrollbar-track {
                        background: transparent;
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
          onConfirm={async (ids) => {
            if (!canEditReview) return;
            if (!workspaceSlug || !reviewId) return;
            try {
              await reviewService.addReviewCases(String(workspaceSlug), String(projectId), {
                review_id: String(reviewId),
                case_ids: ids || [],
              });
              qaCaseSetToastSuccess("已关联所选用例");
              setIsCaseSelectionOpen(false);
              fetchReviewTree();
              fetchReviewCaseList(1, pageSize, selectedModuleId);
            } catch (e: unknown) {
              qaCaseSetToastError(e, t, "关联用例失败");
            }
          }}
        />
      )}
    </>
  );
}
