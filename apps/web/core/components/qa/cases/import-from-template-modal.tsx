"use client";

// 从模板导入：把工作区级模板用例库（is_template=true）中的用例复制进当前项目用例库。
// 复制即快照，不留溯源；后端负责重新生成用例编号、按名同步标签、维护人改为当前用户，
// 并按源用例在模板库中的模块路径在目标库自动匹配/创建同名模块链（无模块 → 落库根）。
//
// 选中模型：唯一事实源是全局选中用例集合 `selected`；左树（库/模块节点）与右表的
// 勾选态全部由集合派生——勾树节点 = 拉取该子树全部用例 id 并入集合，右表可单个取消，
// 树节点据「子树内选中数 vs 子树用例总数」自动呈现全选/半选。

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Empty, Input, Modal, Pagination, Spin, Table, Tooltip, Tree, message } from "antd";
import type { TableProps, TreeProps } from "antd";
import { ChevronDown, FolderInput, Layers, Library, Search, X } from "lucide-react";
import { CaseService } from "@/services/qa/case.service";
import type { ModuleCountResponse } from "@/services/qa/case.service";
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

type CaseScope = { repositoryId: string; moduleId: string | null };

/** 选中用例的归属信息（用于树节点全选/半选统计） */
type TSelectedCaseInfo = { repositoryId: string; moduleId: string | null };

const caseService = new CaseService();
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

// 递归构建左树的模块节点；ancestorKeys/descendantKeys 用于半选归属回溯与反勾子树移除
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

