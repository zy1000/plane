"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal, Tree, message, Pagination, Empty, Spin } from "antd";
import type { TreeProps } from "antd";
import {
  Check,
  ChevronRight,
  Folder,
  FolderInput,
  FolderKanban,
  FolderOpen,
  Layers,
  Library,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { cn } from "@plane/utils";
import { CaseService } from "@/services/qa/case.service";
import { RepositoryService } from "@/services/qa/repository.service";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  repositoryId: string;
  projectId?: string;
  selectedCaseIds: string[];
  onSuccess: () => void;
};

type RepoRow = { id: string; name: string; modules: any[] };
type ProjectGroup = { projectId: string; projectName: string; repositories: RepoRow[] };

const caseService = new CaseService();
const repositoryService = new RepositoryService();

const DEFAULT_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

export const CopyCaseModal: React.FC<Props> = ({
  isOpen,
  handleClose,
  workspaceSlug,
  repositoryId,
  projectId,
  selectedCaseIds,
  onSuccess,
}) => {
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedModuleName, setSelectedModuleName] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(["root"]);
  const [autoExpandParent, setAutoExpandParent] = useState<boolean>(true);
  const [searchInput, setSearchInput] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState<number>(0);
  const [repositoryTrees, setRepositoryTrees] = useState<ProjectGroup[]>([]);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onExpand: TreeProps["onExpand"] = (keys) => {
    setExpandedKeys(keys);
    setAutoExpandParent(false);
  };

  // 服务端分页拉取用例库，并用 repository_id__in 一次性批量拉取当前页所有用例库的模块树
  const fetchData = useCallback(
    async (opts: { page: number; pageSize: number; search: string }) => {
      if (!workspaceSlug) return;
      setFetching(true);
      try {
        const params: any = {
          page: opts.page,
          page_size: opts.pageSize,
          // 限定当前工作空间，支持跨项目复制，同时避免跨工作空间越权
          workspace__slug: workspaceSlug,
        };
        // search 在后端对「用例库名称」与「所属项目名称」做 OR 匹配
        if (opts.search) params.search = opts.search;

        const res = await repositoryService.getRepositories(workspaceSlug, params);
        const repositories: any[] = Array.isArray(res) ? res : res?.data || res?.results || [];
        const count = Number(res?.count ?? repositories.length ?? 0);

        // 关键：一次请求批量拉取本页所有用例库的模块，替代逐个 repository 的 N 次请求
        const repoIds = repositories.map((r) => String(r?.id)).filter(Boolean);
        const modulesByRepo: Record<string, any[]> = {};
        if (repoIds.length) {
          const bulkModules = await caseService.getModulesByRepositoryIds(workspaceSlug, repoIds).catch(() => []);
          (bulkModules || []).forEach((moduleNode: any) => {
            const repoId = String(moduleNode?.repository ?? "");
            if (!repoId) return;
            if (!modulesByRepo[repoId]) modulesByRepo[repoId] = [];
            modulesByRepo[repoId].push(moduleNode);
          });
        }

        // 组装为 项目 -> 用例库 -> 模块 的层级（repo.project 由后端 depth=1 直接返回对象）
        const byProject: Record<string, ProjectGroup> = {};
        repositories.forEach((repo: any) => {
          const proj = repo?.project;
          const projId: string =
            proj && typeof proj === "object" ? String(proj.id) : typeof proj === "string" ? proj : "unknown";
          const projectName: string =
            proj && typeof proj === "object"
              ? String(proj.name || projId)
              : typeof proj === "string"
                ? proj
                : "未关联项目";
          const repoRow: RepoRow = {
            id: String(repo?.id),
            name: String(repo?.name || "-"),
            modules: modulesByRepo[String(repo?.id)] || [],
          };
          if (!byProject[projId]) {
            byProject[projId] = { projectId: projId, projectName, repositories: [repoRow] };
          } else {
            byProject[projId].repositories.push(repoRow);
          }
        });
        const projectTrees = Object.values(byProject).sort((a, b) => a.projectName.localeCompare(b.projectName));
        setRepositoryTrees(projectTrees);
        setTotal(count);

        // 默认只展开根节点（仅显示第一层项目，项目保持折叠）；搜索时展开项目与用例库，便于直接看到命中结果
        if (opts.search) {
          const projectKeys = projectTrees.map((p) => `project:${p.projectId}`);
          const repoKeys = projectTrees.flatMap((p) => p.repositories.map((r) => `repo:${r.id}`));
          setExpandedKeys(["root", ...projectKeys, ...repoKeys]);
        } else {
          setExpandedKeys(["root"]);
        }
        setAutoExpandParent(true);
      } catch (err) {
        console.error("获取用例库/模块失败:", err);
        message.error("获取用例库/模块失败");
      } finally {
        setFetching(false);
      }
    },
    [workspaceSlug]
  );

  useEffect(() => {
    if (!isOpen) return;
    setSelectedModuleId(null);
    setSelectedModuleName("");
    setSearchInput("");
    setSearchQuery("");
    setPage(1);
    setPageSize(DEFAULT_PAGE_SIZE);
    fetchData({ page: 1, pageSize: DEFAULT_PAGE_SIZE, search: "" });
  }, [isOpen, workspaceSlug, repositoryId, projectId, fetchData]);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    []
  );

  const applySearch = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      setSearchQuery(trimmed);
      setPage(1);
      fetchData({ page: 1, pageSize, search: trimmed });
    },
    [fetchData, pageSize]
  );

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => applySearch(value), SEARCH_DEBOUNCE_MS);
  };

  const handleSearchImmediate = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    applySearch(searchInput);
  };

  const handleSearchClear = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    setSearchInput("");
    applySearch("");
  };

  const handlePageChange = (nextPage: number, nextPageSize: number) => {
    setPage(nextPage);
    setPageSize(nextPageSize);
    fetchData({ page: nextPage, pageSize: nextPageSize, search: searchQuery });
  };

  const handleOk = async () => {
    if (!selectedModuleId) {
      message.warning("请选择目标模块");
      return;
    }
    if (selectedCaseIds.length === 0) {
      message.warning("未选择任何用例");
      return;
    }

    setSubmitting(true);
    try {
      await caseService.copyCase(workspaceSlug, selectedCaseIds, selectedModuleId);
      message.success("复制成功");
      onSuccess();
      handleClose();
    } catch (error) {
      console.error("复制用例失败:", error);
      message.error("复制用例失败");
    } finally {
      setSubmitting(false);
    }
  };

  const onSelect: TreeProps["onSelect"] = (_selectedKeys, info) => {
    if (!info.selected) return;
    const node: any = info.node;
    if (node?.kind === "module" && node?.moduleId) {
      setSelectedModuleId(String(node.moduleId));
      setSelectedModuleName(String(node.name || ""));
    }
  };

  const buildModuleNodes = (list: any[], repositoryIdValue: string): any[] => {
    if (!Array.isArray(list)) return [];
    return list.map((node: any) => {
      const nodeId = String(node?.id);
      const name = String(node?.name ?? "-");
      const childrenNodes = buildModuleNodes(node?.children || [], repositoryIdValue);
      const isSelected = selectedModuleId === nodeId;
      const hasChildren = childrenNodes.length > 0;
      return {
        title: (
          <div className="flex w-full items-center justify-between gap-2 pr-0.5">
            <span className="flex min-w-0 items-center gap-2">
              {isSelected ? (
                <FolderOpen size={15} className="shrink-0 text-accent-primary" />
              ) : hasChildren ? (
                <FolderOpen size={15} className="shrink-0 text-tertiary" />
              ) : (
                <Folder size={15} className="shrink-0 text-tertiary" />
              )}
              <span className={cn("truncate text-[13px]", isSelected ? "font-medium text-accent-primary" : "text-primary")}>
                {name}
              </span>
            </span>
            {isSelected && <Check size={15} className="shrink-0 text-accent-primary" />}
          </div>
        ),
        key: `module:${nodeId}`,
        name,
        kind: "module",
        repositoryId: repositoryIdValue,
        moduleId: nodeId,
        selectable: true,
        children: childrenNodes,
      };
    });
  };

  const treeData = useMemo(() => {
    const projectNodes = repositoryTrees.map((proj) => {
      const projId = String(proj?.projectId || "unknown");
      const projectName = String(proj?.projectName || "未知项目");
      const repoNodes = (Array.isArray(proj?.repositories) ? proj.repositories : []).map((repo) => {
        const repoId = String(repo?.id);
        const moduleNodes = buildModuleNodes(repo?.modules || [], repoId);
        return {
          title: (
            <span className="flex w-full items-center gap-2">
              <Library size={15} className="shrink-0 text-secondary" />
              <span className="truncate text-[13px] font-medium text-primary">{repo?.name ?? "-"}</span>
              {moduleNodes.length === 0 && (
                <span className="shrink-0 text-[11px] text-tertiary">（空）</span>
              )}
            </span>
          ),
          key: `repo:${repoId}`,
          name: repo?.name ?? "-",
          kind: "repository",
          repositoryId: repoId,
          selectable: false,
          children: moduleNodes,
        };
      });
      return {
        title: (
          <span className="flex w-full items-center gap-2">
            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent-primary">
              <FolderKanban size={13} />
            </span>
            <span className="truncate text-[13px] font-semibold text-primary">{projectName}</span>
            <span className="shrink-0 rounded-full bg-layer-1 px-1.5 py-0.5 text-[11px] leading-none text-tertiary">
              {repoNodes.length}
            </span>
          </span>
        ),
        key: `project:${projId}`,
        name: projectName,
        kind: "project",
        projectId: projId,
        selectable: false,
        children: repoNodes,
      };
    });

    return [
      {
        title: (
          <span className="flex w-full items-center gap-2">
            <Layers size={15} className="shrink-0 text-secondary" />
            <span className="text-[13px] font-semibold text-primary">全部用例库</span>
            {total > 0 && (
              <span className="shrink-0 rounded-full bg-layer-1 px-1.5 py-0.5 text-[11px] leading-none text-tertiary">
                {total}
              </span>
            )}
          </span>
        ),
        key: "root",
        name: "全部用例库",
        kind: "root",
        selectable: false,
        children: projectNodes,
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repositoryTrees, selectedModuleId, total]);

  const isEmpty = repositoryTrees.length === 0;

  return (
    <Modal
      open={isOpen}
      onCancel={handleClose}
      footer={null}
      closable={false}
      title={null}
      width={640}
      centered
      styles={{
        content: { padding: 0, borderRadius: 16, overflow: "hidden" },
        body: { padding: 0 },
        mask: { background: "rgba(2,6,23,0.5)", backdropFilter: "blur(3px)" },
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes cmFadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
            .copy-module-body { animation: cmFadeIn .28s ease; }
            .copy-module-search:focus {
              border-color: var(--border-color-accent-strong);
              box-shadow: 0 0 0 3px color-mix(in oklch, var(--border-color-accent-strong) 16%, transparent);
            }
            .copy-module-tree .ant-tree { background: transparent !important; font-size: 13px; }
            .copy-module-tree .ant-tree-treenode { width: 100%; padding: 1px 0 !important; align-items: center; }
            .copy-module-tree .ant-tree-switcher {
              width: 20px; align-self: stretch; display: flex; align-items: center; justify-content: center; background: transparent;
            }
            .copy-module-tree .ant-tree-node-content-wrapper {
              flex: 1; min-width: 0; min-height: 30px; display: flex; align-items: center;
              padding: 3px 8px !important; border-radius: 8px;
              transition: background-color .15s ease, box-shadow .15s ease;
            }
            .copy-module-tree .ant-tree-node-content-wrapper .ant-tree-title { width: 100%; }
            .copy-module-tree .ant-tree-node-content-wrapper:hover { background: var(--background-color-layer-1) !important; }
            .copy-module-tree .ant-tree-treenode-selected > .ant-tree-node-content-wrapper,
            .copy-module-tree .ant-tree-node-content-wrapper.ant-tree-node-selected,
            .copy-module-tree .ant-tree-node-content-wrapper.ant-tree-node-selected:hover {
              background: var(--background-color-accent-subtle) !important;
              box-shadow: inset 2px 0 0 0 var(--border-color-accent-strong);
            }
            .copy-module-tree .ant-tree-indent-unit { position: relative; width: 18px; }
            .copy-module-tree .ant-tree-indent-unit::before {
              content: ""; position: absolute; top: -4px; bottom: -4px; left: 9px;
              border-left: 1px dashed var(--border-subtle); opacity: .7;
            }
          `,
        }}
      />
      <div className="copy-module-body flex flex-col bg-surface-1">
        {/* Header */}
        <div className="relative overflow-hidden border-b border-subtle px-5 py-4">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(100deg, color-mix(in oklch, var(--background-color-accent-subtle) 75%, transparent), transparent 60%)",
            }}
          />
          <div className="relative flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-primary text-on-color shadow-sm">
              <FolderInput size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-[15px] font-semibold leading-tight tracking-tight text-primary">复制到模块</h3>
            </div>
            <button
              type="button"
              aria-label="关闭"
              onClick={handleClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Toolbar / search */}
        <div className="px-5 pt-3">
          <div className="group relative">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tertiary transition-colors group-focus-within:text-accent-primary"
            />
            <input
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearchImmediate();
                if (e.key === "Escape" && searchInput) {
                  e.stopPropagation();
                  handleSearchClear();
                }
              }}
              placeholder="搜索用例库或项目名称"
              className="copy-module-search h-9 w-full rounded-lg border border-subtle bg-layer-1 pl-9 pr-9 text-[13px] text-primary outline-none transition-shadow placeholder:text-placeholder"
            />
            {searchInput && (
              <button
                type="button"
                aria-label="清空搜索"
                onClick={handleSearchClear}
                className="absolute right-2.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-tertiary transition-colors hover:bg-layer-1 hover:text-primary"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Tree */}
        <div className="px-5 py-3">
          <Spin spinning={fetching}>
            <div className="copy-module-tree vertical-scrollbar h-[320px] overflow-y-auto rounded-xl border border-subtle bg-surface-1 p-2">
              {isEmpty ? (
                <div className="flex h-full items-center justify-center">
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      <span className="text-xs text-tertiary">
                        {searchQuery ? "未找到匹配的用例库 / 项目" : "暂无用例库"}
                      </span>
                    }
                  />
                </div>
              ) : (
                <Tree
                  blockNode
                  expandAction="click"
                  showIcon={false}
                  onSelect={onSelect}
                  onExpand={onExpand}
                  expandedKeys={expandedKeys}
                  autoExpandParent={autoExpandParent}
                  treeData={treeData}
                  selectedKeys={selectedModuleId ? [`module:${selectedModuleId}`] : []}
                  switcherIcon={({ expanded, isLeaf }: any) =>
                    isLeaf ? (
                      <span className="inline-block h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight
                        size={14}
                        className={cn("text-tertiary transition-transform duration-150", expanded && "rotate-90")}
                      />
                    )
                  }
                />
              )}
            </div>
          </Spin>
        </div>

        {/* Footer */}
        <div className="space-y-3 border-t border-subtle px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-tertiary">
              共 <span className="font-medium text-secondary">{total}</span> 个用例库
            </span>
            <Pagination
              size="small"
              current={page}
              pageSize={pageSize}
              total={total}
              showSizeChanger
              pageSizeOptions={["10", "20", "50", "100"]}
              onChange={handlePageChange}
            />
          </div>

          <div
            className={cn(
              "flex items-center gap-3",
              selectedModuleId ? "justify-between" : "justify-end"
            )}
          >
            {selectedModuleId && (
              <div className="flex min-w-0 items-center gap-2 text-xs">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-primary text-on-color">
                  <Check size={12} />
                </span>
                <span className="shrink-0 text-secondary">目标模块</span>
                <span className="truncate font-medium text-primary" style={{ maxWidth: 220 }}>
                  {selectedModuleName || "已选择"}
                </span>
              </div>
            )}
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="rounded-lg border border-subtle px-3.5 py-1.5 text-sm text-secondary transition-colors hover:bg-layer-1 hover:text-primary"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleOk}
                disabled={!selectedModuleId || submitting}
                className="flex items-center gap-1.5 rounded-lg bg-accent-primary px-3.5 py-1.5 text-sm font-medium text-on-color transition-colors hover:bg-accent-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <FolderInput size={14} />}
                复制到此处
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};
