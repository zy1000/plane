"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Modal, Space, Button, Input, Tree, Table, Tag, message } from "antd";
import { globalEnums, getEnums } from "app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/testhub/util";
import type { TableProps } from "antd";
import type { TreeProps } from "antd";
import { CaseService as QaCaseService } from "@/services/qa/case.service";
import styles from "./TestCaseSelectionModal.module.css";
import { AppstoreOutlined, DownOutlined } from "@ant-design/icons";
import { Atom } from "lucide-react";

type TTestCase = {
  id: string;
  name: string;
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

const getEnumLabel = (group: "case_state" | "case_type" | "case_priority", value?: number) => {
  if (value === null || value === undefined) return "-";
  const map = (globalEnums.Enums as any)?.[group] || {};
  const label = map[value] ?? map[String(value)] ?? value;
  return label as string;
};

const renderEnumTag = (
  group: "case_state" | "case_type" | "case_priority",
  value?: number,
  color: "default" | "processing" | "success" | "warning" | "magenta" = "default"
) => {
  const label = getEnumLabel(group, value);
  if (label === "-" || label === undefined) return <span className="text-custom-text-400">-</span>;
  return <Tag color={color}>{label}</Tag>;
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
    } catch (err: any) {
      message.error(err?.message || "获取用例失败");
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
    { title: "名称", dataIndex: "name", key: "name", render: (v) => <span className={styles.nameCell}>{v}</span> },
    { title: "用例库", dataIndex: "repository_name", key: "repository_name", render: (m) => m || "-", width: 160 },
    { title: "模块", dataIndex: "module", key: "module", render: (m) => m?.name || "-", width: 160 },
    {
      title: "类型",
      dataIndex: "type",
      key: "type",
      width: 120,
      render: (v) => renderEnumTag("case_type", v, "magenta"),
    },
    {
      title: "优先级",
      dataIndex: "priority",
      key: "priority",
      width: 120,
      render: (v) => renderEnumTag("case_priority", v, "warning"),
    },
  ];

  const handleConfirm = () => {
    onConfirm(selectedIds);
  };

  const renderNodeTitle = (title: string, icon: ReactNode, count?: number, fontMedium?: boolean) => {
    return (
      <div className="group flex items-center justify-between gap-2 w-full">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-5 h-5 text-custom-text-300">{icon}</span>
          <span className={`text-sm text-custom-text-200 ${fontMedium ? "font-medium" : ""}`}>{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {typeof count === "number" && <span className="text-xs text-custom-text-300">{count}</span>}
        </div>
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

    const icon =
      kind === "root" ? (
        <AppstoreOutlined />
      ) : kind === "repository" ? (
        <Atom size={14} />
      ) : kind === "repository_modules_all" ? (
        <AppstoreOutlined />
      ) : (
        <AppstoreOutlined />
      );

    const children = Array.isArray(node?.children) ? node.children : [];
    return {
      title: renderNodeTitle(node?.name ?? "-", icon, count, kind === "root" || kind === "repository_modules_all"),
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

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="选择测试用例"
      width={1200}
      keyboard={false}
      maskClosable={false}
      getContainer={false}
      destroyOnClose
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" onClick={handleConfirm} loading={loadingCases}>
            确定
          </Button>
        </Space>
      }
    >
      <div className={styles.modalBody}>
        <div className={styles.content}>
          <div className={styles.leftPane}>
            <div className="px-2">
              <style
                dangerouslySetInnerHTML={{
                  __html: `
                .custom-tree-indent .ant-tree-indent-unit {
                  width: 10px !important;
                }
                .custom-tree-indent .ant-tree-switcher {
                  width: 14px !important;
                  margin-inline-end: 8px !important;
                }
                .custom-tree-indent .ant-tree-node-content-wrapper {
                  padding-inline: 4px !important;
                }
              `,
                }}
              />
              <Tree
                showLine={false}
                checkable
                switcherIcon={
                  <span className="inline-flex items-center justify-center w-5 h-5 text-custom-text-300">
                    <DownOutlined />
                  </span>
                }
                onSelect={onSelect}
                onCheck={onCheck}
                onExpand={onExpand}
                expandedKeys={expandedKeys}
                autoExpandParent={autoExpandParent}
                treeData={treeData}
                selectedKeys={treeData.length > 0 ? [selectedTreeKey] : []}
                checkedKeys={checkedTreeKeys}
                className="py-2 pl-2 custom-tree-indent"
              />
            </div>
          </div>
          <div className={styles.rightPane}>
            <div className="flex items-center justify-between mb-2">
              <Input
                placeholder="按名称搜索"
                allowClear
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                className="w-64"
              />
            </div>
            <Table<TTestCase>
              size="small"
              rowKey="id"
              loading={loadingCases}
              dataSource={cases}
              columns={caseColumns as any}
              showHeader
              pagination={{
                current: currentPage,
                pageSize,
                total,
                showSizeChanger: true,
                pageSizeOptions: ["10", "20", "50", "100"],
                onChange: (page) => {
                  setCurrentPage(page);
                  fetchCases(page, pageSize, selectedRepositoryId || undefined, selectedModuleId || undefined);
                },
                onShowSizeChange: (_current, size) => {
                  setPageSize(size);
                  fetchCases(1, size, selectedRepositoryId || undefined, selectedModuleId || undefined);
                },
                showTotal: (t, r) => `第 ${r[0]}-${r[1]} 条，共 ${t} 条`,
              }}
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
        </div>
      </div>
    </Modal>
  );
}