const buildLeftTreeData = (repos: TemplateRepo[], repoCounts: Record<string, Partial<ModuleCountResponse>>): any[] =>
  repos.map((repo) => {
    const repoKey = `repo:${repo.id}`;
    const { nodes, keys } = buildLeftModuleNodes(repo.modules, repo.id, [repoKey]);
    const total = repoCounts[repo.id]?.total;
    const isEmptyRepo = typeof total === "number" && total === 0;
    return {
      title: (
        <span className="flex min-w-0 items-center gap-2">
          <Library size={14} className="shrink-0 text-secondary" />
          <span className="truncate font-medium">{repo.name}</span>
          {isEmptyRepo && <span className="shrink-0 text-xs text-tertiary">（空）</span>}
        </span>
      ),
      key: repoKey,
      kind: "repository",
      repositoryId: repo.id,
      name: repo.name,
      checkable: true,
      // counts 已到且确认库内无用例时禁用勾选（避免“点了没反应”）
      disableCheckbox: isEmptyRepo,
      descendantKeys: keys,
      children: nodes,
    };
  });

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

  // 唯一事实源：全局选中用例集合（caseId -> 归属信息）
  const [selected, setSelected] = useState<Record<string, TSelectedCaseInfo>>({});
  // 每库一次 getModulesCount 的缓存：{ total, [moduleId]: 子树递归计数 }
  const [repoCounts, setRepoCounts] = useState<Record<string, Partial<ModuleCountResponse>>>({});
  // 勾选后 ids 请求在途的节点 key（防重入 + 顶部 loading 提示）
  const [pendingCheckKeys, setPendingCheckKeys] = useState<Set<string>>(new Set());
  // 节点 key -> 该节点子树全部用例 {id, module_id} 的缓存（二次勾选零延迟）
  const nodeIdsCacheRef = useRef<Record<string, { id: string; module_id: string | null }[]>>({});
  // 反勾/清空/重置时 +1，作废在途的 ids 合并（防“反勾后选择复活”）
  const selectionEpochRef = useRef<number>(0);
  // 已发起 counts 请求的库（去重）
  const fetchedCountsRef = useRef<Set<string>>(new Set());

  // 右侧：模板用例
  const [scope, setScope] = useState<CaseScope | null>(null);
  const [cases, setCases] = useState<TemplateCase[]>([]);
  const [casesLoading, setCasesLoading] = useState<boolean>(false);
  const [casesTotal, setCasesTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [caseSearchInput, setCaseSearchInput] = useState<string>("");

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

  // 每库一次拉取用例计数（树节点全选/半选判定的“总数”来源）；失败静默降级为只显示半选
  const fetchRepoCounts = useCallback(
    (repoIds: string[]) => {
      if (!workspaceSlug) return;
      repoIds.forEach((repoId) => {
        if (fetchedCountsRef.current.has(repoId)) return;
        fetchedCountsRef.current.add(repoId);
        caseService
          .getModulesCount(workspaceSlug, repoId)
          .then((counts) => setRepoCounts((prev) => ({ ...prev, [repoId]: counts || {} })))
          .catch(() => {
            // 静默降级：该库节点将永远只显示半选，不阻塞勾选
            fetchedCountsRef.current.delete(repoId);
          });
      });
    },
    [workspaceSlug]
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
        fetchRepoCounts(rows.map((r) => r.id));
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
    [workspaceSlug, selectScope, fetchRepoCounts]
  );

  // 弹窗打开时才发请求；打开即重置全部状态
  useEffect(() => {
    if (!isOpen) return;
    selectionEpochRef.current += 1;
    setRepos([]);
    setRepoSearchInput("");
    setExpandedKeys([]);
    setSelected({});
    setRepoCounts({});
    setPendingCheckKeys(new Set());
    nodeIdsCacheRef.current = {};
    fetchedCountsRef.current = new Set();
    setScope(null);
    setCases([]);
    setCasesTotal(0);
    setPage(1);
    setPageSize(DEFAULT_PAGE_SIZE);
    setCaseSearchInput("");
    if (!workspaceSlug || !targetRepositoryId) return;
    fetchTemplateRepos("", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ---- 左树派生 ----

  const leftTreeData = useMemo(() => buildLeftTreeData(repos, repoCounts), [repos, repoCounts]);

  // moduleId -> { repositoryId, 祖先模块 id 链 }（半选归属回溯用）
  const moduleMeta = useMemo(() => {
    const meta: Record<string, { repositoryId: string; ancestorModuleIds: string[] }> = {};
    const walk = (nodes: any[]) => {
      for (const node of nodes || []) {
        if (node.kind === "module" && node.moduleId) {
          meta[String(node.moduleId)] = {
            repositoryId: String(node.repositoryId),
            ancestorModuleIds: (node.ancestorKeys || [])
              .filter((k: string) => k.startsWith("module:"))
              .map((k: string) => k.slice("module:".length)),
          };
        }
        walk(node.children || []);
      }
    };
    walk(leftTreeData);
    return meta;
  }, [leftTreeData]);

  // 每库/每模块（含子树）的选中数：直属模块与各级祖先各 +1
  const selectionStats = useMemo(() => {
    const byRepo: Record<string, number> = {};
    const byModule: Record<string, number> = {};
    for (const info of Object.values(selected)) {
      byRepo[info.repositoryId] = (byRepo[info.repositoryId] ?? 0) + 1;
      if (info.moduleId) {
        byModule[info.moduleId] = (byModule[info.moduleId] ?? 0) + 1;
        const meta = moduleMeta[info.moduleId];
        (meta?.ancestorModuleIds ?? []).forEach((aid) => {
          byModule[aid] = (byModule[aid] ?? 0) + 1;
        });
      }
    }
    return { byRepo, byModule };
  }, [selected, moduleMeta]);

  // 树勾选态全量派生：选中数 == 子树总数 → 全选；>0 → 半选。
  // counts 未到（undefined）时只允许半选，避免误判全选。checked/halfChecked 不相交。
  const treeCheckedState = useMemo(() => {
    const checked: string[] = [];
    const halfChecked: string[] = [];
    const walk = (nodes: any[]) => {
      for (const node of nodes || []) {
        if (node.kind === "repository") {
          const repoId = String(node.repositoryId);
          const total = repoCounts[repoId]?.total;
          const sel = selectionStats.byRepo[repoId] ?? 0;
          if (typeof total === "number" && total > 0 && sel >= total) checked.push(String(node.key));
          else if (sel > 0) halfChecked.push(String(node.key));
        } else if (node.kind === "module" && node.moduleId) {
          const total = repoCounts[String(node.repositoryId)]?.[String(node.moduleId)] as number | undefined;
          const sel = selectionStats.byModule[String(node.moduleId)] ?? 0;
          if (typeof total === "number" && total > 0 && sel >= total) checked.push(String(node.key));
          else if (sel > 0) halfChecked.push(String(node.key));
        }
        walk(node.children || []);
      }
    };
    walk(leftTreeData);
    return { checked, halfChecked };
  }, [leftTreeData, repoCounts, selectionStats]);

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

  // 拉取某节点子树的全部用例 {id, module_id}（按 node key 缓存）
  const getNodeCaseIds = useCallback(
    async (node: any): Promise<{ id: string; module_id: string | null }[]> => {
      const key = String(node.key);
      if (nodeIdsCacheRef.current[key]) return nodeIdsCacheRef.current[key];
      const queries: { repository_id: string; module_id?: string } = {
        repository_id: String(node.repositoryId),
      };
      if (node.kind === "module") queries.module_id = String(node.moduleId);
      const res = await caseService.getTemplateCaseIds(workspaceSlug, queries);
      const rows = (res?.data ?? []).map((r) => ({
        id: String(r.id),
        module_id: r.module_id ? String(r.module_id) : null,
      }));
      nodeIdsCacheRef.current[key] = rows;
      return rows;
    },
    [workspaceSlug]
  );

  // 树勾选（checkStrictly，树全受控，忽略第一参）：
  // 勾（含点半选节点，rc-tree 语义为 checked=true）= 拉子树全部用例并入集合；
  // 反勾 = 纯同步按归属移除，并作废在途合并。
  const onTreeCheck: TreeProps["onCheck"] = (_keys, info: any) => {
    const node = info?.node;
    if (!node) return;
    const nodeKey = String(node.key);

    if (info.checked) {
      if (pendingCheckKeys.has(nodeKey)) return;
      const epoch = selectionEpochRef.current;
      setPendingCheckKeys((prev) => new Set(prev).add(nodeKey));
      if (node.kind === "repository") {
        setExpandedKeys((prev) => (prev.includes(node.key) ? prev : [...prev, node.key]));
      }
      void getNodeCaseIds(node)
        .then((rows) => {
          if (selectionEpochRef.current !== epoch) return; // 在途期间发生过反勾/清空，丢弃
          setSelected((prev) => {
            const next = { ...prev };
            rows.forEach((row) => {
              next[row.id] = { repositoryId: String(node.repositoryId), moduleId: row.module_id };
            });
            return next;
          });
        })
        .catch((e) => message.error(extractErrMsg(e, "获取勾选范围失败")))
        .finally(() =>
          setPendingCheckKeys((prev) => {
            const next = new Set(prev);
            next.delete(nodeKey);
            return next;
          })
        );
      return;
    }

    // 反勾：作废在途合并后按归属同步移除
    selectionEpochRef.current += 1;
    if (node.kind === "repository") {
      const repoId = String(node.repositoryId);
      setSelected((prev) => {
        const next: Record<string, TSelectedCaseInfo> = {};
        for (const [id, infoItem] of Object.entries(prev)) {
          if (infoItem.repositoryId !== repoId) next[id] = infoItem;
        }
        return next;
      });
      return;
    }
    if (node.kind === "module" && node.moduleId) {
      const subtreeModuleIds = new Set<string>([
        String(node.moduleId),
        ...((node.descendantKeys || []) as string[]).map((k) => k.slice("module:".length)),
      ]);
      setSelected((prev) => {
        const next: Record<string, TSelectedCaseInfo> = {};
        for (const [id, infoItem] of Object.entries(prev)) {
          if (!(infoItem.moduleId && subtreeModuleIds.has(infoItem.moduleId))) next[id] = infoItem;
        }
        return next;
      });
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

  // 本页选中行 = 本页 ∩ 全局选中集合（翻页/切 scope 后由此自动恢复）
  const pageSelectedKeys = useMemo(
    () => cases.filter((c) => selected[String(c.id)]).map((c) => String(c.id)),
    [cases, selected]
  );

  // ---- 提交 ----

  const selectedCount = useMemo(() => Object.keys(selected).length, [selected]);

  const handleClearSelection = () => {
    selectionEpochRef.current += 1;
    setSelected({});
  };

  const handleSubmit = async () => {
    if (submitting) return;
    const casesId = Object.keys(selected);
    if (casesId.length === 0) {
      message.warning("请先选择要导入的用例");
      return;
    }
    setSubmitting(true);
    try {
      await caseService.importTemplateCases(workspaceSlug, {
        cases_id: casesId,
        repository_id: targetRepositoryId,
      });
      message.success("导入成功");
      onSuccess?.();
      handleClose();
    } catch (e) {
      // 失败保留弹窗（选择集未动），用户可修正后重试
      message.error(extractErrMsg(e, "导入失败"));
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
              selectedRowKeys: pageSelectedKeys,
              onChange: (keys) => {
                // 全受控：只 diff 本页（不 preserve 时 antd 的 keys 仅含当前 dataSource 内选中项），
                // 跨页/跨 scope 的选择由全局集合持有
                const keySet = new Set((keys as React.Key[]).map(String));
                setSelected((prev) => {
                  const next = { ...prev };
                  cases.forEach((c) => {
                    const id = String(c.id);
                    if (keySet.has(id)) {
                      if (!next[id]) {
                        next[id] = {
                          repositoryId: scope.repositoryId,
                          moduleId: c.module?.id ? String(c.module.id) : null,
                        };
                      }
                    } else if (next[id]) {
                      delete next[id];
                    }
                  });
                  return next;
                });
              },
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
              <p className="text-xs text-tertiary">
                复制模板用例到当前用例库；按模板中的模块归属自动放入同名模块，无则自动创建
              </p>
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
              <span className="text-xs text-tertiary">
                {pendingCheckKeys.size > 0 ? "正在载入勾选范围…" : "勾选库或模块 = 全选其下用例"}
              </span>
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
                    // 树勾选态由选中集合全量派生（checked/halfChecked 受控），
                    // checkStrictly 下 rc-tree 不做父子 conduction，对象形态 checkedKeys 原样生效
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
                    onCheck={onTreeCheck}
                    selectedKeys={selectedTreeKeys}
                    checkedKeys={{ checked: treeCheckedState.checked, halfChecked: treeCheckedState.halfChecked }}
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
              {selectedCount > 0 && (
                <span className="shrink-0 text-sm text-secondary">
                  已选 <span className="font-medium text-accent-primary">{selectedCount}</span> 条用例
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
            <span className="truncate text-sm text-secondary">
              已选 <span className="font-medium text-accent-primary">{selectedCount}</span> 条用例
            </span>
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={handleClearSelection}
                className="shrink-0 rounded-md px-2 py-1 text-sm text-link-primary transition-colors hover:bg-layer-1-hover"
              >
                清空
              </button>
            )}
            <span className="truncate text-xs text-tertiary">
              导入后按模板中的模块归属自动放入同名模块，无则自动创建
            </span>
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
              disabled={submitting || selectedCount === 0}
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
