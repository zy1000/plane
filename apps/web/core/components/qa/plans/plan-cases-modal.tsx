"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Tree, Table, Tooltip, Input, Pagination } from "antd";
import type { TreeProps } from "antd";
import type { TableProps } from "antd";
import { ChevronDown, Layers, Search, X } from "lucide-react";
import { ModalCore, EModalPosition, EModalWidth } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { CaseService } from "@/services/qa/case.service";
import { PlanService } from "@/services/qa/plan.service";
import {
  formatDateTime,
  globalEnums,
} from "@/app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/testhub/util";
import { useTranslation } from "@plane/i18n";
import { qaCaseErrorContent, qaCaseSetToastError, qaCaseSetToastSuccess, qaCaseSetToastWarning } from "@/utils/qa-case-error";

type TLabel = { id?: string; name?: string } | string;
type TestCase = {
  id: string;
  name: string;
  remark?: string;
  state?: number;
  type?: number;
  priority?: number;
  created_at?: string;
  updated_at?: string;
  repository?: string;
  labels?: TLabel[];
};
type TestCaseResponse = { count: number; data: TestCase[] };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId?: string;
  repositoryId: string;
  repositoryName?: string;
  planId?: string;
  initialSelectedCaseIds?: string[];
  onClosed?: () => void;
};

