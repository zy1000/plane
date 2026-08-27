"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Modal, Tree, message, Empty, Spin } from "antd";
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
import { CaseModuleService } from "@/services/qa/case-module.service";
import { filterTree } from "./case-tree-utils";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  repositoryId: string;
  projectId?: string;
  selectedCaseIds: string[];
  onSuccess: () => void;
  /** 额外合并进用例库列表请求的查询参数（如模板场景传 { is_template: true }）；不传时请求与现状一致 */
  repositoryQuery?: Record<string, any>;
  /** project 为空的用例库分组标签（如模板场景传「模板库」）；默认「未关联项目」 */
  emptyProjectGroupLabel?: string;
};

/** 复制目标：到模块为平铺复制；到用例库时按源模块结构在目标库匹配/创建同名模块链 */
type CopyTarget = { kind: "module" | "repository"; id: string; name: string };

const caseService = new CaseService();
const caseModuleService = new CaseModuleService();

const NO_PROJECT_KEY = "__no_project__";

/** 收集过滤后树中所有非叶子节点的 key，搜索时全部展开以直接看到命中结果 */
const collectExpandableKeys = (nodes: any[]): React.Key[] =>
  (nodes || []).flatMap((n) => (n?.children?.length ? [n.key, ...collectExpandableKeys(n.children)] : []));

