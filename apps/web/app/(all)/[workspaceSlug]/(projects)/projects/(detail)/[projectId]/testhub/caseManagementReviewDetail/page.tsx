"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useMemo, type ReactNode } from "react";
import { PageHead } from "@/components/core/page-title";
import { Breadcrumbs } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { Row, Col, Tree, Table, Button, Tag, message, Pagination } from "antd";
import type { TreeProps } from "antd";
import { AppstoreOutlined, DeploymentUnitOutlined } from "@ant-design/icons";
import { CaseService as CaseApiService } from "@/services/qa/case.service";
import { CaseService as ReviewApiService } from "@/services/qa/review.service";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { FolderOpenDot } from "lucide-react";
import UpdateModal from "@/components/qa/cases/update-modal";
import TestCaseSelectionModal from "@/components/qa/review/TestCaseSelectionModal";


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
  const { workspaceSlug, projectId } = useParams<{ workspaceSlug: string; projectId: string }>();
  const searchParams = useSearchParams();
  const reviewId = searchParams.get("review_id") ?? "";
  const repositoryIdFromUrl = searchParams.get("repositoryId");
  const repositoryId =
    repositoryIdFromUrl || (typeof window !== "undefined" ? sessionStorage.getItem("selectedRepositoryId") : null);
  const reviewName = typeof window !== "undefined" ? sessionStorage.getItem("selectedReviewName") : "";
  const router = useRouter();

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
  const [pageSize, setPageSize] = useState<number>(10);
  const [total, setTotal] = useState<number>(0);
  const [reviewEnums, setReviewEnums] = useState<Record<string, Record<string, { label: string; color: string }>>>({});
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(false);
  const [activeCaseId, setActiveCaseId] = useState<string | undefined>(undefined);
  const [selectedTreeKey, setSelectedTreeKey] = useState<string>("root");
  const [isCaseSelectionOpen, setIsCaseSelectionOpen] = useState(false);

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
    moduleId?: string | null
  ) => {
    if (!workspaceSlug || !reviewId) return;
    try {
      // setLoading(true);
      setError(null);
      const res = await reviewService.getReviewCaseList(workspaceSlug as string, reviewId as string, {
        page,
        page_size: size,
        module_id: typeof moduleId === "undefined" ? selectedModuleId : moduleId,
      });
      setReviewCases(Array.isArray(res?.data) ? (res.data as ReviewCaseRow[]) : []);
      setTotal(Number(res?.count || 0));
      setCurrentPage(page);
      setPageSize(size);
    } catch (e: any) {
      setError(e?.message || e?.detail || e?.error || "获取评审用例列表失败");
      message.error(e?.message || e?.detail || e?.error || "获取评审用例列表失败");
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
    if (repositoryId) {
      try {
        if (repositoryIdFromUrl) sessionStorage.setItem("selectedRepositoryId", repositoryIdFromUrl);
      } catch {}
      setReviewTree(null);
      fetchReviewTree();
      fetchReviewEnums();
      fetchReviewCaseList(1, pageSize);
      setSelectedTreeKey("root");
      setSelectedModuleId(null);
    } else {
      setLoading(false);
    }
  }, [repositoryId, reviewId]);

  useEffect(() => {
    if (!repositoryId && workspaceSlug) {
      const ws = String(workspaceSlug || "");
      const current = `/${ws}/projects/${projectId}/testhub/caseManagementReviewDetail${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
      router.push(`/${ws}/projects/${projectId}/testhub?redirect_to=${encodeURIComponent(current)}`);
    }
  }, [repositoryId, workspaceSlug, searchParams, router]);

  const renderNodeTitle = (title: string, icon: ReactNode, count?: number, fontMedium?: boolean) => {
    return (
      <div className="group flex items-center justify-between gap-2 w-full">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 text-custom-text-300">
            {icon}
          </span>
          <span className={`text-sm text-custom-text-200 ${fontMedium ? "font-medium" : ""}`}>{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {typeof count === "number" && <span className="text-xs text-custom-text-300">{count}</span>}
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
          <DeploymentUnitOutlined />
        ) : kind === "repository_modules_all" ? (
          <AppstoreOutlined />
        ) : (
          <FolderOpenDot size={14} />
        );

      const children = Array.isArray(node?.children) ? node.children : [];

      return {
        title: renderNodeTitle(node?.name ?? "-", icon, undefined, kind === "root" || kind === "repository_modules_all"),
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
      render: (code: string | undefined, record: ReviewCaseRow) => (
        <Button
          type="link"
          size="small"
          className="p-0 h-auto !text-custom-text-200 hover:!text-custom-text-100"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!record?.case_id) {
              message.error("缺少用例信息，无法打开");
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
          className="p-0 h-auto !text-custom-text-200 hover:!text-custom-text-100"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!record?.case_id) {
              message.error("缺少用例信息，无法打开");
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
      render: (v: string | null) => (v ?? ""),
    },
    {
      title: "模块",
      dataIndex: "module",
      key: "module",
      render: (v: string | null) => (v ?? ""),
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
            onClick={async () => {
              if (!workspaceSlug || !reviewId) return;
              try {
                await reviewService.CaseCancel(workspaceSlug as string, { ids: [record.id] });
                message.success("已取消关联");
                fetchReviewCaseList(currentPage, pageSize);
              } catch (e: any) {
                message.error(e?.message || e?.detail || e?.error || "操作失败");
              }
            }}
          >
            取消关联
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-col pt-4 px-4 pb-0 w-full h-full overflow-hidden">
        <PageHead title="评审详情" />
        <div className="w-full flex-1 min-h-0 flex rounded-md border border-custom-border-200 overflow-hidden">
          <div
            className="relative h-full min-h-0 border-r border-custom-border-200 overflow-y-auto flex-shrink-0"
            style={{ width: leftWidth, minWidth: 200, maxWidth: 320 }}
          >
            <div
              onMouseDown={onMouseDownResize}
              className="absolute right-0 top-0 h-full w-2"
              style={{ cursor: "col-resize", zIndex: 10 }}
            />
            <style
              dangerouslySetInnerHTML={{
                __html: `
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
            {!repositoryId && (
              <div className="p-4 text-custom-text-300">未找到用例库ID，请先在顶部选择一个用例库</div>
            )}
            {repositoryId && (
              <Tree
                showLine={false}
                defaultExpandAll
                onSelect={onSelect}
                onExpand={onExpand}
                expandedKeys={expandedKeys}
                autoExpandParent={autoExpandParent}
                treeData={treeData as any}
                selectedKeys={treeData.length > 0 ? [selectedTreeKey] : []}
                className="py-2 pl-2 custom-tree-indent"
              />
            )}
          </div>
          <div className="flex-1 overflow-hidden min-w-0">
            <div className="flex flex-col h-full min-h-0 overflow-hidden min-w-0">
              <div className="px-4 py-3 flex items-center justify-between flex-shrink-0">
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
                    <Breadcrumbs.Item component={<BreadcrumbLink label="评审详情" isLast />} />
                    {reviewName && <Breadcrumbs.Item component={<BreadcrumbLink label={reviewName} isLast />} />}
                  </Breadcrumbs>
                </div>
                <div className="flex items-center gap-2">
                  {repositoryId && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCaseSelectionOpen(true);
                      }}
                      className="text-white bg-custom-primary-100 hover:bg-custom-primary-200 focus:text-custom-brand-40 focus:bg-custom-primary-200 px-3 py-1.5 font-medium text-xs rounded flex items-center gap-1.5 whitespace-nowrap transition-all justify-center"
                    >
                      关联用例
                    </button>
                  )}
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden pt-0 px-4 pb-4 min-w-0">
                {loading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-custom-text-300">加载中...</div>
                  </div>
                )}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
                    <div className="text-red-800 text-sm">{error}</div>
                  </div>
                )}
                {repositoryId && !loading && !error && (
                  <div className="flex flex-col h-full overflow-hidden min-w-0">
                    <div className="testhub-review-detail-table-scroll flex-1 relative overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:block [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[rgb(var(--color-scrollbar))] [&::-webkit-scrollbar-thumb]:rounded-full">
                      <Table
                        dataSource={reviewCases}
                        columns={columns as any}
                        rowKey="id"
                        bordered={true}
                        pagination={false}
                        locale={{ emptyText: "暂无数据" }}
                        scroll={{ x: "max-content" }}
                      />
                    </div>
                    <div className="flex-shrink-0 border-t border-custom-border-200 px-4 py-3 bg-custom-background-100 flex items-center justify-between">
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-custom-text-300">
                          {total > 0
                            ? `第 ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, total)} 条，共 ${total} 条`
                            : ""}
                        </span>
                      </div>
                      <Pagination
                        current={currentPage}
                        pageSize={pageSize}
                        total={total}
                        showSizeChanger
                        showQuickJumper
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

                      .testhub-review-detail-table-scroll ::-webkit-scrollbar {
                        width: 12px;
                        height: 12px;
                      }

                      .testhub-review-detail-table-scroll ::-webkit-scrollbar-thumb {
                        background-color: rgba(var(--color-scrollbar), 0.85);
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
                {!repositoryId && !loading && (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-custom-text-300">未找到用例库ID，请先在顶部选择一个用例库</div>
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
      {isCaseSelectionOpen && (
        <TestCaseSelectionModal
          open={isCaseSelectionOpen}
          onClose={() => setIsCaseSelectionOpen(false)}
          initialSelectedIds={[]}
          projectId={projectId ? String(projectId) : undefined}
          reviewId={reviewId ? String(reviewId) : undefined}
          onConfirm={async (ids) => {
            if (!workspaceSlug || !reviewId) return;
            try {
              await reviewService.addReviewCases(String(workspaceSlug), { review_id: String(reviewId), case_ids: ids || [] });
              message.success("已关联所选用例");
              setIsCaseSelectionOpen(false);
              fetchReviewTree();
              fetchReviewCaseList(1, pageSize, selectedModuleId);
            } catch (e: any) {
              message.error(e?.message || e?.detail || e?.error || "关联用例失败");
            }
          }}
        />
      )}
    </>
  );
}
