"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Input, Pagination, Table, Tooltip, Tree } from "antd";
import { globalEnums, getEnums } from "@/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/testhub/util";
import type { TableProps, TreeProps } from "antd";
import { CaseService as QaCaseService } from "@/services/qa/case.service";
import { ChevronDown, Layers, Search, X } from "lucide-react";
import { ModalCore, EModalPosition, EModalWidth } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { useTranslation } from "@plane/i18n";
import { qaCaseSetToastError } from "@/utils/qa-case-error";
import {
  CASE_PICKER_MODAL_CLASS,
  CasePickerModalStyles,
  CasePriorityPill,
  CaseTypePill,
} from "../shared/case-picker-modal-styles";

type TTestCase = {
  id: string;
  name: string;
  repository_name?: string;
  module?: { name?: string } | null;
  type?: number;
  priority?: number;
  created_at?: string;
};
type TTestCaseResponse = { count: number; data: TTestCase[] };

type Props = {
  open: boolean;
  onClose: () => void;
  initialSelectedIds: string[];
  projectId?: string;
  reviewId?: string;
  onConfirm: (ids: string[]) => void;
  onChangeSelected?: (ids: string[]) => void;
};

export default function TestCaseSelectionModal({
  open,
  onClose,
  initialSelectedIds,
  projectId: projectIdProp,
  reviewId,
  onConfirm,
  onChangeSelected,
}: Props) {
  const { t } = useTranslation();
  const { workspaceSlug, projectId: projectIdFromParams } = useParams() as { workspaceSlug?: string; projectId?: string };
  const qaCaseService = useMemo(() => new QaCaseService(), []);
  const projectId = projectIdProp ?? projectIdFromParams;

  const [caseTree, setCaseTree] = useState<any | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState<boolean>(true);
  const [selectedTreeKey, setSelectedTreeKey] = useState<string>("root");
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [checkedTreeKeys, setCheckedTreeKeys] = useState<string[]>([]);
  const nodeCaseIdsCacheRef = useRef<Record<string, string[]>>({});

  const [cases, setCases] = useState<TTestCase[]>([]);
  const [loadingCases, setLoadingCases] = useState(false);
  const [total, setTotal] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [searchName, setSearchName] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [leftWidth, setLeftWidth] = useState<number>(280);
  const isDraggingRef = useRef<boolean>(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  useEffect(() => {
    if (!open) return;
    const init = initialSelectedIds?.map(String) || [];
    setSelectedIds(init);
    setCheckedTreeKeys([]);
    nodeCaseIdsCacheRef.current = {};
    setSelectedTreeKey("root");
    setSelectedRepositoryId(null);
    setSelectedModuleId(null);
    setCurrentPage(1);
    setSearchName("");
  }, [open]);

  useEffect(() => {
    if (!open || !workspaceSlug) return;
    getEnums(String(workspaceSlug))
      .then(globalEnums.setEnums)
      .catch(() => {});
  }, [open, workspaceSlug]);

  const fetchTree = async () => {
    if (!workspaceSlug) return;
    try {
      if (reviewId) {
        const data = await qaCaseService.getReviewUnassociatedCaseTree(String(workspaceSlug), { review_id: String(reviewId) });
        setCaseTree(data || null);
      } else if (projectId) {
        const data = await qaCaseService.getProjectCaseTree(String(workspaceSlug), { project_id: String(projectId) });
        setCaseTree(data || null);
      } else {
        setCaseTree(null);
      }
      setExpandedKeys([]);
      setAutoExpandParent(true);
    } catch {
      setCaseTree(null);
    }
  };

  const fetchCases = async (page: number, size: number, repoId?: string, moduleId?: string) => {
    if (!workspaceSlug) return;
    if (!reviewId && !projectId) return;
    setLoadingCases(true);
    try {
      const params: any = {
        page,
        page_size: size,
      };
      if (reviewId) params.review_id = String(reviewId);
      else params.project_id = String(projectId);

      if (repoId) params.repository_id = repoId;
      if (moduleId) params.module_id = moduleId;
      if (searchName) params.name__icontains = searchName;

      const res: TTestCaseResponse = reviewId
        ? await qaCaseService.getReviewUnassociatedCases(String(workspaceSlug), params)
        : await qaCaseService.getProjectCases(String(workspaceSlug), params);

      setCases(res?.data || []);
      setTotal(Number(res?.count || 0));
      setCurrentPage(page);
      setPageSize(size);
    } catch (err: unknown) {
      qaCaseSetToastError(err, t, "获取用例失败");
    } finally {
      setLoadingCases(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (!workspaceSlug) return;
    if (!reviewId && !projectId) return;
    fetchTree();
    fetchCases(1, pageSize, undefined, undefined);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!reviewId && !projectId) return;
    fetchCases(1, pageSize, selectedRepositoryId || undefined, selectedModuleId || undefined);
  }, [searchName]);

  const caseColumns: TableProps<TTestCase>["columns"] = [
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      width: 260,
      ellipsis: { showTitle: false },
      render: (v?: string) => {
        const value = v ?? "-";
        return (
          <Tooltip title={value}>
            <div className="truncate text-primary">{value}</div>
          </Tooltip>
        );
      },
    },
    {
      title: "用例库",
      dataIndex: "repository_name",
      key: "repository_name",
      width: 110,
      ellipsis: true,
      render: (m?: string) => <span className="text-secondary">{m || "-"}</span>,
    },
    {
      title: "模块",
      dataIndex: "module",
      key: "module",
      width: 110,
      ellipsis: true,
      render: (m?: { name?: string } | null) => <span className="text-secondary">{m?.name || "-"}</span>,
    },
    {
      title: "类型",
      dataIndex: "type",
      key: "type",
      width: 100,
      render: (v?: number) => <CaseTypePill value={v} />,
    },
    {
      title: "优先级",
      dataIndex: "priority",
      key: "priority",
      width: 90,
      render: (v?: number) => <CasePriorityPill value={v} />,
    },
  ];

  const handleConfirm = () => {
    onConfirm(selectedIds);
  };

  const onMouseDownResize = (e: any) => {
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = leftWidth;
    window.addEventListener("mousemove", onMouseMoveResize as any);
    window.addEventListener("mouseup", onMouseUpResize as any);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    if (e && typeof e.preventDefault === "function") e.preventDefault();
  };

  const onMouseMoveResize = (e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    const delta = e.clientX - startXRef.current;
    const next = Math.min(320, Math.max(200, startWidthRef.current + delta));
    setLeftWidth(next);
  };

  const onMouseUpResize = () => {
    isDraggingRef.current = false;
    window.removeEventListener("mousemove", onMouseMoveResize as any);
    window.removeEventListener("mouseup", onMouseUpResize as any);
    document.body.style.cursor = "auto";
    document.body.style.userSelect = "auto";
  };

  const renderNodeTitle = (title: string, count?: number, fontMedium?: boolean) => {
    return (
      <div className="group flex w-full items-center gap-2 py-0.5">
        <span className={`flex-1 truncate text-sm text-primary ${fontMedium ? "font-medium" : ""}`}>{title}</span>
        {typeof count === "number" && <span className="ml-auto shrink-0 text-xs text-secondary">{count}</span>}
      </div>
    );
  };

  const buildTreeNode = (node: any): any => {
    const kind = String(node?.kind || "");
    const id = String(node?.id || "");
    const repositoryId = node?.repository_id ? String(node.repository_id) : null;
    const count = typeof node?.count === "number" ? node.count : undefined;

    const key =
      kind === "root"
        ? "root"
        : kind === "repository"
          ? `repo:${id}`
          : kind === "repository_modules_all"
            ? `repo:${repositoryId}:all_modules`
            : kind === "module"
              ? `module:${id}`
              : id;

    const children = Array.isArray(node?.children) ? node.children : [];
    return {
      title: renderNodeTitle(node?.name ?? "-", count, kind === "root" || kind === "repository_modules_all"),
      key,
      kind,
      repositoryId,
      moduleId: kind === "module" ? id : null,
      children: children.map((c: any) => buildTreeNode(c)),
    };
  };

  const treeData = useMemo(() => {
    if (!caseTree) return [];
    return [buildTreeNode(caseTree)];
  }, [caseTree]);

  const onSelect: TreeProps["onSelect"] = (selectedKeys, info) => {
    const key = Array.isArray(selectedKeys) && selectedKeys.length > 0 ? String(selectedKeys[0]) : "root";
    setSelectedTreeKey(key);

    const node: any = (info as any)?.node || {};
    const kind = node?.kind as string | undefined;

    if (!kind || kind === "root") {
      setSelectedRepositoryId(null);
      setSelectedModuleId(null);
      fetchCases(1, pageSize, undefined, undefined);
      return;
    }

    if (kind === "repository" || kind === "repository_modules_all") {
      const repoId = node?.repositoryId ? String(node.repositoryId) : null;
      setSelectedRepositoryId(repoId);
      setSelectedModuleId(null);
      fetchCases(1, pageSize, repoId || undefined, undefined);
      return;
    }

    if (kind === "module") {
      const repoId = node?.repositoryId ? String(node.repositoryId) : null;
      const moduleId = node?.moduleId ? String(node.moduleId) : null;
      setSelectedRepositoryId(repoId);
      setSelectedModuleId(moduleId);
      fetchCases(1, pageSize, repoId || undefined, moduleId || undefined);
    }
  };

  const onExpand: TreeProps["onExpand"] = (keys) => {
    setExpandedKeys(keys as string[]);
    setAutoExpandParent(false);
  };

  const getNodeCaseIds = async (node: any): Promise<string[]> => {
    if (!workspaceSlug) return [];
    if (!reviewId && !projectId) return [];
    const kind = node?.kind as string | undefined;
    const cacheKey = String(node?.key || "");
    if (cacheKey && nodeCaseIdsCacheRef.current[cacheKey]) return nodeCaseIdsCacheRef.current[cacheKey];

    const params: any = {};
    if (reviewId) params.review_id = String(reviewId);
    else params.project_id = String(projectId);

    if (kind === "repository" || kind === "repository_modules_all" || kind === "module") {
      if (node?.repositoryId) params.repository_id = String(node.repositoryId);
    }
    if (kind === "module" && node?.moduleId) params.module_id = String(node.moduleId);

    const res = reviewId
      ? await qaCaseService.getReviewUnassociatedCaseIds(String(workspaceSlug), params)
      : await qaCaseService.getProjectCaseIds(String(workspaceSlug), params);

    const ids = Array.isArray(res?.data) ? res.data : [];
    if (cacheKey) nodeCaseIdsCacheRef.current[cacheKey] = ids;
    return ids;
  };

  const syncTreeCheckState = (newSelectedIds: string[]) => {
    const selectedSet = new Set(newSelectedIds);
    const nextTreeKeys = checkedTreeKeys.filter((key) => {
      const cachedIds = nodeCaseIdsCacheRef.current[key];
      if (!cachedIds) return true;
      const allSelected = cachedIds.every((id) => selectedSet.has(id));
      return allSelected;
    });
    if (nextTreeKeys.length !== checkedTreeKeys.length) {
      setCheckedTreeKeys(nextTreeKeys);
    }
  };

  const onCheck: TreeProps["onCheck"] = async (checkedKeys, info: any) => {
    const nextChecked = Array.isArray(checkedKeys) ? (checkedKeys as string[]) : (checkedKeys?.checked as string[]);
    setCheckedTreeKeys(nextChecked || []);

    const node = info?.node;
    const checked = Boolean(info?.checked);
    if (!node) return;

    try {
      const ids = await getNodeCaseIds(node);
      setSelectedIds((prev) => {
        const prevSet = new Set(prev || []);
        if (checked) {
          for (const id of ids) prevSet.add(String(id));
          const next = Array.from(prevSet);
          onChangeSelected?.(next);
          return next;
        }
        for (const id of ids) prevSet.delete(String(id));
        const next = Array.from(prevSet);
        onChangeSelected?.(next);
        return next;
      });
    } catch {}
  };

  const handlePaginationChange = (page: number, size?: number) => {
    const nextSize = size || pageSize;
    const nextPage = nextSize !== pageSize ? 1 : page;
    fetchCases(nextPage, nextSize, selectedRepositoryId || undefined, selectedModuleId || undefined);
  };

  const selectedCount = selectedIds.length;

  return (
    <ModalCore isOpen={open} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.VIIXL}>
      <div className={`${CASE_PICKER_MODAL_CLASS} flex w-full flex-col text-sm text-primary`}>
        <CasePickerModalStyles />

        <div className="flex items-start justify-between gap-4 border-b border-subtle px-6 py-4">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-primary">选择测试用例</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="flex size-8 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-layer-1-hover hover:text-secondary"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="h-[82vh]">
          <div className="flex h-full overflow-hidden">
            <div className="relative flex flex-col bg-layer-1/40" style={{ width: leftWidth, minWidth: 200, maxWidth: 320 }}>
              <div className="flex items-center gap-2 px-4 pb-2 pt-4">
                <span className="text-sm text-secondary">用例目录</span>
              </div>
              <div className="tree-scroll flex-1 min-h-0 px-2 pb-3">
                <Tree
                  showLine={false}
                  checkable
                  switcherIcon={({ expanded, isLeaf }: any) =>
                    isLeaf ? null : (
                      <ChevronDown
                        className="size-3.5 text-tertiary transition-transform"
                        style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}
                      />
                    )
                  }
                  onSelect={onSelect}
                  onCheck={onCheck}
                  onExpand={onExpand}
                  expandedKeys={expandedKeys}
                  autoExpandParent={autoExpandParent}
                  treeData={treeData}
                  selectedKeys={treeData.length > 0 ? [selectedTreeKey] : []}
                  checkedKeys={checkedTreeKeys}
                  className="custom-tree-indent"
                />
              </div>
              <div
                onMouseDown={onMouseDownResize}
                className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize border-r border-subtle transition-colors hover:border-accent-strong hover:bg-accent-subtle"
              />
            </div>

            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle px-4 py-3">
                <Input
                  placeholder="按名称搜索"
                  allowClear
                  prefix={<Search className="size-4" />}
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  className="max-w-xs"
                />
                {selectedCount > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-secondary">
                      已选 <span className="font-medium text-accent-primary">{selectedCount}</span> 个
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedIds([]);
                        onChangeSelected?.([]);
                        syncTreeCheckState([]);
                      }}
                      className="rounded-md px-2 py-1 text-link-primary transition-colors hover:bg-layer-1-hover"
                    >
                      清空
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-1 min-h-0 flex-col">
                {loadingCases && (
                  <div className="flex h-full items-center justify-center py-12">
                    <div className="flex flex-col items-center gap-3 text-tertiary">
                      <span className="size-6 animate-spin rounded-full border-2 border-subtle border-t-accent-primary" />
                      <span className="text-sm text-secondary">加载中...</span>
                    </div>
                  </div>
                )}
                {!loadingCases && cases.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
                    <span className="flex size-12 items-center justify-center rounded-full bg-layer-1 text-tertiary">
                      <Layers className="size-6" />
                    </span>
                    <div className="text-sm text-secondary">暂无可关联的用例</div>
                  </div>
                )}
                {!loadingCases && cases.length > 0 && (
                  <>
                    <div className="table-scroll flex-1 min-h-0">
                      <Table<TTestCase>
                        rowKey="id"
                        dataSource={cases}
                        columns={caseColumns as any}
                        tableLayout="fixed"
                        pagination={false}
                        rowSelection={{
                          selectedRowKeys: selectedIds,
                          onChange: (keys) => {
                            const nextKeys = keys as string[];
                            setSelectedIds(nextKeys);
                            onChangeSelected?.(nextKeys);
                            syncTreeCheckState(nextKeys);
                          },
                          preserveSelectedRowKeys: true,
                          selections: [
                            {
                              key: "select-all",
                              text: "本页全选",
                              onSelect: () => {
                                const nextKeys = Array.from(new Set([...selectedIds, ...cases.map((c) => String(c.id))]));
                                setSelectedIds(nextKeys);
                                onChangeSelected?.(nextKeys);
                                syncTreeCheckState(nextKeys);
                              },
                            },
                            {
                              key: "clear-all",
                              text: "清空选择",
                              onSelect: () => {
                                setSelectedIds([]);
                                onChangeSelected?.([]);
                                syncTreeCheckState([]);
                              },
                            },
                          ],
                        }}
                      />
                    </div>
                    <div className="modal-pagination-bar flex-shrink-0 border-t border-subtle bg-surface-1 py-3 pl-4 pr-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-secondary">
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
                          onChange={handlePaginationChange}
                          onShowSizeChange={handlePaginationChange}
                          size="small"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-subtle bg-surface-1 px-6 py-3">
          <div className="text-sm text-secondary">
            已选 <span className="font-medium text-accent-primary">{selectedCount}</span> 个用例
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={onClose} size="lg">
              取消
            </Button>
            <Button variant="primary" onClick={handleConfirm} size="lg" disabled={loadingCases}>
              {loadingCases ? "处理中..." : selectedCount > 0 ? `确定关联 ${selectedCount} 个` : "确定"}
            </Button>
          </div>
        </div>
      </div>
    </ModalCore>
  );
}