export const CopyCaseModal: React.FC<Props> = ({
  isOpen,
  handleClose,
  workspaceSlug,
  selectedCaseIds,
  onSuccess,
  repositoryQuery,
  emptyProjectGroupLabel,
}) => {
  const [target, setTarget] = useState<CopyTarget | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>(["root"]);
  const [autoExpandParent, setAutoExpandParent] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  // 当前工作空间下 项目 -> 用例库 -> 模块 的全量数据：来自用户模块树接口一次拉全，不分页，
  // 避免此前按用例库分页导致同一项目的库被分页边界切开而展示不全
  const [projects, setProjects] = useState<any[]>([]);

  const onExpand: TreeProps["onExpand"] = (keys) => {
    setExpandedKeys(keys);
    setAutoExpandParent(false);
  };

  // 序列化后作为依赖，避免调用方内联对象字面量导致重复请求
  const repositoryQueryKey = JSON.stringify(repositoryQuery ?? null);

  useEffect(() => {
    if (!isOpen) return;
    setTarget(null);
    setSearch("");
    setExpandedKeys(["root"]);
    setAutoExpandParent(true);
    setFetching(true);
    caseModuleService
      .getUserModuleTree(repositoryQuery)
      .then((workspaces) => {
        // 接口返回用户所在全部工作空间，这里限定当前工作空间：支持跨项目复制，同时避免跨工作空间越权
        const current = (workspaces || []).find((ws: any) => ws?.slug === workspaceSlug);
        setProjects(current?.projects || []);
      })
      .catch((err) => {
        console.error("获取用例库/模块失败:", err);
        message.error("获取用例库/模块失败");
      })
      .finally(() => setFetching(false));
    // repositoryQuery 以序列化 key 参与依赖，避免对象字面量身份抖动
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, workspaceSlug, repositoryQueryKey]);

  const projectCount = projects.length;
  const repoCount = useMemo(
    () => projects.reduce((n: number, p: any) => n + (p?.repositories?.length || 0), 0),
    [projects]
  );

  const handleOk = async () => {
    if (!target) {
      message.warning("请选择目标用例库或模块");
      return;
    }
    if (selectedCaseIds.length === 0) {
      message.warning("未选择任何用例");
      return;
    }

    setSubmitting(true);
    try {
      await caseService.copyCase(
        workspaceSlug,
        selectedCaseIds,
        target.kind === "module" ? { moduleId: target.id } : { repositoryId: target.id }
      );
      message.success("复制成功");
      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error("复制用例失败:", error);
      message.error(error?.error || error?.detail || "复制用例失败");
    } finally {
      setSubmitting(false);
    }
  };

  const onSelect: TreeProps["onSelect"] = (_selectedKeys, info) => {
    // 再次点击已选中节点会触发 selected=false（expandAction=click 下只是折叠），忽略以保持当前目标
    if (!info.selected) return;
    const node: any = info.node;
    if (node?.kind === "module" && node?.moduleId) {
      setTarget({ kind: "module", id: String(node.moduleId), name: String(node.name || "") });
    } else if (node?.kind === "repository" && node?.repositoryId) {
      setTarget({ kind: "repository", id: String(node.repositoryId), name: String(node.name || "") });
    }
  };

  const buildModuleNodes = (list: any[], repositoryIdValue: string): any[] => {
    if (!Array.isArray(list)) return [];
    return list.map((node: any) => {
      const nodeId = String(node?.id);
      const name = String(node?.name ?? "-");
      const childrenNodes = buildModuleNodes(node?.children || [], repositoryIdValue);
      const isSelected = target?.kind === "module" && target.id === nodeId;
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

  const projectNodes = useMemo(() => {
    const named = projects.map((proj: any) => {
      const hasProject = !!proj?.id;
      const projId = hasProject ? String(proj.id) : NO_PROJECT_KEY;
      // project 为空的分组（接口返回「未关联项目」），允许调用方自定义标签（如模板场景「模板库」）
      const projectName = hasProject
        ? String(proj?.name || projId)
        : emptyProjectGroupLabel || String(proj?.name || "未关联项目");
      return { proj, projId, projectName };
    });
    named.sort((a, b) => a.projectName.localeCompare(b.projectName));

    return named.map(({ proj, projId, projectName }) => {
      const repoNodes = (Array.isArray(proj?.repositories) ? proj.repositories : []).map((repo: any) => {
        const repoId = String(repo?.id);
        const repoName = String(repo?.name ?? "-");
        const isSelected = target?.kind === "repository" && target.id === repoId;
        const moduleNodes = buildModuleNodes(repo?.modules || [], repoId);
        return {
          title: (
            <div className="flex w-full items-center justify-between gap-2 pr-0.5">
              <span className="flex min-w-0 items-center gap-2">
                <Library size={15} className={cn("shrink-0", isSelected ? "text-accent-primary" : "text-secondary")} />
                <span
                  className={cn("truncate text-[13px] font-medium", isSelected ? "text-accent-primary" : "text-primary")}
                >
                  {repoName}
                </span>
                {moduleNodes.length === 0 && <span className="shrink-0 text-[11px] text-tertiary">（空）</span>}
              </span>
              {isSelected && <Check size={15} className="shrink-0 text-accent-primary" />}
            </div>
          ),
          key: `repo:${repoId}`,
          name: repoName,
          kind: "repository",
          repositoryId: repoId,
          selectable: true,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, target, emptyProjectGroupLabel]);

  const filteredProjectNodes = useMemo(() => filterTree(projectNodes, search), [projectNodes, search]);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    const query = value.trim();
    // 搜索时展开命中路径上的全部节点，便于直接看到结果；清空后回到只展开根节点
    setExpandedKeys(query ? ["root", ...collectExpandableKeys(filterTree(projectNodes, query))] : ["root"]);
    setAutoExpandParent(true);
  };

  const handleSearchClear = () => handleSearchChange("");

  const treeData = useMemo(
    () => [
      {
        title: (
          <span className="flex w-full items-center gap-2">
            <Layers size={15} className="shrink-0 text-secondary" />
            <span className="text-[13px] font-semibold text-primary">全部用例库</span>
            {repoCount > 0 && (
              <span className="shrink-0 rounded-full bg-layer-1 px-1.5 py-0.5 text-[11px] leading-none text-tertiary">
                {repoCount}
              </span>
            )}
          </span>
        ),
        key: "root",
        name: "全部用例库",
        kind: "root",
        selectable: false,
        children: filteredProjectNodes,
      },
    ],
    [filteredProjectNodes, repoCount]
  );

  const isEmpty = filteredProjectNodes.length === 0;
  const selectedKeys = target ? [target.kind === "module" ? `module:${target.id}` : `repo:${target.id}`] : [];

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
              <h3 className="text-[15px] font-semibold leading-tight tracking-tight text-primary">复制到</h3>
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
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && search) {
                  e.stopPropagation();
                  handleSearchClear();
                }
              }}
              placeholder="搜索项目 / 用例库 / 模块"
              className="copy-module-search h-9 w-full rounded-lg border border-subtle bg-layer-1 pl-9 pr-9 text-[13px] text-primary outline-none transition-shadow placeholder:text-placeholder"
            />
            {search && (
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
                        {search.trim() ? "未找到匹配的项目 / 用例库 / 模块" : "暂无用例库"}
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
                  selectedKeys={selectedKeys}
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
          <span className="text-xs text-tertiary">
            共 <span className="font-medium text-secondary">{projectCount}</span> 个项目 ·{" "}
            <span className="font-medium text-secondary">{repoCount}</span> 个用例库
          </span>

          <div className={cn("flex items-center gap-3", target ? "justify-between" : "justify-end")}>
            {target && (
              <div className="flex min-w-0 flex-col gap-0.5 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-primary text-on-color">
                    <Check size={12} />
                  </span>
                  <span className="shrink-0 text-secondary">{target.kind === "module" ? "目标模块" : "目标用例库"}</span>
                  <span className="truncate font-medium text-primary" style={{ maxWidth: 220 }}>
                    {target.name || "已选择"}
                  </span>
                </div>
                {target.kind === "repository" && (
                  <span className="pl-7 text-[11px] text-tertiary">将按原模块结构复制到该用例库</span>
                )}
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
                disabled={!target || submitting}
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
