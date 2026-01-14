"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Tree, Table, Row, Col, Tag, message, Tooltip } from "antd";
import type { TreeProps } from "antd";
import type { TableProps } from "antd";
import { AppstoreOutlined, DeploymentUnitOutlined } from "@ant-design/icons";
import { ModalCore, EModalPosition, EModalWidth } from "@plane/ui";
import { Button } from "@plane/propel/button";
import { CaseService } from "@/services/qa/case.service";
import { PlanService } from "@/services/qa/plan.service";
import {
  formatDateTime,
  globalEnums,
} from "app/(all)/[workspaceSlug]/(projects)/projects/(detail)/[projectId]/testhub/util";

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
  planId,
  initialSelectedCaseIds,
  onClosed,
}) => {
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

  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);

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

  useEffect(() => {
    const init = Array.isArray(initialSelectedCaseIds) ? initialSelectedCaseIds.filter(Boolean) : [];
    setExistingIds(init);
    setSelectedNewIds([]);
    setCheckedTreeKeys([]);
    nodeCaseIdsCacheRef.current = {};
    setSelectedTreeKey("root");
    setSelectedRepositoryId(null);
    setSelectedModuleId(null);
    if (!isOpen || !workspaceSlug || !planId) return;
    fetchPlanTree();
    fetchCases(1, undefined, undefined);
  }, [isOpen]);

  const fetchPlanTree = async () => {
    if (!workspaceSlug || !planId) return;
    try {
      const data = await caseService.getPlanUnassociatedCaseTree(String(workspaceSlug), { plan_id: String(planId) });
      setPlanTree(data || null);
      setExpandedKeys([]);
      setAutoExpandParent(true);
    } catch {
      setPlanTree(null);
    }
  };

  const fetchCases = async (page: number, repoId?: string, moduleId?: string) => {
    try {
      if (!planId) return;
      setLoading(true);
      setError(null);
      const params: any = {
        plan_id: String(planId || ""),
        page,
        page_size: 10,
      };
      if (repoId) params.repository_id = repoId;
      if (moduleId) params.module_id = moduleId;
      const response: TestCaseResponse = await caseService.getPlanUnassociatedCases(String(workspaceSlug), params);
      setCases(response?.data || []);
      setTotal(response?.count || 0);
      setCurrentPage(page);
    } catch (e) {
      setError("用例加载失败");
    } finally {
      setLoading(false);
    }
  };

  const onSelect: TreeProps["onSelect"] = (selectedKeys, info) => {
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
        <DeploymentUnitOutlined />
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
    if (!planTree) return [];
    return [buildTreeNode(planTree)];
  }, [planTree]);

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
            <div className="truncate">{value}</div>
          </Tooltip>
        );
      },
    },
    {
      title: "类型",
      dataIndex: "type",
      width: 100,
      key: "type",
      render: (v: number) => {
        const label = (Enums as any)?.case_type?.[v] || "-";
        return <Tag>{label}</Tag>;
      },
    },
    {
      title: "优先级",
      dataIndex: "priority",
      width: 75,
      key: "priority",
      render: (v: number) => {
        const label = (Enums as any)?.case_priority?.[v] || "-";
        return <Tag>{label}</Tag>;
      },
    },
    {
      title: "更新时间",
      dataIndex: "updated_at",
      width: 180,
      key: "updated_at",
      render: (v: string) => (v ? formatDateTime(v) : "-"),
    },
  ];

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={() => {
        onClose();
        onClosed && onClosed();
      }}
      position={EModalPosition.CENTER}
      width={EModalWidth.VXL}
    >
      <div className="w-full">
        <div className="flex items-center justify-between gap-4 border-b border-custom-border-200 px-6 py-4">
          <h3 className="text-lg font-medium">
            规划用例
          </h3>
          <Button
            variant="neutral-primary"
            onClick={() => {
              onClose();
              onClosed && onClosed();
            }}
            size="sm"
          >
            关闭
          </Button>
        </div>
        <Row wrap={false} className="h-[80vh] max-h-[80vh] overflow-hidden p-6" gutter={[0, 16]}>
          <Col
            className="relative border-r border-custom-border-200 overflow-y-auto"
            flex="0 0 auto"
            style={{ width: leftWidth, minWidth: 200, maxWidth: 320 }}
          >
            <div
              onMouseDown={onMouseDownResize}
              className="absolute right-0 top-0 h-full w-2"
              style={{ cursor: "col-resize", zIndex: 10 }}
            />
            <Tree
              showLine={false}
              defaultExpandAll
              checkable
              onSelect={onSelect}
              onCheck={onCheck}
              onExpand={onExpand}
              expandedKeys={expandedKeys}
              autoExpandParent={autoExpandParent}
              treeData={treeData}
              selectedKeys={treeData.length > 0 ? [selectedTreeKey] : []}
              checkedKeys={checkedTreeKeys}
              className="py-2"
            />
          </Col>
          <Col flex="auto" className="overflow-y-auto">
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
            {!loading && !error && cases.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <div className="text-custom-text-300">暂无用例</div>
              </div>
            )}
            {!loading && !error && cases.length > 0 && (
              <Table
                dataSource={cases}
                columns={columns}
                rowKey="id"
                bordered={true}
                tableLayout="fixed"
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
                pagination={{
                  current: currentPage,
                  pageSize: pageSize,
                  total: total,
                  showSizeChanger: false,
                  showQuickJumper: true,
                  showTotal: (t, r) => `第 ${r[0]}-${r[1]} 条，共 ${t} 条`,
                }}
                onChange={(p) => {
                  const nextPage = p?.current || 1;
                  fetchCases(nextPage, selectedRepositoryId || undefined, selectedModuleId || undefined);
                }}
              />
            )}
          </Col>
        </Row>
        <div className="sticky bottom-0 w-full bg-custom-background-100 border-t border-custom-border-200 px-6 py-3 flex items-center justify-end gap-3">
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              onClosed && onClosed();
            }}
            size="sm"
          >
            取消
          </Button>
          <Button
            variant="primary"
            disabled={saving || !workspaceSlug || !planId}
            onClick={async () => {
              if (!workspaceSlug || !planId) {
                message.error("缺少必要参数：workspace或计划ID");
                return;
              }
              try {
                if (!selectedNewIds || selectedNewIds.length === 0) {
                  message.warning("请先选择要关联的用例");
                  return;
                }
                setSaving(true);
                await planService.addPlanCases(String(workspaceSlug), {
                  plan_id: String(planId),
                  case_ids: selectedNewIds.map(String),
                });
                message.success("用例关联已更新");
                onClose();
                onClosed && onClosed();
              } catch (e: any) {
                message.error(e?.detail || e?.message || "用例关联失败");
              } finally {
                setSaving(false);
              }
            }}
            size="sm"
          >
            {saving ? "处理中..." : "确定"}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
};

export default PlanCasesModal;
