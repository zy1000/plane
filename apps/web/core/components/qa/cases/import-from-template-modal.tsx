"use client";

// 从模板导入：把工作区级模板用例库（is_template=true）中的用例/模块复制进当前项目用例库。
// 复制即快照，不留溯源；后端负责重新生成用例编号、按名同步标签、维护人改为当前用户。

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Empty, Input, Modal, Pagination, Spin, Table, Tooltip, Tree, TreeSelect, message } from "antd";
import type { TableProps, TreeProps } from "antd";
import { ChevronDown, FolderInput, Layers, Library, Search, X } from "lucide-react";
import { CaseService } from "@/services/qa/case.service";
import { CaseModuleService } from "@/services/qa/case-module.service";
import { RepositoryService } from "@/services/qa/repository.service";
import {
  CASE_PICKER_MODAL_CLASS,
  CasePickerModalStyles,
  CasePriorityPill,
  CaseTypePill,
} from "../shared/case-picker-modal-styles";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  targetRepositoryId: string; // 当前项目用例库
  onSuccess?: () => void; // 导入成功后由调用方刷新模块树与用例列表
};

type TemplateRepo = { id: string; name: string; modules: any[] };

type TemplateCase = {
  id: string;
  name: string;
  module?: { id?: string; name?: string } | null;
  type?: number;
  priority?: number;
};

// 勾选的「整模块导入」项
type CheckedModule = { key: string; moduleId: string; name: string };

type CaseScope = { repositoryId: string; moduleId: string | null };

const caseService = new CaseService();
const caseModuleService = new CaseModuleService();
const repositoryService = new RepositoryService();

const DEFAULT_PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;
// 模板库通常数量有限，左侧一次性拉取（上限 100），不做分页
const REPO_PAGE_SIZE = 100;

// ---- 纯函数区（与组件状态无关的可复用逻辑） --------------------------------

const extractErrMsg = (e: unknown, fallback: string): string => {
  const anyErr = e as any;
  const msg = anyErr?.error || anyErr?.detail || anyErr?.message;
  return typeof msg === "string" && msg ? msg : fallback;
};

const normalizeListResponse = (res: any): any[] => (Array.isArray(res) ? res : res?.data || res?.results || []);

// 递归构建左树的模块节点；同时收集每个节点的祖先/后代 key，用于整模块勾选去重
const buildLeftModuleNodes = (
  list: any[],
  repositoryId: string,
  ancestorKeys: string[]
): { nodes: any[]; keys: string[] } => {
  const nodes: any[] = [];
  const keys: string[] = [];
  (Array.isArray(list) ? list : []).forEach((mod: any) => {
    const moduleId = String(mod?.id ?? "");
    if (!moduleId) return;
    const key = `module:${moduleId}`;
    const name = String(mod?.name ?? "-");
    const child = buildLeftModuleNodes(mod?.children || [], repositoryId, [...ancestorKeys, key]);
    nodes.push({
      title: (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{name}</span>
        </span>
      ),
      key,
      kind: "module",
      moduleId,
      name,
      repositoryId,
      ancestorKeys,
      descendantKeys: child.keys,
      checkable: true,
      children: child.nodes,
    });
    keys.push(key, ...child.keys);
  });
  return { nodes, keys };
};

const buildLeftTreeData = (repos: TemplateRepo[]): any[] =>
  repos.map((repo) => {
    const { nodes } = buildLeftModuleNodes(repo.modules, repo.id, []);
    return {
      title: (
        <span className="flex min-w-0 items-center gap-2">
          <Library size={14} className="shrink-0 text-secondary" />
          <span className="truncate font-medium">{repo.name}</span>
          {nodes.length === 0 && <span className="shrink-0 text-xs text-tertiary">（空）</span>}
        </span>
      ),
      key: `repo:${repo.id}`,
      kind: "repository",
      repositoryId: repo.id,
      name: repo.name,
      checkable: false,
      children: nodes,
    };
  });

// 目标库模块树 -> TreeSelect 数据（title 用纯字符串，保证可搜索）
const buildTargetTreeData = (modules: any[]): any[] =>
  (Array.isArray(modules) ? modules : []).map((mod: any) => ({
    title: String(mod?.name ?? "-"),
    value: String(mod?.id ?? ""),
    children: buildTargetTreeData(mod?.children || []),
  }));

// 防抖调用器：组件卸载时自动清理定时器
const useDebouncedInvoke = () => {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  return useCallback((fn: () => void, delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, delay);
  }, []);
};

// ---- 组件 ------------------------------------------------------------------