export const PlanCasesModal: React.FC<Props> = ({
  isOpen,
  onClose,
  workspaceSlug,
  projectId,
  planId,
  initialSelectedCaseIds,
  onClosed,
}) => {
  const { t } = useTranslation();
  const Enums = globalEnums.Enums;
  const caseService = useRef(new CaseService()).current;
  const planService = useRef(new PlanService()).current;

  const [planTree, setPlanTree] = useState<any | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState<boolean>(true);
  const [selectedTreeKey, setSelectedTreeKey] = useState<string>("root");
  const [selectedRepositoryId, setSelectedRepositoryId] = useState<string | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);

  const [cases, setCases] = useState<TestCase[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [existingIds, setExistingIds] = useState<string[]>([]);
  const [selectedNewIds, setSelectedNewIds] = useState<string[]>([]);
  const [checkedTreeKeys, setCheckedTreeKeys] = useState<string[]>([]);
  const nodeCaseIdsCacheRef = useRef<Record<string, string[]>>({});
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(20);
  const [searchName, setSearchName] = useState<string>("");

  const [leftWidth, setLeftWidth] = useState<number>(280);
  const isDraggingRef = useRef<boolean>(false);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

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

  const clearSearchDebounce = () => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
  };

  useEffect(() => {
    const init = Array.isArray(initialSelectedCaseIds) ? initialSelectedCaseIds.filter(Boolean) : [];
    setExistingIds(init);
    setSelectedNewIds([]);
    setCheckedTreeKeys([]);
    nodeCaseIdsCacheRef.current = {};
    clearSearchDebounce();
    setSearchName("");
    setSelectedTreeKey("root");
    setSelectedRepositoryId(null);
    setSelectedModuleId(null);
    if (!isOpen || !workspaceSlug || !planId) return;
    fetchPlanTree();
    fetchCases(1, undefined, undefined);
  }, [isOpen]);

  useEffect(() => () => {
    clearSearchDebounce();
  }, []);

  const getTreeNodeKey = (node: any): string => {
    const kind = String(node?.kind || "");
    const id = String(node?.id || "");
    const repositoryId = node?.repository_id ? String(node.repository_id) : null;

    if (kind === "root") return "root";
    if (kind === "repository") return `repo:${id}`;
    if (kind === "repository_modules_all") return `repo:${repositoryId}:all_modules`;
    if (kind === "module") return `module:${id}`;
    return id;
  };

  const collectFirstLevelExpandedKeys = (node: any): string[] => {
    if (!node) return [];
    return [getTreeNodeKey(node)];
  };

  const fetchPlanTree = async () => {
    if (!workspaceSlug || !planId) return;
    try {
      const data = await caseService.getPlanUnassociatedCaseTree(String(workspaceSlug), { plan_id: String(planId) });
      setPlanTree(data || null);
      setExpandedKeys(data ? collectFirstLevelExpandedKeys(data) : []);
      setAutoExpandParent(true);
    } catch {
      setPlanTree(null);
    }
  };

  const fetchCases = async (
    page: number,
    repoId?: string,
    moduleId?: string,
    name?: string,
    pageSizeArg: number = pageSize
  ) => {
    try {
      if (!planId) return;
      setLoading(true);
      setError(null);
      const params: any = {
        plan_id: String(planId || ""),
        page,
        page_size: pageSizeArg,
      };
      const keyword = name?.trim();
      if (keyword) {
        params.name__icontains = keyword;
      } else {
        if (repoId) params.repository_id = repoId;
        if (moduleId) params.module_id = moduleId;
      }
      const response: TestCaseResponse = await caseService.getPlanUnassociatedCases(String(workspaceSlug), params);
      setCases(response?.data || []);
      setTotal(response?.count || 0);
      setCurrentPage(page);
      setPageSize(pageSizeArg);
    } catch (e: unknown) {
      const fallback = "用例加载失败";
      setError(qaCaseErrorContent(e, t, fallback));
      qaCaseSetToastError(e, t, fallback);
    } finally {
      setLoading(false);
    }
  };

  const handlePaginationChange = (page: number, size?: number) => {
    const nextSize = size || pageSize;
    const nextPage = nextSize !== pageSize ? 1 : page;
    const keyword = searchName.trim();
    if (keyword) {
      fetchCases(nextPage, undefined, undefined, keyword, nextSize);
      return;
    }
    fetchCases(nextPage, selectedRepositoryId || undefined, selectedModuleId || undefined, undefined, nextSize);
  };

  const onSelect: TreeProps["onSelect"] = (selectedKeys, info) => {
    clearSearchDebounce();
    setSearchName("");
    const key = Array.isArray(selectedKeys) && selectedKeys.length > 0 ? String(selectedKeys[0]) : "root";
    setSelectedTreeKey(key);

    const node: any = (info as any)?.node || {};
    const kind = node?.kind as string | undefined;

    if (!kind || kind === "root") {
      setSelectedRepositoryId(null);
      setSelectedModuleId(null);
      fetchCases(1, undefined, undefined);
      return;
    }

    if (kind === "repository" || kind === "repository_modules_all") {
      const repoId = node?.repositoryId ? String(node.repositoryId) : null;
      setSelectedRepositoryId(repoId);
      setSelectedModuleId(null);
      fetchCases(1, repoId || undefined, undefined);
      return;
    }

    if (kind === "module") {
      const repoId = node?.repositoryId ? String(node.repositoryId) : null;
      const moduleId = node?.moduleId ? String(node.moduleId) : null;
      setSelectedRepositoryId(repoId);
      setSelectedModuleId(moduleId);
      fetchCases(1, repoId || undefined, moduleId || undefined);
    }
  };

  const handleSearchNameChange = (value: string) => {
    setSearchName(value);
    clearSearchDebounce();
    searchDebounceRef.current = setTimeout(() => {
      const keyword = value.trim();
      if (keyword) {
        fetchCases(1, undefined, undefined, keyword);
        return;
      }
      fetchCases(1, selectedRepositoryId || undefined, selectedModuleId || undefined);
    }, 300);
  };

  const onExpand: TreeProps["onExpand"] = (keys) => {
    setExpandedKeys(keys as string[]);
    setAutoExpandParent(false);
  };

  const getNodeUnassociatedCaseIds = async (node: any): Promise<string[]> => {
    if (!workspaceSlug || !planId) return [];
    const kind = node?.kind as string | undefined;
    const cacheKey = String(node?.key || "");
    if (cacheKey && nodeCaseIdsCacheRef.current[cacheKey]) return nodeCaseIdsCacheRef.current[cacheKey];

    const params: any = { plan_id: String(planId) };
    if (kind === "repository" || kind === "repository_modules_all" || kind === "module") {
      if (node?.repositoryId) params.repository_id = String(node.repositoryId);
    }
    if (kind === "module" && node?.moduleId) params.module_id = String(node.moduleId);

    const res = await caseService.getPlanUnassociatedCaseIds(String(workspaceSlug), params);
    const ids = Array.isArray(res?.data) ? res.data : [];
    if (cacheKey) nodeCaseIdsCacheRef.current[cacheKey] = ids;
    return ids;
  };

  const onCheck: TreeProps["onCheck"] = async (checkedKeys, info: any) => {
    // @ts-ignore
    const nextChecked = Array.isArray(checkedKeys) ? (checkedKeys as string[]) : (checkedKeys?.checked as string[]);
    setCheckedTreeKeys(nextChecked || []);

    const node = info?.node;
    const checked = Boolean(info?.checked);
    if (!node) return;
    

    try {
      const ids = await getNodeUnassociatedCaseIds(node);
      setSelectedNewIds((prev) => {
        const prevSet = new Set(prev || []);
        if (checked) {
          for (const id of ids) prevSet.add(String(id));
          return Array.from(prevSet);
        }
        for (const id of ids) prevSet.delete(String(id));
        return Array.from(prevSet);
      });
    } catch {}
  };

  const syncTreeCheckState = (newSelectedIds: string[]) => {
    const selectedSet = new Set(newSelectedIds);
    const nextTreeKeys = checkedTreeKeys.filter((key) => {
      const cachedIds = nodeCaseIdsCacheRef.current[key];
      // 如果没有缓存，我们假设它仍然被选中（无法验证）
      if (!cachedIds) return true;
      // 如果缓存的所有 ID 都在当前选中列表中，则保留选中状态
      const allSelected = cachedIds.every((id) => selectedSet.has(id));
      return allSelected;
    });

    if (nextTreeKeys.length !== checkedTreeKeys.length) {
      setCheckedTreeKeys(nextTreeKeys);
    }
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

    const key = getTreeNodeKey({ kind, id, repository_id: repositoryId });

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
    if (!planTree) return [];
    return [buildTreeNode(planTree)];
  }, [planTree]);

  const renderTypePill = (v: number) => {
    const label = (Enums as any)?.case_type?.[v];
    if (!label) return <span className="text-placeholder">-</span>;
    return (
      <span
        className="inline-flex items-center rounded-md px-2 py-0.5 text-xs"
        style={{ background: "var(--label-grey-bg)", color: "var(--label-grey-text)" }}
      >
        {label}
      </span>
    );
  };

  const priorityPillStyle: Record<number, { bg: string; text: string; dot: string }> = {
    0: { bg: "var(--label-indigo-bg)", text: "var(--label-indigo-text)", dot: "var(--priority-low)" },
    1: { bg: "var(--label-yellow-bg)", text: "var(--label-yellow-text)", dot: "var(--priority-medium)" },
    2: { bg: "var(--label-orange-bg)", text: "var(--label-orange-text)", dot: "var(--priority-high)" },
  };

  const renderPriorityPill = (v: number) => {
    const label = (Enums as any)?.case_priority?.[v];
    if (!label) return <span className="text-placeholder">-</span>;
    const style = priorityPillStyle[v] ?? {
      bg: "var(--label-grey-bg)",
      text: "var(--label-grey-text)",
      dot: "var(--priority-none)",
    };
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs"
        style={{ background: style.bg, color: style.text }}
      >
        <span className="size-1.5 rounded-full" style={{ background: style.dot }} />
        {label}
      </span>
    );
  };

  const columns: TableProps<TestCase>["columns"] = [
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
      render: (v: string) => <span className="text-secondary">{v ? v : "-"}</span>,
    },
    {
      title: "模块",
      dataIndex: "module",
      key: "module",
      width: 110,
      ellipsis: true,
      render: (v: any) => <span className="text-secondary">{v && v.name ? v.name : "-"}</span>,
    },
    {
      title: "类型",
      dataIndex: "type",
      width: 100,
      key: "type",
      render: (v: number) => renderTypePill(v),
    },
    {
      title: "优先级",
      dataIndex: "priority",
      width: 90,
      key: "priority",
      render: (v: number) => renderPriorityPill(v),
    },
  ];

  const closeModal = () => {
    onClose();
    onClosed && onClosed();
  };

  const selectedCount = selectedNewIds.length;

  const handleConfirm = async () => {
    if (!workspaceSlug || !planId) {
      qaCaseSetToastWarning("缺少必要参数：workspace或计划ID");
      return;
    }
    try {
      if (!selectedNewIds || selectedNewIds.length === 0) {
        qaCaseSetToastWarning("请先选择要关联的用例");
        return;
      }
      setSaving(true);
      await planService.addPlanCases(String(workspaceSlug), String(projectId || ""), {
        plan_id: String(planId),
        case_ids: selectedNewIds.map(String),
      });
      qaCaseSetToastSuccess("用例关联已更新");
      closeModal();
    } catch (e: unknown) {
      qaCaseSetToastError(e, t, "用例关联失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={closeModal} position={EModalPosition.CENTER} width={EModalWidth.VIIXL}>
      <div className="qa-plan-cases-modal flex w-full flex-col text-sm text-primary">
        <style
          dangerouslySetInnerHTML={{
            __html: `
            .qa-plan-cases-modal .custom-tree-indent .ant-tree-indent-unit { width: 12px !important; }
            .qa-plan-cases-modal .custom-tree-indent .ant-tree-switcher { width: 16px !important; margin-inline-end: 4px !important; display: inline-flex; align-items: center; justify-content: center; }
            .qa-plan-cases-modal .custom-tree-indent .ant-tree-node-content-wrapper { padding-inline: 6px !important; }
            /* Tree */
            .qa-plan-cases-modal .ant-tree { background: transparent; color: var(--txt-primary); font-size: inherit; }
            .qa-plan-cases-modal .ant-tree .ant-tree-treenode { width: 100%; padding: 1px 0; align-items: center; }
            .qa-plan-cases-modal .ant-tree .ant-tree-node-content-wrapper { min-height: 30px; display: flex; align-items: center; border-radius: 6px; transition: background-color .15s ease; }
            .qa-plan-cases-modal .ant-tree .ant-tree-node-content-wrapper:hover { background: var(--bg-layer-1-hover); }
            .qa-plan-cases-modal .ant-tree .ant-tree-node-content-wrapper.ant-tree-node-selected { background: var(--bg-accent-subtle); }
            .qa-plan-cases-modal .ant-tree .ant-tree-checkbox { align-self: center; margin: 0 4px 0 0; }
            .qa-plan-cases-modal .ant-tree .ant-tree-checkbox-inner { border-radius: 4px; border-color: var(--border-strong); background: var(--bg-surface-1); }
            .qa-plan-cases-modal .ant-tree .ant-tree-checkbox-checked .ant-tree-checkbox-inner { background: var(--bg-accent-primary); border-color: var(--bg-accent-primary); }
            .qa-plan-cases-modal .ant-tree .ant-tree-checkbox-indeterminate .ant-tree-checkbox-inner::after { background: var(--bg-accent-primary); }
            .qa-plan-cases-modal .ant-tree .ant-tree-checkbox:hover .ant-tree-checkbox-inner { border-color: var(--bg-accent-primary); }
            /* Input */
            .qa-plan-cases-modal .ant-input-affix-wrapper { border-radius: 8px; border-color: var(--border-subtle); background: var(--bg-surface-1); font-size: inherit; }
            .qa-plan-cases-modal .ant-input-affix-wrapper:hover { border-color: var(--border-strong); }
            .qa-plan-cases-modal .ant-input-affix-wrapper-focused, .qa-plan-cases-modal .ant-input-affix-wrapper:focus-within { border-color: var(--bg-accent-primary); box-shadow: 0 0 0 2px var(--bg-accent-subtle); }
            .qa-plan-cases-modal .ant-input { background: transparent; color: var(--txt-primary); font-size: inherit; }
            .qa-plan-cases-modal .ant-input::placeholder { color: var(--txt-placeholder); }
            .qa-plan-cases-modal .ant-input-prefix { color: var(--txt-tertiary); margin-inline-end: 8px; }
            /* Table */
            .qa-plan-cases-modal .ant-table-wrapper, .qa-plan-cases-modal .ant-table { background: transparent; font-size: inherit; }
            .qa-plan-cases-modal .ant-table { color: var(--txt-primary); border: 1px solid var(--border-subtle); border-radius: 10px; }
            .qa-plan-cases-modal .ant-table-container { border-radius: 10px; overflow: hidden; }
            .qa-plan-cases-modal .ant-table-thead > tr > th { background: var(--bg-surface-2) !important; color: var(--text-color-secondary) !important; font-weight: 500 !important; font-size: inherit !important; border-bottom: 1px solid var(--border-subtle) !important; padding: 10px 12px !important; }
            .qa-plan-cases-modal .ant-table-thead > tr > th::before { display: none !important; }
            .qa-plan-cases-modal .ant-table-tbody > tr > td { border-bottom: 1px solid var(--border-subtle) !important; padding: 9px 12px !important; font-size: inherit; }
            .qa-plan-cases-modal .ant-table-tbody > tr:last-child > td { border-bottom: none !important; }
            .qa-plan-cases-modal .ant-table-tbody > tr.ant-table-row:hover > td, .qa-plan-cases-modal .ant-table-cell-row-hover { background: var(--bg-layer-1-hover) !important; }
            .qa-plan-cases-modal .ant-table-tbody > tr.ant-table-row-selected > td { background: var(--bg-accent-subtle) !important; }
            /* Checkbox */
            .qa-plan-cases-modal .ant-checkbox-inner { border-radius: 4px; border-color: var(--border-strong); background: var(--bg-surface-1); }
            .qa-plan-cases-modal .ant-checkbox-checked .ant-checkbox-inner { background: var(--bg-accent-primary); border-color: var(--bg-accent-primary); }
            .qa-plan-cases-modal .ant-checkbox-indeterminate .ant-checkbox-inner::after { background: var(--bg-accent-primary); }
            .qa-plan-cases-modal .ant-checkbox:hover .ant-checkbox-inner, .qa-plan-cases-modal .ant-checkbox-wrapper:hover .ant-checkbox-inner { border-color: var(--bg-accent-primary); }
            .qa-plan-cases-modal .ant-checkbox-checked::after { border-color: var(--bg-accent-primary); }
            /* Pagination (align with plan-cases page footer style) */
            .qa-plan-cases-modal .modal-pagination-bar .ant-pagination {
              margin: 0 !important;
              color: var(--txt-secondary);
              font-size: inherit;
            }
            .qa-plan-cases-modal .modal-pagination-bar .ant-pagination .ant-pagination-simple-pager {
              color: var(--txt-secondary);
            }
            .qa-plan-cases-modal .modal-pagination-bar .ant-pagination .ant-pagination-simple-pager input {
              width: 40px;
              border-radius: 6px;
              border-color: var(--border-subtle);
              background: var(--bg-surface-1);
              color: var(--txt-primary);
            }
            .qa-plan-cases-modal .modal-pagination-bar .ant-pagination .ant-pagination-options-size-changer {
              margin-inline-start: 8px;
            }
            .qa-plan-cases-modal .modal-pagination-bar .ant-pagination .ant-select-selector {
              border-radius: 6px !important;
              border-color: var(--border-subtle) !important;
              background: var(--bg-surface-1) !important;
              color: var(--txt-secondary) !important;
            }
            .qa-plan-cases-modal .modal-pagination-bar .ant-pagination .ant-pagination-prev .ant-pagination-item-link,
            .qa-plan-cases-modal .modal-pagination-bar .ant-pagination .ant-pagination-next .ant-pagination-item-link {
              color: var(--txt-secondary);
            }
            /* Scroll areas: always show vertical scrollbar */
            .qa-plan-cases-modal .qa-plan-cases-modal-tree-scroll,
            .qa-plan-cases-modal .qa-plan-cases-modal-table-scroll {
              scrollbar-gutter: stable;
              overflow-y: scroll;
              scrollbar-width: thin;
              scrollbar-color: var(--scrollbar-thumb) transparent;
            }
            .qa-plan-cases-modal .qa-plan-cases-modal-tree-scroll::-webkit-scrollbar,
            .qa-plan-cases-modal .qa-plan-cases-modal-table-scroll::-webkit-scrollbar {
              width: 8px;
              height: 8px;
              display: block;
            }
            .qa-plan-cases-modal .qa-plan-cases-modal-tree-scroll::-webkit-scrollbar-track,
            .qa-plan-cases-modal .qa-plan-cases-modal-table-scroll::-webkit-scrollbar-track {
              background: transparent;
            }
            .qa-plan-cases-modal .qa-plan-cases-modal-tree-scroll::-webkit-scrollbar-thumb,
            .qa-plan-cases-modal .qa-plan-cases-modal-table-scroll::-webkit-scrollbar-thumb {
              background-color: var(--scrollbar-thumb);
              border-radius: 999px;
            }
            .qa-plan-cases-modal .qa-plan-cases-modal-tree-scroll::-webkit-scrollbar-thumb:hover,
            .qa-plan-cases-modal .qa-plan-cases-modal-table-scroll::-webkit-scrollbar-thumb:hover {
              background-color: color-mix(in oklch, var(--scrollbar-thumb) 85%, var(--txt-primary));
            }
          `,
          }}
        />

        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-subtle px-6 py-4">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-base font-bold text-primary">规划用例</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={closeModal}
            aria-label="关闭"
            className="flex size-8 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-layer-1-hover hover:text-secondary"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="h-[82vh]">
          <div className="flex h-full overflow-hidden">
            {/* Left: tree */}
            <div
              className="relative flex flex-col bg-layer-1/40"
              style={{ width: leftWidth, minWidth: 200, maxWidth: 320 }}
            >
              <div className="flex items-center gap-2 px-4 pb-2 pt-4">
                <span className="text-sm text-secondary">用例目录</span>
              </div>
              <div className="qa-plan-cases-modal-tree-scroll flex-1 min-h-0 px-2 pb-3">
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

            {/* Right: search + table */}
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-subtle px-4 py-3">
                <Input
                  placeholder="按用例名称搜索"
                  allowClear
                  prefix={<Search className="size-4" />}
                  value={searchName}
                  onChange={(e) => handleSearchNameChange(e.target.value)}
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
                        setSelectedNewIds([]);
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
                {loading && (
                  <div className="flex h-full items-center justify-center py-12">
                    <div className="flex flex-col items-center gap-3 text-tertiary">
                      <span className="size-6 animate-spin rounded-full border-2 border-subtle border-t-accent-primary" />
                      <span className="text-sm text-secondary">加载中...</span>
                    </div>
                  </div>
                )}
                {!loading && error && (
                  <div className="mb-4 rounded-lg border border-danger-subtle bg-danger-subtle px-4 py-3">
                    <div className="text-sm text-danger-primary">{error}</div>
                  </div>
                )}
                {!loading && !error && cases.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
                    <span className="flex size-12 items-center justify-center rounded-full bg-layer-1 text-tertiary">
                      <Layers className="size-6" />
                    </span>
                    <div className="text-sm text-secondary">暂无可关联的用例</div>
                  </div>
                )}
                {!loading && !error && cases.length > 0 && (
                  <>
                    <div className="qa-plan-cases-modal-table-scroll flex-1 min-h-0">
                      <Table
                        dataSource={cases}
                        columns={columns}
                        rowKey="id"
                        tableLayout="fixed"
                        pagination={false}
                        rowSelection={{
                          selectedRowKeys: selectedNewIds,
                          onChange: (keys) => {
                            const nextKeys = keys as string[];
                            setSelectedNewIds(nextKeys);
                            syncTreeCheckState(nextKeys);
                          },
                          preserveSelectedRowKeys: true,
                          selections: [
                            {
                              key: "select-all",
                              text: "本页全选",
                              onSelect: () => {
                                const nextKeys = Array.from(new Set([...selectedNewIds, ...cases.map((c) => c.id)]));
                                setSelectedNewIds(nextKeys);
                                syncTreeCheckState(nextKeys);
                              },
                            },
                            {
                              key: "clear-all",
                              text: "清空选择",
                              onSelect: () => {
                                setSelectedNewIds([]);
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

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-subtle bg-surface-1 px-6 py-3">
          <div className="text-sm text-secondary">
            已选 <span className="font-medium text-accent-primary">{selectedCount}</span> 个用例
          </div>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={closeModal} size="lg">
              取消
            </Button>
            <Button variant="primary" disabled={saving || !workspaceSlug || !planId} onClick={handleConfirm} size="lg">
              {saving ? "处理中..." : selectedCount > 0 ? `确定关联 ${selectedCount} 个` : "确定"}
            </Button>
          </div>
        </div>
      </div>
    </ModalCore>
  );
};

export default PlanCasesModal;
