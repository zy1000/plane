"use client";

import React, { useEffect, useState, useMemo } from "react";
import { Modal, Tree, message } from "antd";
import { CaseService } from "@/services/qa/case.service";
import { RepositoryService } from "@/services/qa/repository.service";
import { ProjectService } from "@/services/project/project.service";
import { AppstoreOutlined } from "@ant-design/icons";
import type { TreeProps } from "antd";
import { FolderOpenDot } from "lucide-react";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  repositoryId: string;
  projectId?: string;
  selectedCaseIds: string[];
  onSuccess: () => void;
};

const caseService = new CaseService();
const repositoryService = new RepositoryService();
const projectService = new ProjectService();

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
  const [loading, setLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<string[]>(["root"]);
  const [autoExpandParent, setAutoExpandParent] = useState<boolean>(true);
  const [searchModule, setSearchModule] = useState<string>("");
  const [repositoryTrees, setRepositoryTrees] = useState<any[]>([]);

  const onExpand: TreeProps["onExpand"] = (keys) => {
    setExpandedKeys(keys as string[]);
    setAutoExpandParent(false);
  };

  const fetchRepositoriesAndModules = async () => {
    if (!workspaceSlug) return;
    try {
      const params: any = { page: 1, page_size: 10000 };
      // 不按项目过滤，获取工作空间下全部用例库，支持跨项目复制
      const res = await repositoryService.getRepositories(workspaceSlug, params);
      const repositories = Array.isArray(res) ? res : res?.results || res?.data || [];
      // 获取项目列表以便显示项目层级
      const projectsLite = await projectService.getProjectsLite(workspaceSlug);
      const projectNameMap: Record<string, string> = {};
      (projectsLite || []).forEach((p: any) => {
        if (p?.id) projectNameMap[String(p.id)] = String(p?.name || "");
      });
      const moduleGroups = await Promise.all(
        repositories.map((repo: any) =>
          caseService.getModules(workspaceSlug, String(repo?.id)).catch(() => [])
        )
      );
      // 组装为 项目 -> 用例库 -> 模块 的层级
      const byProject: Record<string, { projectId: string; projectName: string; repositories: any[] }> = {};
      repositories.forEach((repo: any, index: number) => {
        const projectId: string =
          typeof repo?.project === "string"
            ? String(repo.project)
            : repo?.project?.id
              ? String(repo.project.id)
              : "unknown";
        const projectName = projectNameMap[projectId] || (typeof repo?.project === "object" ? String(repo?.project?.name || "") : "");
        const repoRow = {
          id: String(repo?.id),
          name: String(repo?.name || "-"),
          modules: moduleGroups[index] || [],
        };
        if (!byProject[projectId]) {
          byProject[projectId] = { projectId, projectName: projectName || projectId, repositories: [repoRow] };
        } else {
          byProject[projectId].repositories.push(repoRow);
        }
      });
      const projectTrees = Object.values(byProject).sort((a, b) => a.projectName.localeCompare(b.projectName));
      setRepositoryTrees(projectTrees);
      setExpandedKeys(["root"]);
      setAutoExpandParent(true);
    } catch (err) {
      console.error("获取用例库/模块失败:", err);
      message.error("获取用例库/模块失败");
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchRepositoriesAndModules();
      setSelectedModuleId(null);
      setSearchModule("");
    }
  }, [isOpen, workspaceSlug, repositoryId, projectId]);

  const handleOk = async () => {
    if (!selectedModuleId) {
      message.warning("请选择目标模块");
      return;
    }
    if (selectedCaseIds.length === 0) {
      message.warning("未选择任何用例");
      return;
    }

    setLoading(true);
    try {
      await caseService.copyCase(workspaceSlug, selectedCaseIds, selectedModuleId);
      message.success("复制成功");
      onSuccess();
      handleClose();
    } catch (error) {
      console.error("复制用例失败:", error);
      message.error("复制用例失败");
    } finally {
      setLoading(false);
    }
  };

  const onSelect: TreeProps["onSelect"] = (_selectedKeys, info) => {
    if (!info.selected) {
      return;
    }
    const node: any = info.node;
    if (node?.kind === "module" && node?.moduleId) {
      setSelectedModuleId(String(node.moduleId));
    } else {
      setSelectedModuleId(null);
    }
  };

  const renderNodeTitle = (title: string, kind: "root" | "project" | "repository" | "module") => {
    const icon =
      kind === "module" ? (
        <FolderOpenDot size={14} />
      ) : (
        <AppstoreOutlined />
      );
    return (
      <div className="group flex items-center justify-between gap-2 w-full">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 text-custom-text-300">
            {icon}
          </span>
          <span className="text-sm text-custom-text-200">{title}</span>
        </div>
      </div>
    );
  };

  const buildModuleNodes = (list: any[], repositoryIdValue: string): any[] => {
    if (!Array.isArray(list)) return [];
    return list.map((node: any) => {
      const nodeId = String(node?.id);
      const childrenNodes = buildModuleNodes(node?.children || [], repositoryIdValue);
      return {
        title: renderNodeTitle(node?.name ?? "-", "module"),
        key: `module:${nodeId}`,
        name: node?.name ?? "-",
        kind: "module",
        repositoryId: repositoryIdValue,
        moduleId: nodeId,
        selectable: true,
        children: childrenNodes,
      };
    });
  };

  const buildProjectNodes = (list: any[]): any[] => {
    if (!Array.isArray(list)) return [];
    return list.map((proj: any) => {
      const projectId = String(proj?.projectId || "unknown");
      const projectName = String(proj?.projectName || "未知项目");
      const repositoryNodes = (Array.isArray(proj?.repositories) ? proj.repositories : []).map((repo: any) => {
        const repoId = String(repo?.id);
        const childrenNodes = buildModuleNodes(repo?.modules || [], repoId);
        return {
          title: renderNodeTitle(repo?.name ?? "-", "repository"),
          key: `repo:${repoId}`,
          name: repo?.name ?? "-",
          kind: "repository",
          repositoryId: repoId,
          selectable: false,
          children: childrenNodes,
        };
      });
      return {
        title: renderNodeTitle(projectName, "repository"),
        key: `project:${projectId}`,
        name: projectName,
        kind: "project",
        projectId,
        selectable: false,
        children: repositoryNodes,
      };
    });
  };

  const filterTreeByName = (list: any[], q: string): any[] => {
    if (!q) return list || [];
    const query = q.trim().toLowerCase();
    const walk = (nodes: any[]): any[] => {
      return (nodes || [])
        .map((n) => {
          const name = String(n?.name || "").toLowerCase();
          const childMatches = walk(n?.children || []);
          const selfMatch = name.includes(query);
          if (selfMatch || childMatches.length) {
            return { ...n, children: selfMatch ? n?.children || [] : childMatches };
          }
          return null;
        })
        .filter(Boolean) as any[];
    };
    return walk(list || []);
  };

  const repositoryNodes = useMemo(() => buildProjectNodes(repositoryTrees), [repositoryTrees]);
  const filteredRepositories = useMemo(
    () => filterTreeByName(repositoryNodes, searchModule),
    [repositoryNodes, searchModule]
  );

  const treeData = [
    {
      title: renderNodeTitle("全部用例库", "root"),
      key: "root",
      name: "全部用例库",
      kind: "root",
      selectable: false,
      children: filteredRepositories,
    },
  ];

  return (
    <Modal
      title="复制到模块"
      open={isOpen}
      onCancel={handleClose}
      onOk={handleOk}
      confirmLoading={loading}
      okText="确定"
      cancelText="取消"
    >
      <div className="h-[400px] overflow-y-auto border rounded p-2">
        <Tree
          blockNode
          onSelect={onSelect}
          onExpand={onExpand}
          expandedKeys={expandedKeys}
          autoExpandParent={autoExpandParent}
          treeData={treeData}
          selectedKeys={selectedModuleId ? [`module:${selectedModuleId}`] : []}
          className="py-2 custom-tree-indent"
        />
      </div>
    </Modal>
  );
};