export const ImportFromTemplateModal: React.FC<Props> = ({
  isOpen,
  handleClose,
  workspaceSlug,
  targetRepositoryId,
  onSuccess,
}) => {
  // 左侧：模板库 + 模块树
  const [repos, setRepos] = useState<TemplateRepo[]>([]);
  const [repoLoading, setRepoLoading] = useState<boolean>(false);
  const [repoSearchInput, setRepoSearchInput] = useState<string>("");
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [autoExpandParent, setAutoExpandParent] = useState<boolean>(true);
  const [checkedModules, setCheckedModules] = useState<CheckedModule[]>([]);

  // 右侧：模板用例
  const [scope, setScope] = useState<CaseScope | null>(null);
  const [cases, setCases] = useState<TemplateCase[]>([]);
  const [casesLoading, setCasesLoading] = useState<boolean>(false);
  const [casesTotal, setCasesTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [caseSearchInput, setCaseSearchInput] = useState<string>("");
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>([]);

  // 底部：目标位置
  const [targetModules, setTargetModules] = useState<any[]>([]);
  const [targetLoading, setTargetLoading] = useState<boolean>(false);
  const [targetModuleId, setTargetModuleId] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState<boolean>(false);

  const debounceRepoSearch = useDebouncedInvoke();
  const debounceCaseSearch = useDebouncedInvoke();

  // ---- 数据拉取 ----

  const fetchCases = useCallback(
    async (opts: { page: number; pageSize: number; repositoryId: string; moduleId: string | null; keyword: string }) => {
      if (!workspaceSlug) return;
      setCasesLoading(true);
      try {
        const params: any = {
          repository_id: opts.repositoryId,
          page: opts.page,
          page_size: opts.pageSize,
        };
        // module_id 过滤在后端已包含子模块递归
        if (opts.moduleId) params.module_id = opts.moduleId;
        const keyword = opts.keyword.trim();
        if (keyword) params.name__icontains = keyword;
        const res = await caseService.getTemplateCases(workspaceSlug, params);
        setCases(res?.data || []);
        setCasesTotal(Number(res?.count || 0));
        setPage(opts.page);
        setPageSize(opts.pageSize);
      } catch (e) {
        console.error("获取模板用例失败:", e);
        message.error(extractErrMsg(e, "获取模板用例失败"));
        setCases([]);
        setCasesTotal(0);
      } finally {
        setCasesLoading(false);
      }
    },
    [workspaceSlug]
  );

  const selectScope = useCallback(
    (repositoryId: string, moduleId: string | null) => {
      setScope({ repositoryId, moduleId });
      setCaseSearchInput("");
      fetchCases({ page: 1, pageSize: DEFAULT_PAGE_SIZE, repositoryId, moduleId, keyword: "" });
    },
    [fetchCases]
  );

  // 拉取模板库列表，并用 repository_id__in 一次性批量拉取所有模板库的模块树（防 N+1）
  const fetchTemplateRepos = useCallback(
    async (search: string, autoSelectFirst: boolean) => {
      if (!workspaceSlug) return;
      setRepoLoading(true);
      try {
        const params: any = {
          // 后端默认排除模板库，必须显式传 is_template
          is_template: true,
          workspace__slug: workspaceSlug,
          page: 1,
          page_size: REPO_PAGE_SIZE,
        };
        if (search) params.search = search;
        const res = await repositoryService.getRepositories(workspaceSlug, params);
        const list = normalizeListResponse(res);

        const repoIds = list.map((r: any) => String(r?.id ?? "")).filter(Boolean);
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

        const rows: TemplateRepo[] = list.map((repo: any) => ({
          id: String(repo?.id),
          name: String(repo?.name || "-"),
          modules: modulesByRepo[String(repo?.id)] || [],
        }));
        setRepos(rows);
        // 搜索时展开全部命中库，便于直接看到模块；默认保持折叠
        setExpandedKeys(search ? rows.map((r) => `repo:${r.id}`) : []);
        setAutoExpandParent(true);
        if (autoSelectFirst && rows.length > 0) selectScope(rows[0].id, null);
      } catch (e) {
        console.error("获取模板库失败:", e);
        message.error(extractErrMsg(e, "获取模板库失败"));
      } finally {
        setRepoLoading(false);
      }
    },
    [workspaceSlug, selectScope]
  );

  const fetchTargetModules = useCallback(async () => {
    if (!workspaceSlug || !targetRepositoryId) return;
    setTargetLoading(true);
    try {
      const list = await caseModuleService.getModulesByRepositories(workspaceSlug, [targetRepositoryId]);
      setTargetModules(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error("获取目标用例库模块失败:", e);
      message.error(extractErrMsg(e, "获取目标用例库模块失败"));
      setTargetModules([]);
    } finally {
      setTargetLoading(false);
    }
  }, [workspaceSlug, targetRepositoryId]);

  // 弹窗打开时才发请求；打开即重置全部状态
  useEffect(() => {
    if (!isOpen) return;
    setRepos([]);
    setRepoSearchInput("");
    setExpandedKeys([]);
    setCheckedModules([]);
    setScope(null);
    setCases([]);
    setCasesTotal(0);
    setPage(1);
    setPageSize(DEFAULT_PAGE_SIZE);
    setCaseSearchInput("");
    setSelectedCaseIds([]);
    setTargetModules([]);
    setTargetModuleId(null);
    if (!workspaceSlug || !targetRepositoryId) return;
    fetchTemplateRepos("", true);
    fetchTargetModules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ---- 左树交互 ----

  const leftTreeData = useMemo(() => buildLeftTreeData(repos), [repos]);

  const selectedTreeKeys = useMemo(() => {
    if (!scope) return [];
    return [scope.moduleId ? `module:${scope.moduleId}` : `repo:${scope.repositoryId}`];
  }, [scope]);

  const onExpand: TreeProps["onExpand"] = (keys) => {
    setExpandedKeys(keys);
    setAutoExpandParent(false);
  };

  const onTreeSelect: TreeProps["onSelect"] = (_keys, info: any) => {
    if (!info?.selected) return;
    const node = info?.node;
    if (!node) return;
    if (node.kind === "repository" && node.repositoryId) {
      selectScope(String(node.repositoryId), null);
      return;
    }
    if (node.kind === "module" && node.moduleId) {
      selectScope(String(node.repositoryId), String(node.moduleId));
    }
  };

  // 整模块勾选（checkStrictly）：勾父模块自动覆盖子模块，勾选彼此独立、提交时逐个 copyModule
  const onModuleCheck: TreeProps["onCheck"] = (_keys, info: any) => {
    const node = info?.node;
    if (!node || node.kind !== "module" || !node.moduleId) return;
    const key = String(node.key);
    if (info.checked) {
      const ancestorKeys: string[] = node.ancestorKeys || [];
      if (checkedModules.some((m) => ancestorKeys.includes(m.key))) {
        message.info("已勾选其上级模块，无需重复勾选");
        return;
      }
      const descendantKeys: string[] = node.descendantKeys || [];
      setCheckedModules((prev) => [
        ...prev.filter((m) => !descendantKeys.includes(m.key)),
        { key, moduleId: String(node.moduleId), name: String(node.name || "-") },
      ]);
    } else {
      setCheckedModules((prev) => prev.filter((m) => m.key !== key));
    }
  };

  const handleRepoSearchChange = (value: string) => {
    setRepoSearchInput(value);
    debounceRepoSearch(() => fetchTemplateRepos(value.trim(), false), SEARCH_DEBOUNCE_MS);
  };

  // ---- 右表交互 ----

  const handleCaseSearchChange = (value: string) => {
    setCaseSearchInput(value);
    if (!scope) return;
    const { repositoryId, moduleId } = scope;
    debounceCaseSearch(
      () => fetchCases({ page: 1, pageSize, repositoryId, moduleId, keyword: value }),
      SEARCH_DEBOUNCE_MS
    );
  };

  const handlePaginationChange = (nextPage: number, nextSize?: number) => {
    if (!scope) return;
    const size = nextSize || pageSize;
    fetchCases({
      page: size !== pageSize ? 1 : nextPage,
      pageSize: size,
      repositoryId: scope.repositoryId,
      moduleId: scope.moduleId,
      keyword: caseSearchInput,
    });
  };

  const columns: TableProps<TemplateCase>["columns"] = [
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
      title: "模块",
      dataIndex: "module",
      key: "module",
      width: 120,
      ellipsis: true,
      render: (v: any) => <span className="text-secondary">{v && v.name ? v.name : "-"}</span>,
    },
    {
      title: "类型",
      dataIndex: "type",
      key: "type",
      width: 100,
      render: (v: number) => <CaseTypePill value={v} />,
    },
    {
      title: "优先级",
      dataIndex: "priority",
      key: "priority",
      width: 90,
      render: (v: number) => <CasePriorityPill value={v} />,
    },
  ];

  // ---- 底部与提交 ----

  const targetTreeData = useMemo(() => buildTargetTreeData(targetModules), [targetModules]);

  const selectedCaseCount = selectedCaseIds.length;
  const checkedModuleCount = checkedModules.length;
  const nothingSelected = selectedCaseCount === 0 && checkedModuleCount === 0;

  const handleClearSelection = () => {
    setSelectedCaseIds([]);
    setCheckedModules([]);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    if (nothingSelected) {
      message.warning("请先选择要导入的用例或模块");
      return;
    }
    // copyCase 要求目标 module_id 必填；整模块导入允许留空（= 复制到目标库根级）
    if (selectedCaseCount > 0 && !targetModuleId) {
      message.warning("逐条导入用例时必须选择目标模块");
      return;
    }

    setSubmitting(true);
    const errors: string[] = [];
    let successCount = 0;
    try {
      // 散装用例：一次 copyCase 调用
      if (selectedCaseCount > 0 && targetModuleId) {
        try {
          await caseService.copyCase(workspaceSlug, selectedCaseIds, targetModuleId);
          successCount += 1;
        } catch (e) {
          errors.push(extractErrMsg(e, `${selectedCaseCount} 条用例导入失败`));
        }
      }
      // 整模块：逐个 copyModule（串行），失败收集错误继续
      for (const mod of checkedModules) {
        try {
          await caseModuleService.copyModule(
            workspaceSlug,
            targetModuleId
              ? { module_id: mod.moduleId, target_module_id: targetModuleId }
              : { module_id: mod.moduleId, repository_id: targetRepositoryId }
          );
          successCount += 1;
        } catch (e) {
          errors.push(`模块「${mod.name}」导入失败：${extractErrMsg(e, "未知错误")}`);
        }
      }

      if (errors.length === 0) {
        message.success("导入成功");
        onSuccess?.();
        handleClose();
        return;
      }
      // 部分成功也让调用方刷新，弹窗保留以便重试失败项
      if (successCount > 0) onSuccess?.();
      message.error(`部分导入失败：${errors.join("；")}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- 渲染 ----

  const renderCasesPanel = () => {
    if (!scope) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-layer-1 text-tertiary">
            <Layers className="size-6" />
          </span>
          <div className="text-sm text-secondary">请先在左侧选择模板库或模块</div>
        </div>
      );
    }
    if (cases.length === 0) {
      return (
        <div className="flex h-full items-center justify-center py-12">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span className="text-xs text-tertiary">
                {caseSearchInput.trim() ? "未找到匹配的模板用例" : "暂无模板用例"}
              </span>
            }
          />
        </div>
      );
    }
    return (
      <>
        <div className="table-scroll min-h-0 flex-1">
          <Table<TemplateCase>
            dataSource={cases}
            columns={columns}
            rowKey="id"
            tableLayout="fixed"
            pagination={false}
            rowSelection={{
              selectedRowKeys: selectedCaseIds,
              onChange: (keys) => setSelectedCaseIds(keys as string[]),
              preserveSelectedRowKeys: true,
            }}
          />
        </div>
        <div className="modal-pagination-bar flex-shrink-0 border-t border-subtle bg-surface-1 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-secondary">
              {casesTotal > 0
                ? `第 ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, casesTotal)} 条，共 ${casesTotal} 条`
                : ""}
            </span>
            <Pagination
              simple
              size="small"
              current={page}
              pageSize={pageSize}
              total={casesTotal}
              showSizeChanger
              pageSizeOptions={["10", "20", "50", "100"]}
              onChange={handlePaginationChange}
              onShowSizeChange={handlePaginationChange}
            />
          </div>
        </div>
      </>
    );
  };

  return (
    <Modal
      open={isOpen}
      onCancel={handleClose}
      footer={null}
      closable={false}
      title={null}
      width={1000}
      centered
      styles={{
        content: { padding: 0, borderRadius: 16, overflow: "hidden" },
        body: { padding: 0 },
        mask: { background: "rgba(2,6,23,0.5)", backdropFilter: "blur(3px)" },
      }}
    >
      <div className={`${CASE_PICKER_MODAL_CLASS} flex w-full flex-col bg-surface-1 text-sm text-primary`}>
        <CasePickerModalStyles />

        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-subtle px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-primary text-on-color shadow-sm">
              <FolderInput size={16} />
            </div>
            <div>
              <h3 className="text-base font-bold text-primary">从模板导入</h3>
              <p className="text-xs text-tertiary">从模板用例库复制用例到当前用例库，复制后与模板不再关联</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="关闭"
            className="flex size-8 items-center justify-center rounded-md text-tertiary transition-colors hover:bg-layer-1-hover hover:text-secondary"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex h-[62vh] overflow-hidden">
          {/* Left: 模板库 + 模块树 */}
          <div className="flex w-[300px] shrink-0 flex-col border-r border-subtle bg-layer-1/40">
            <div className="flex items-center justify-between px-4 pb-2 pt-4">
              <span className="text-sm text-secondary">模板用例库</span>
              <span className="text-xs text-tertiary">勾选模块 = 整模块导入</span>
            </div>
            <div className="px-3 pb-2">
              <Input
                placeholder="搜索模板库名称"
                allowClear
                prefix={<Search className="size-4" />}
                value={repoSearchInput}
                onChange={(e) => handleRepoSearchChange(e.target.value)}
              />
            </div>
            <Spin spinning={repoLoading}>
              <div className="tree-scroll h-[calc(62vh-88px)] min-h-0 px-2 pb-3">
                {repos.length === 0 ? (
                  !repoLoading && (
                    <div className="flex h-full items-center justify-center">
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={
                          <span className="text-xs text-tertiary">
                            {repoSearchInput.trim() ? "未找到匹配的模板库" : "暂无模板用例库"}
                          </span>
                        }
                      />
                    </div>
                  )
                ) : (
                  <Tree
                    blockNode
                    checkable
                    checkStrictly
                    expandAction="click"
                    switcherIcon={({ expanded, isLeaf }: any) =>
                      isLeaf ? null : (
                        <ChevronDown
                          className="size-3.5 text-tertiary transition-transform"
                          style={{ transform: expanded ? "rotate(0deg)" : "rotate(-90deg)" }}
                        />
                      )
                    }
                    treeData={leftTreeData}
                    expandedKeys={expandedKeys}
                    autoExpandParent={autoExpandParent}
                    onExpand={onExpand}
                    onSelect={onTreeSelect}
                    onCheck={onModuleCheck}
                    selectedKeys={selectedTreeKeys}
                    checkedKeys={{ checked: checkedModules.map((m) => m.key), halfChecked: [] }}
                    className="custom-tree-indent"
                  />
                )}
              </div>
            </Spin>
          </div>

          {/* Right: 模板用例列表 */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex flex-nowrap items-center justify-between gap-3 border-b border-subtle px-4 py-3">
              <Input
                placeholder="按用例名称搜索"
                allowClear
                prefix={<Search className="size-4" />}
                value={caseSearchInput}
                onChange={(e) => handleCaseSearchChange(e.target.value)}
                className="w-56 shrink-0"
                disabled={!scope}
              />
              {selectedCaseCount > 0 && (
                <span className="shrink-0 text-sm text-secondary">
                  已选 <span className="font-medium text-accent-primary">{selectedCaseCount}</span> 条用例
                </span>
              )}
            </div>
            {casesLoading ? (
              <div className="flex flex-1 items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3 text-tertiary">
                  <span className="size-6 animate-spin rounded-full border-2 border-subtle border-t-accent-primary" />
                  <span className="text-sm text-secondary">加载中...</span>
                </div>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">{renderCasesPanel()}</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 border-t border-subtle bg-surface-1 px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 text-sm text-secondary">
              目标位置
              {selectedCaseCount > 0 && <span className="text-danger-primary">*</span>}
            </span>
            <TreeSelect
              allowClear
              showSearch
              treeDefaultExpandAll
              treeNodeFilterProp="title"
              placeholder="选择目标模块（留空 = 库根，仅整模块可导入到库根）"
              treeData={targetTreeData}
              value={targetModuleId ?? undefined}
              onChange={(v) => setTargetModuleId(v ? String(v) : null)}
              notFoundContent={
                <span className="text-xs text-tertiary">{targetLoading ? "加载中..." : "目标用例库暂无模块"}</span>
              }
              style={{ width: 320 }}
              dropdownStyle={{ maxHeight: 320, overflow: "auto" }}
            />
            <span className="truncate text-sm text-secondary">
              已选 <span className="font-medium text-accent-primary">{selectedCaseCount}</span> 条用例
              {checkedModuleCount > 0 && (
                <>
                  ，<span className="font-medium text-accent-primary">{checkedModuleCount}</span> 个整模块
                </>
              )}
            </span>
            {!nothingSelected && (
              <button
                type="button"
                onClick={handleClearSelection}
                className="shrink-0 rounded-md px-2 py-1 text-sm text-link-primary transition-colors hover:bg-layer-1-hover"
              >
                清空
              </button>
            )}
          </div>
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
              onClick={handleSubmit}
              disabled={submitting || nothingSelected}
              className="flex items-center gap-1.5 rounded-lg bg-accent-primary px-3.5 py-1.5 text-sm font-medium text-on-color transition-colors hover:bg-accent-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FolderInput size={14} />
              {submitting ? "导入中..." : "开始导入"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ImportFromTemplateModal;
