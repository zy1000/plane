"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { Modal, Tree, Input, message } from "antd";
import { AppstoreOutlined, GlobalOutlined, ProjectOutlined } from "@ant-design/icons";
import { FolderOpenDot } from "lucide-react";
import type { TreeProps } from "antd";
import { CaseModuleService } from "@/services/qa/case-module.service";
import { filterTree } from "./case-tree-utils";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  moduleId: string;
  moduleName: string;
  onSuccess: () => void;
  /** 额外合并进模块树（库列表）请求的查询参数（如模板场景传 { is_template: true }）；不传时请求与现状一致 */
  repositoryQuery?: Record<string, any>;
  /** project 为空的用例库分组标签（如模板场景传「模板库」）；不传时保持后端返回的名称或「-」 */
  emptyProjectGroupLabel?: string;
};

type SelectionTarget =
  | { kind: "repository"; repositoryId: string; workspaceSlug: string }
  | { kind: "module"; moduleId: string; workspaceSlug: string };

const caseModuleService = new CaseModuleService();

export const CopyModuleModal: React.FC<Props> = ({
  isOpen,
  handleClose,
  workspaceSlug,
  moduleId,
  moduleName,
  onSuccess,
  repositoryQuery,
  emptyProjectGroupLabel,
}) => {
  const fetchLockRef = useRef(false);
  const [target, setTarget] = useState<SelectionTarget | null>(null);
  const [loading, setLoading] = useState(false);
  const [treeLoading, setTreeLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<string[]>(["root"]);
  const [autoExpandParent, setAutoExpandParent] = useState(true);
  const [search, setSearch] = useState("");
  const [workspaceTrees, setWorkspaceTrees] = useState<any[]>([]);

  const onExpand: TreeProps["onExpand"] = (keys) => {
    setExpandedKeys(keys as string[]);
    setAutoExpandParent(false);
  };

  const fetchAll = async () => {
    if (fetchLockRef.current) return;
    fetchLockRef.current = true;
    setTreeLoading(true);
    try {
      const workspaces = await caseModuleService.getUserModuleTree(repositoryQuery);
      setWorkspaceTrees(workspaces || []);
      setExpandedKeys(["root"]);
      setAutoExpandParent(true);
    } catch {
      message.error("获取数据失败");
    } finally {
      fetchLockRef.current = false;
      setTreeLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAll();
      setTarget(null);
      setSearch("");
    }
  }, [isOpen]);

  const handleOk = async () => {
    if (!target) {
      message.warning("请选择目标用例库或模块");
      return;
    }
    setLoading(true);
    try {
      const payload: { module_id: string; target_module_id?: string; repository_id?: string } = {
        module_id: moduleId,
      };
      if (target.kind === "module") {
        payload.target_module_id = target.moduleId;
      } else {
        payload.repository_id = target.repositoryId;
      }
      await caseModuleService.copyModule(target.workspaceSlug, payload);
      message.success("复制成功");
      onSuccess();
      handleClose();
    } catch (err: any) {
      const msg = err?.error || err?.detail || "复制失败";
      message.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const onSelect: TreeProps["onSelect"] = (_keys, info) => {
    if (!info.selected) return;
    const node: any = info.node;
    if (node?.kind === "repository") {
      setTarget({ kind: "repository", repositoryId: node.repositoryId, workspaceSlug: node.wsSlug });
    } else if (node?.kind === "module") {
      setTarget({ kind: "module", moduleId: node.moduleId, workspaceSlug: node.wsSlug });
    } else {
      setTarget(null);
    }
  };

  const renderTitle = (title: string, kind: "workspace" | "project" | "repository" | "module") => {
    const icon =
      kind === "workspace" ? (
        <GlobalOutlined className="text-secondary" />
      ) : kind === "project" ? (
        <ProjectOutlined className="text-secondary" />
      ) : kind === "repository" ? (
        <AppstoreOutlined className="text-secondary" />
      ) : (
        <FolderOpenDot size={14} className="text-secondary" />
      );
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-4 h-4">{icon}</span>
        <span className="text-sm text-primary">{title}</span>
      </div>
    );
  };

  const buildModuleNodes = (list: any[], wsSlug: string): any[] => {
    if (!Array.isArray(list)) return [];
    return list.map((m: any) => {
      const mid = String(m?.id);
      return {
        title: renderTitle(m?.name ?? "-", "module"),
        key: `module:${wsSlug}:${mid}`,
        name: m?.name ?? "-",
        kind: "module",
        moduleId: mid,
        wsSlug,
        selectable: true,
        children: buildModuleNodes(m?.children || [], wsSlug),
      };
    });
  };

  const buildTree = (workspaces: any[]): any[] =>
    workspaces.map((ws) => {
      const projectNodes = (ws.projects || []).map((proj: any) => {
        const projKey = proj?.id ? `proj:${ws.slug}:${proj.id}` : `proj:${ws.slug}:__no_project__`;
        // project 为空的分组（模板库 project=null 会落在这里），允许调用方自定义标签
        const projName = proj?.id ? (proj?.name ?? "-") : (emptyProjectGroupLabel ?? proj?.name ?? "-");
        const repoNodes = (proj.repositories || []).map((repo: any) => ({
          title: renderTitle(repo.name, "repository"),
          key: `repo:${ws.slug}:${repo.id}`,
          name: repo.name,
          kind: "repository",
          repositoryId: repo.id,
          wsSlug: ws.slug,
          selectable: true,
          children: buildModuleNodes(repo.modules || [], ws.slug),
        }));
        return {
          title: renderTitle(projName, "project"),
          key: projKey,
          name: projName,
          kind: "project",
          selectable: false,
          children: repoNodes,
        };
      });
      return {
        title: renderTitle(ws.name, "workspace"),
        key: `ws:${ws.slug}`,
        name: ws.name,
        kind: "workspace",
        selectable: false,
        children: projectNodes,
      };
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const treeNodes = useMemo(() => buildTree(workspaceTrees), [workspaceTrees, emptyProjectGroupLabel]);
  const filteredNodes = useMemo(() => filterTree(treeNodes, search), [treeNodes, search]);

  const treeData = [
    {
      title: renderTitle("全部工作区", "workspace"),
      key: "root",
      name: "全部工作区",
      kind: "root",
      selectable: false,
      children: filteredNodes,
    },
  ];

  const selectedKey = useMemo(() => {
    if (!target) return [];
    if (target.kind === "repository") return [`repo:${target.workspaceSlug}:${target.repositoryId}`];
    return [`module:${target.workspaceSlug}:${target.moduleId}`];
  }, [target]);

  return (
    <Modal
      title={`复制模板「${moduleName}」`}
      open={isOpen}
      onCancel={handleClose}
      onOk={handleOk}
      confirmLoading={loading}
      okText="确定"
      cancelText="取消"
      okButtonProps={{ disabled: !target }}
    >
      <div className="mb-2">
        <Input
          placeholder="搜索用例库或模块..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          size="small"
        />
      </div>
      <div className="h-[380px] overflow-y-auto border rounded p-2">
        {treeLoading ? (
          <div className="flex items-center justify-center h-full text-secondary text-sm">加载中...</div>
        ) : (
          <Tree
            blockNode
            onSelect={onSelect}
            onExpand={onExpand}
            expandedKeys={expandedKeys}
            autoExpandParent={autoExpandParent}
            treeData={treeData}
            selectedKeys={selectedKey}
            className="py-1 custom-tree-indent"
          />
        )}
      </div>
      {target && (
        <p className="mt-2 text-xs text-secondary">
          已选择：
          {target.kind === "repository" ? `用例库（${target.repositoryId}）` : `模块（${target.moduleId}）`}
          — 复制后将作为其
          {target.kind === "repository" ? "根级模板" : "子模板"}
        </p>
      )}
    </Modal>
  );
};
