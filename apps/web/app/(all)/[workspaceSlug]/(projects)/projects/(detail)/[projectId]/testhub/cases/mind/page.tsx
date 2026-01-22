"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHead } from "@/components/core/page-title";
import { Breadcrumbs } from "@plane/ui";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { RepositorySelect } from "../../repository-select";
import { UnorderedListOutlined, ShareAltOutlined } from "@ant-design/icons";
import { Col, Input, Modal, Row, Tree, message } from "antd";
import type { TreeProps } from "antd";
import { CaseService } from "@/services/qa/case.service";
import { CaseModuleService } from "@/services/qa/case-module.service";
import { CaseMindmap } from "@/components/qa/cases/case-mindmap";
import type { MindElixirData, NodeObj, Operation, Topic } from "mind-elixir";
import { useUser } from "@/hooks/store/user";

export default function TestCasesMindPage() {
  const { workspaceSlug, projectId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const repositoryIdFromUrl = searchParams.get("repositoryId");
  const moduleIdsFromUrl = (() => {
    const raw = searchParams.getAll("moduleId");
    const fallback = searchParams.get("moduleId");
    const base = raw.length ? raw : fallback ? [fallback] : [];
    const parts = base
      .flatMap((v) => String(v || "").split(","))
      .map((v) => v.trim())
      .filter(Boolean)
      .filter((v) => v !== "all");
    return Array.from(new Set(parts));
  })();
  const moduleIdsKeyFromUrl = moduleIdsFromUrl.length ? moduleIdsFromUrl.join(",") : "all";
  const [repositoryId, setRepositoryId] = useState<string | null>(repositoryIdFromUrl);
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>(moduleIdsFromUrl);
  const [repositoryName, setRepositoryName] = useState<string>("");
  const [treeData, setTreeData] = useState<any[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>(["all"]);
  const [autoExpandParent, setAutoExpandParent] = useState<boolean>(true);
  const [leftWidth, setLeftWidth] = useState<number>(250);
  const [loadingMind, setLoadingMind] = useState<boolean>(false);
  const [mindData, setMindData] = useState<MindElixirData | null>(null);
  const caseMapRef = useRef<Record<string, any>>({});
  const [renameOpen, setRenameOpen] = useState(false);
  const [renamingModuleId, setRenamingModuleId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");

  const caseService = useMemo(() => new CaseService(), []);
  const caseModuleService = useMemo(() => new CaseModuleService(), []);
  const { data: currentUser } = useUser();
  const currentUserId = currentUser?.id ? String(currentUser.id) : null;

  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedId = sessionStorage.getItem("selectedRepositoryId");
      const storedName = sessionStorage.getItem("selectedRepositoryName");
      if (!repositoryIdFromUrl && storedId) setRepositoryId(storedId);
      if (storedName) setRepositoryName(storedName);
    }
  }, [repositoryIdFromUrl]);

  useEffect(() => {
    if (repositoryIdFromUrl) setRepositoryId(repositoryIdFromUrl);
  }, [repositoryIdFromUrl]);

  useEffect(() => {
    setSelectedModuleIds(moduleIdsFromUrl);
  }, [moduleIdsKeyFromUrl]);

  const onExpand: TreeProps["onExpand"] = (keys) => {
    setExpandedKeys(keys as string[]);
    setAutoExpandParent(false);
  };

  const buildTreeNodes = (modules: any[]): any[] => {
    return (modules || []).map((m) => ({
      key: String(m.id),
      title: (
        <div className="flex items-center justify-between gap-2 min-w-0">
          <span className="truncate">{String(m.name ?? "")}</span>
          <span className="text-xs text-custom-text-400 flex-shrink-0">{Number(m.total ?? 0)}</span>
        </div>
      ),
      children: buildTreeNodes(m.children || []),
    }));
  };

  const fetchModules = async () => {
    if (!workspaceSlug || !repositoryId) return;
    try {
      const moduleData = await caseService.getModules(String(workspaceSlug), String(repositoryId));
      const countsResponse = await caseService.getModulesCount(String(workspaceSlug), String(repositoryId));

      const total = Number((countsResponse as any)?.total ?? 0);
      const countsMap: Record<string, number> = {};
      if (countsResponse && typeof countsResponse === "object") {
        for (const [k, v] of Object.entries(countsResponse as any)) {
          if (k === "total") continue;
          countsMap[String(k)] = Number(v ?? 0);
        }
      }

      const applyCounts = (mods: any[]): any[] =>
        (mods || []).map((m) => ({
          ...m,
          total: countsMap[String(m.id)] ?? 0,
          children: applyCounts(m.children || []),
        }));

      const withCounts = applyCounts(Array.isArray(moduleData) ? moduleData : []);
      const nodes = buildTreeNodes(withCounts);
      setTreeData([
        {
          key: "all",
          disableCheckbox: true,
          title: (
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="truncate">全部用例</span>
              <span className="text-xs text-custom-text-400 flex-shrink-0">{total}</span>
            </div>
          ),
          children: nodes,
        },
      ]);
      if (!expandedKeys?.length) setExpandedKeys(["all"]);
    } catch {
      setTreeData([
        {
          key: "all",
          disableCheckbox: true,
          title: "全部用例",
          children: [],
        },
      ]);
    }
  };

  const stripHtml = (html?: string | null) => {
    if (!html) return "";
    return String(html)
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/gi, " ")
      .trim();
  };

  const placeholderIfEmpty = (text: string) => (text && text.trim() ? text : "（空）");

  const rootToMindData = (root: any): { data: MindElixirData; caseMap: Record<string, any> } => {
    const nextCaseMap: Record<string, any> = {};

    const buildModule = (m: any): NodeObj => {
      const moduleNode: NodeObj = {
        id: `module:${String(m.id)}`,
        topic: String(m.name ?? ""),
        tags: ["模块"],
        children: [],
      };

      const childrenModules = Array.isArray(m.children) ? m.children : [];
      const cases = Array.isArray(m.cases) ? m.cases : [];

      const childNodes: NodeObj[] = [];
      for (const cm of childrenModules) childNodes.push(buildModule(cm));
      for (const c of cases) childNodes.push(buildCase(c));
      if (childNodes.length) moduleNode.children = childNodes;
      return moduleNode;
    };

    const buildCase = (c: any): NodeObj => {
      const caseId = String(c.id);
      nextCaseMap[caseId] = c;
      const topic = `${c.code ? String(c.code) + " " : ""}${String(c.name ?? "")}`.trim();
      const mode = typeof c.mode === "number" ? c.mode : 0;

      const caseNode: NodeObj & { mode?: number } = {
        id: `case:${caseId}`,
        topic: topic || "（未命名用例）",
        tags: ["用例"],
        children: [],
        mode,
      };

      const preconditionRaw = stripHtml(c.precondition);
      const remarkRaw = stripHtml(c.remark);

      const children: NodeObj[] = [];
      if (preconditionRaw) {
        children.push({
          id: `caseprop:${caseId}:precondition`,
          topic: placeholderIfEmpty(preconditionRaw),
          tags: ["前置条件"],
        });
      }

      if (mode === 1) {
        const textDescRaw = stripHtml(c.text_description);
        if (textDescRaw) {
          const textRes = placeholderIfEmpty(stripHtml(c.text_result));
          children.push({
            id: `caseprop:${caseId}:text_description`,
            topic: placeholderIfEmpty(textDescRaw),
            tags: ["文本描述"],
            children: [{ id: `caseprop:${caseId}:text_result`, topic: textRes, tags: ["预期结果"] }],
          });
        }
      } else {
        const stepsArr = Array.isArray(c.steps) ? c.steps : [];
        if (stepsArr.length > 0) {
          const stepChildren: NodeObj[] = stepsArr.map((s: any, idx: number) => {
            const desc = placeholderIfEmpty(String(s?.description ?? ""));
            const res = placeholderIfEmpty(String(s?.result ?? ""));
            return {
              id: `stepdesc:${caseId}:${idx}`,
              topic: desc,
              tags: ["步骤描述"],
              children: [{ id: `stepres:${caseId}:${idx}`, topic: res, tags: ["预期结果"] }],
            };
          });
          children.push(...stepChildren);
        }
      }

      if (remarkRaw) {
        children.push({ id: `caseprop:${caseId}:remark`, topic: placeholderIfEmpty(remarkRaw), tags: ["备注"] });
      }
      caseNode.children = children;
      return caseNode;
    };

    const nodeData: NodeObj =
      root?.id === "all"
        ? {
            id: "me-root",
            topic: String(root?.name ?? "全部用例"),
            children: [
              ...(Array.isArray(root?.children) ? root.children.map((m: any) => buildModule(m)) : []),
              ...(Array.isArray(root?.cases) ? root.cases.map((c: any) => buildCase(c)) : []),
            ],
          }
        : buildModule(root);

    return { data: { nodeData } as any, caseMap: nextCaseMap };
  };

  const escapeHtml = (input: string) =>
    input
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const plainToHtml = (text: string) => {
    const normalized = (text || "").trim();
    if (!normalized || normalized === "（空）") return "<p></p>";
    return `<p>${escapeHtml(normalized).replace(/\n/g, "<br/>")}</p>`;
  };

  const fetchMind = async (silent = false) => {
    if (!workspaceSlug || !repositoryId) return;
    if (!silent) setLoadingMind(true);
    try {
      const res = await caseService.getCaseMindmap(String(workspaceSlug), {
        repository_id: String(repositoryId),
        ...(selectedModuleIds.length ? { module_id: selectedModuleIds } : { module_id: "all" }),
      });
      const built = rootToMindData((res as any)?.root);
      caseMapRef.current = built.caseMap;
      setMindData(built.data);
    } catch {
      setMindData(null);
    } finally {
      if (!silent) setLoadingMind(false);
    }
  };

  useEffect(() => {
    if (!repositoryId) return;
    try {
      if (repositoryIdFromUrl) sessionStorage.setItem("selectedRepositoryId", repositoryIdFromUrl);
    } catch {}
    fetchModules();
  }, [repositoryId]);

  useEffect(() => {
    if (!repositoryId) return;
    fetchMind();
  }, [repositoryId, selectedModuleIds.join(",")]);

  const mindBefore = useMemo(
    () => ({
      moveNodeIn: (from: any[], to: any) => {
        const getId = (topic?: any) => String(topic?.nodeObj?.id ?? topic?.id ?? "");
        const toId = getId(to);
        if (!toId || (!toId.startsWith("module:") && toId !== "me-root")) return false;
        return (from || []).every((item) => {
          const id = getId(item);
          if (!id) return false;
          if (id === toId) return false;
          return id.startsWith("case:") || id.startsWith("module:");
        });
      },
      moveNodeBefore: (from: any[], to: any) => {
        const getId = (topic?: any) => String(topic?.nodeObj?.id ?? topic?.id ?? "");
        const toId = getId(to);
        if (!toId || (!toId.startsWith("case:") && !toId.startsWith("module:"))) return false;
        return (from || []).every((item) => {
          const id = getId(item);
          if (!id) return false;
          if (id === toId) return false;
          return id.startsWith("case:") || id.startsWith("module:");
        });
      },
      moveNodeAfter: (from: any[], to: any) => {
        const getId = (topic?: any) => String(topic?.nodeObj?.id ?? topic?.id ?? "");
        const toId = getId(to);
        if (!toId || (!toId.startsWith("case:") && !toId.startsWith("module:"))) return false;
        return (from || []).every((item) => {
          const id = getId(item);
          if (!id) return false;
          if (id === toId) return false;
          return id.startsWith("case:") || id.startsWith("module:");
        });
      },
      beginEdit: (tpc?: any) => {
        const node = tpc?.nodeObj || tpc;
        const id = node?.id;
        if (!id) return false;
        if (id.startsWith("case:")) return true;
        if (id.startsWith("caseprop:")) return true;
        if (id.startsWith("stepdesc:")) return true;
        if (id.startsWith("stepres:")) return true;
        return false;
      },
      addChild: () => false,
      insertSibling: () => false,
      insertParent: () => false,
      removeNodes: () => false,
      moveUpNode: () => false,
      moveDownNode: () => false,
    }),
    []
  );

  const handleMindOperation = async (op: Operation) => {
    const ws = String(workspaceSlug || "");
    if (!ws) return;

    if (op.name === "finishEdit") {
      const tpc = op.obj as any;
      const nodeObj = tpc?.nodeObj || tpc;
      const nodeId = nodeObj?.id ? String(nodeObj.id) : "";
      const nextTopic = nodeObj?.topic ? String(nodeObj.topic) : "";
      if (!nodeId) return;

      const saveText = nextTopic === "（空）" ? "" : nextTopic;

      try {
        if (nodeId.startsWith("case:")) {
          const caseId = nodeId.slice("case:".length);
          const existing = caseMapRef.current[caseId];
          const code = existing?.code ? String(existing.code) : "";
          const name = code && saveText.startsWith(code + " ") ? saveText.slice(code.length + 1) : saveText;
          await caseService.updateCase(ws, { id: caseId, name: name || "" });
          caseMapRef.current[caseId] = { ...(existing || {}), name: name || "" };
          return;
        }

        if (nodeId.startsWith("caseprop:")) {
          const rest = nodeId.slice("caseprop:".length);
          const [caseId, field] = rest.split(":");
          const existing = caseMapRef.current[caseId] || {};
          if (!caseId || !field) return;

          if (field === "precondition") {
            await caseService.updateCase(ws, { id: caseId, precondition: plainToHtml(saveText) });
            caseMapRef.current[caseId] = { ...existing, precondition: plainToHtml(saveText) };
            return;
          }
          if (field === "remark") {
            await caseService.updateCase(ws, { id: caseId, remark: plainToHtml(saveText) });
            caseMapRef.current[caseId] = { ...existing, remark: plainToHtml(saveText) };
            return;
          }
          if (field === "text_description") {
            await caseService.updateCase(ws, { id: caseId, text_description: plainToHtml(saveText) });
            caseMapRef.current[caseId] = { ...existing, text_description: plainToHtml(saveText) };
            return;
          }
          if (field === "text_result") {
            await caseService.updateCase(ws, { id: caseId, text_result: plainToHtml(saveText) });
            caseMapRef.current[caseId] = { ...existing, text_result: plainToHtml(saveText) };
            return;
          }
          return;
        }

        if (nodeId.startsWith("stepdesc:") || nodeId.startsWith("stepres:")) {
          const isDesc = nodeId.startsWith("stepdesc:");
          const rest = nodeId.slice((isDesc ? "stepdesc:" : "stepres:").length);
          const [caseId, idxStr] = rest.split(":");
          const idx = Number(idxStr);
          if (!caseId || Number.isNaN(idx) || idx < 0) return;
          const existing = caseMapRef.current[caseId] || {};
          const steps = Array.isArray(existing?.steps) ? [...existing.steps] : [];
          while (steps.length <= idx) steps.push({ description: "", result: "" });
          const row = { ...(steps[idx] || {}) };
          if (isDesc) row.description = saveText;
          else row.result = saveText;
          steps[idx] = row;
          await caseService.updateCase(ws, { id: caseId, steps });
          caseMapRef.current[caseId] = { ...existing, steps };
          return;
        }
      } catch (e: any) {
        try {
          message.error((e as any)?.error || "保存失败");
        } catch {}
      }
      return;
    }

    if (op.name === "moveNodeIn" || op.name === "moveNodeBefore" || op.name === "moveNodeAfter") {
      const opAny = op as any;
      const movingNodes: NodeObj[] = Array.isArray(opAny?.objs) ? opAny.objs : opAny?.obj ? [opAny.obj] : [];
      const targetModuleIdRaw = getTargetModuleIdFromOp(op);
      if (!movingNodes.length || !targetModuleIdRaw) return;

      const targetModuleId = targetModuleIdRaw === "ROOT_MODULE" ? null : targetModuleIdRaw;

      let changed = false;
      let failed = false;

      try {
        for (const moving of movingNodes) {
          const movingId = String(moving?.id ?? "");
          if (!movingId) continue;

          if (isCaseNodeId(movingId)) {
            const caseId = movingId.slice("case:".length);
            const currentModuleId = getCaseModuleId(caseId);
            if (currentModuleId === targetModuleId) continue;
            await caseService.updateCaseModule(ws, [caseId], targetModuleId as any);
            changed = true;
            continue;
          }

          if (isModuleNodeId(movingId)) {
            const moduleId = movingId.slice("module:".length);
            const currentParentId = getModuleParentId(movingId);
            if (currentParentId === targetModuleId) continue;
            if (targetModuleId === moduleId) continue;
            await caseModuleService.updateCaseModule(ws, moduleId, { parent: targetModuleId } as any);
            changed = true;
          }
        }
      } catch (e: any) {
        failed = true;
        try {
          message.error((e as any)?.error || "移动失败");
        } catch {}
      }

      if (changed || failed) {
        await Promise.allSettled([fetchModules(), fetchMind(true)]);
      }
    }
  };

  const getCaseIdFromNodeId = (nodeId: string): string | null => {
    if (nodeId.startsWith("case:")) return nodeId.slice("case:".length);
    if (nodeId.startsWith("caseprop:")) return nodeId.slice("caseprop:".length).split(":")[0] || null;
    if (nodeId.startsWith("stepdesc:")) return nodeId.slice("stepdesc:".length).split(":")[0] || null;
    if (nodeId.startsWith("stepres:")) return nodeId.slice("stepres:".length).split(":")[0] || null;
    return null;
  };

  function findParentNode(root: NodeObj | undefined, targetId: string, parent: NodeObj | null = null): NodeObj | null {
    if (!root) return null;
    if (String(root.id) === targetId) return parent;
    const children = Array.isArray(root.children) ? root.children : [];
    for (const child of children) {
      const found = findParentNode(child, targetId, root);
      if (found) return found;
    }
    return null;
  }

  function isCaseNodeId(nodeId: string) {
    return nodeId.startsWith("case:");
  }

  function isModuleNodeId(nodeId: string) {
    return nodeId.startsWith("module:");
  }

  function getModuleParentId(moduleNodeId: string): string | null {
    const parent = findParentNode(mindData?.nodeData as any, moduleNodeId);
    if (!parent) return null;
    const pid = String(parent.id ?? "");
    return pid.startsWith("module:") ? pid.slice("module:".length) : null;
  }

  function getTargetModuleIdFromOp(op: Operation): string | null {
    const opAny = op as any;
    const targetNode = opAny?.toObj;
    const targetId = String(targetNode?.id ?? "");
    if (!targetId) return null;
    if (op.name === "moveNodeIn") {
      if (targetId === "me-root") return "ROOT_MODULE";
      return targetId.startsWith("module:") ? targetId.slice("module:".length) : null;
    }
    const parent = findParentNode(mindData?.nodeData as any, targetId);
    if (!parent) return null;
    const parentId = String(parent.id ?? "");
    if (parentId === "me-root") return "ROOT_MODULE";
    return parentId.startsWith("module:") ? parentId.slice("module:".length) : null;
  }

  function getCaseModuleId(caseId: string): string | null {
    const data = caseMapRef.current[caseId];
    if (!data) return null;
    const moduleValue = (data as any)?.module ?? (data as any)?.module_id ?? (data as any)?.moduleId;
    if (!moduleValue) return null;
    if (typeof moduleValue === "object") return moduleValue?.id ? String(moduleValue.id) : null;
    return String(moduleValue);
  }

  const getStepIndexFromNodeId = (nodeId: string): number | null => {
    if (nodeId.startsWith("stepdesc:")) {
      const idx = Number(nodeId.slice("stepdesc:".length).split(":")[1]);
      return Number.isFinite(idx) ? idx : null;
    }
    if (nodeId.startsWith("stepres:")) {
      const idx = Number(nodeId.slice("stepres:".length).split(":")[1]);
      return Number.isFinite(idx) ? idx : null;
    }
    return null;
  };

  const handleContextAction = async (action: string, node: NodeObj) => {
    const ws = String(workspaceSlug || "");
    const repoId = repositoryId ? String(repositoryId) : "";
    const nodeId = String((node as any)?.id || "");

    if (!ws || !repoId || !nodeId) return;

    const refreshAll = async () => {
      await Promise.allSettled([fetchModules(), fetchMind(true)]);
    };

    try {
      if (action === "add_case") {
        if (!nodeId.startsWith("module:")) {
          message.warning("请在模块节点上新增用例");
          return;
        }
        const moduleId = nodeId.slice("module:".length);
        const payload: any = {
          name: "新建用例",
          repository: repoId,
          mode: 0,
          steps: [{ description: "", result: "" }],
        };
        if (currentUserId) payload.assignee = currentUserId;
        if (moduleId && moduleId !== "all") payload.module = moduleId;
        await caseService.createCase(ws, payload);
        await refreshAll();
        return;
      }

      if (action === "rename_module") {
        if (!nodeId.startsWith("module:")) {
          message.warning("请在模块节点上重命名");
          return;
        }
        const moduleId = nodeId.slice("module:".length);
        setRenamingModuleId(moduleId);
        setRenameValue(String((node as any)?.topic || ""));
        setRenameOpen(true);
        return;
      }

      if (action === "add_precondition" || action === "add_remark" || action === "add_text_description") {
        const caseId = getCaseIdFromNodeId(nodeId);
        if (!caseId) {
          message.warning("请在用例节点上操作");
          return;
        }
        const existing = caseMapRef.current[caseId] || {};
        if (action === "add_precondition") {
          if (stripHtml(existing?.precondition)) {
            message.info("前置条件已存在");
            return;
          }
          await caseService.updateCase(ws, { id: caseId, precondition: "<p>（空）</p>" });
        } else if (action === "add_remark") {
          if (stripHtml(existing?.remark)) {
            message.info("备注已存在");
            return;
          }
          await caseService.updateCase(ws, { id: caseId, remark: "<p>（空）</p>" });
        } else {
          if ((typeof existing?.mode === "number" ? existing.mode : 0) !== 1) {
            await caseService.updateCase(ws, { id: caseId, mode: 1 });
          }
          if (stripHtml(existing?.text_description)) {
            message.info("文本描述已存在");
            await refreshAll();
            return;
          }
          await caseService.updateCase(ws, { id: caseId, text_description: "<p>（空）</p>" });
        }
        await refreshAll();
        return;
      }

      if (action === "switch_to_text" || action === "switch_to_steps") {
        const caseId = getCaseIdFromNodeId(nodeId);
        if (!caseId) {
          message.warning("请在用例节点上操作");
          return;
        }
        const existing = caseMapRef.current[caseId] || {};
        if (action === "switch_to_text") {
          const patch: any = { id: caseId, mode: 1 };
          if (!stripHtml(existing?.text_description)) patch.text_description = "<p>（空）</p>";
          await caseService.updateCase(ws, patch);
          
          // 只更新当前用例节点的数据
          caseMapRef.current[caseId] = { ...existing, ...patch };
          // 重新获取数据以刷新界面，但仅限于数据变更，避免全量刷新导致其他节点折叠状态丢失
          // 这里为了简单起见，仍然调用 refreshAll，但注意 mind-elixir 的 refresh 方法会保留状态（如果 id 不变）
          // 但是本组件的 refreshAll 会重新 fetchMind 导致全量重绘
          // 由于切换模式改变了子节点结构，必须重绘该用例节点
          await refreshAll();
        } else {
          const steps = Array.isArray(existing?.steps) ? existing.steps : [];
          const patch: any = { id: caseId, mode: 0 };
          if (!Array.isArray(steps) || steps.length === 0) patch.steps = [{ description: "", result: "" }];
          await caseService.updateCase(ws, patch);

          caseMapRef.current[caseId] = { ...existing, ...patch };
          await refreshAll();
        }
        return;
      }

      if (action === "add_step" || action === "insert_step_above" || action === "insert_step_below") {
        const caseId = getCaseIdFromNodeId(nodeId);
        if (!caseId) {
          message.warning("请在用例/步骤节点上新增步骤");
          return;
        }
        const existing = caseMapRef.current[caseId] || {};
        const mode = typeof existing?.mode === "number" ? existing.mode : 0;
        if (mode === 1) {
          message.warning("当前用例为文本模式，请先切换为步骤模式");
          return;
        }
        const steps = Array.isArray(existing?.steps) ? [...existing.steps] : [];
        const blank = { description: "", result: "" };

        if (action === "add_step") {
          steps.push(blank);
        } else {
          const idx = getStepIndexFromNodeId(nodeId);
          if (idx === null) {
            message.warning("请在步骤节点上插入步骤");
            return;
          }
          const insertIndex = action === "insert_step_above" ? idx : idx + 1;
          steps.splice(Math.max(0, Math.min(insertIndex, steps.length)), 0, blank);
        }

        await caseService.updateCase(ws, { id: caseId, steps });
        await refreshAll();
        return;
      }

      if (action === "delete_node") {
        if (nodeId.startsWith("module:")) {
          const moduleId = nodeId.slice("module:".length);
          Modal.confirm({
            title: "确认删除模块？",
            content: "删除模块会同时删除其子模块与关联用例。",
            okText: "删除",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
              try {
                await caseModuleService.deleteCaseModule(ws, moduleId);
                setSelectedModuleIds([]);
                const pid = String(projectId || "");
                const params = new URLSearchParams();
                params.set("repositoryId", repoId);
                params.set("moduleId", "all");
                router.push(`/${ws}/projects/${pid}/testhub/cases/mind?${params.toString()}`);
                await refreshAll();
                message.success("删除成功");
              } catch (e: any) {
                message.error((e as any)?.error || "删除失败");
                throw e;
              }
            },
          });
          return;
        }

        if (nodeId.startsWith("case:")) {
          const caseId = nodeId.slice("case:".length);
          Modal.confirm({
            title: "确认删除用例？",
            content: "删除后不可恢复。",
            okText: "删除",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
              try {
                await caseService.deleteCase(ws, caseId);
                await refreshAll();
                message.success("删除成功");
              } catch (e: any) {
                message.error((e as any)?.error || "删除失败");
                throw e;
              }
            },
          });
          return;
        }

        if (nodeId.startsWith("caseprop:")) {
          const rest = nodeId.slice("caseprop:".length);
          const [caseId, field] = rest.split(":");
          if (!caseId || !field) return;
          if (field === "precondition") {
            await caseService.updateCase(ws, { id: caseId, precondition: "<p></p>" });
          } else if (field === "remark") {
            await caseService.updateCase(ws, { id: caseId, remark: "<p></p>" });
          } else if (field === "text_description") {
            await caseService.updateCase(ws, { id: caseId, text_description: "<p></p>", text_result: "<p></p>" });
          } else if (field === "text_result") {
            await caseService.updateCase(ws, { id: caseId, text_result: "<p></p>" });
          } else if (field === "steps") {
            await caseService.updateCase(ws, { id: caseId, steps: [] });
          }
          await refreshAll();
          return;
        }

        if (nodeId.startsWith("stepdesc:") || nodeId.startsWith("stepres:")) {
          const caseId = getCaseIdFromNodeId(nodeId);
          const idx = getStepIndexFromNodeId(nodeId);
          if (!caseId || idx === null) return;
          const existing = caseMapRef.current[caseId] || {};
          const steps = Array.isArray(existing?.steps) ? [...existing.steps] : [];
          if (idx >= 0 && idx < steps.length) steps.splice(idx, 1);
          await caseService.updateCase(ws, { id: caseId, steps });
          await refreshAll();
          return;
        }

        message.info("该节点暂不支持删除");
      }
    } catch (e: any) {
      try {
        message.error((e as any)?.error || "操作失败");
      } catch {}
    }
  };

  const listUrl = useMemo(() => {
    const ws = String(workspaceSlug || "");
    const pid = String(projectId || "");
    const params = new URLSearchParams();
    if (repositoryId) params.set("repositoryId", String(repositoryId));
    return `/${ws}/projects/${pid}/testhub/cases${params.toString() ? `?${params.toString()}` : ""}`;
  }, [workspaceSlug, projectId, repositoryId]);

  return (
    <>
      <PageHead title={`测试用例${repositoryName ? " - " + repositoryName : ""} - 脑图`} />
      <div className="h-full w-full">
        <div className="flex h-full w-full flex-col">
          <div className="px-3 pt-2 pb-2 sm:pt-2 flex items-center justify-between flex-shrink-0 border-b border-custom-border-200">
            <div>
              <Breadcrumbs>
                <Breadcrumbs.Item
                  component={<BreadcrumbLink href={`/${workspaceSlug}/projects/${projectId}/testhub`} label="测试用例库" />}
                />
                <Breadcrumbs.Item
                  isLast
                  component={
                    <RepositorySelect
                      key={`repository-select-mind-${repositoryId || "all"}`}
                      workspaceSlug={String(workspaceSlug || "")}
                      projectId={String(projectId || "")}
                      className="inline-flex"
                      buttonClassName="min-w-0 border-0 px-1.5 py-1 text-sm font-medium text-custom-text-300 hover:text-custom-text-100 hover:bg-custom-background-90 cursor-pointer gap-2 h-full"
                      labelClassName="max-w-[150px] leading-4"
                      hideChevron
                      defaultRepositoryId={repositoryId}
                      onRepositoryChange={({ id, name }) => {
                        const ws = String(workspaceSlug || "");
                        const pid = String(projectId || "");
                        setRepositoryName(name ? String(name) : "");
                        if (id)
                          router.push(
                            `/${ws}/projects/${pid}/testhub/cases/mind?repositoryId=${encodeURIComponent(String(id))}&moduleId=all`
                          );
                        else router.push(`/${ws}/projects/${pid}/testhub/cases/mind`);
                      }}
                    />
                  }
                />
              </Breadcrumbs>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push(listUrl)}
                className="h-8 w-8 rounded border border-custom-border-200 text-custom-text-300 hover:text-custom-text-100 hover:bg-custom-background-90 flex items-center justify-center"
                aria-label="列表视图"
              >
                <UnorderedListOutlined />
              </button>
              <button
                type="button"
                className="h-8 w-8 rounded border border-custom-primary-100 bg-custom-primary-100/10 text-custom-primary-100 flex items-center justify-center"
                aria-label="脑图视图"
              >
                <ShareAltOutlined />
              </button>
            </div>
          </div>
          <Row wrap={false} className="flex-1 overflow-hidden pb-0" gutter={[0, 16]}>
            <Col
              className="relative flex flex-col h-full border-r border-custom-border-200"
              flex="0 0 auto"
              style={{ width: leftWidth, minWidth: 200, maxWidth: 300 }}
            >
              <div
                onMouseDown={(e) => {
                  const startX = (e as any).clientX;
                  const startWidth = leftWidth;
                  const onMove = (ev: MouseEvent) => {
                    const delta = ev.clientX - startX;
                    const next = Math.min(300, Math.max(200, startWidth + delta));
                    setLeftWidth(next);
                  };
                  const onUp = () => {
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                    document.body.style.cursor = "auto";
                    document.body.style.userSelect = "auto";
                  };
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                  document.body.style.cursor = "col-resize";
                  document.body.style.userSelect = "none";
                  if (e && typeof (e as any).preventDefault === "function") (e as any).preventDefault();
                }}
                className="absolute right-0 top-0 h-full w-2"
                style={{ cursor: "col-resize", zIndex: 10 }}
              />
              <style
                dangerouslySetInnerHTML={{
                  __html: `
                .custom-tree-indent .ant-tree-indent-unit {
                  width: 10px !important;
                }
                .custom-tree-indent .ant-tree-switcher {
                  width: 14px !important;
                  margin-inline-end: 2px !important;
                }
                .custom-tree-indent .ant-tree-node-content-wrapper {
                  padding-inline: 4px !important;
                }
              `,
                }}
              />
              <div className="flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm">
                <Tree
                  showLine={false}
                  defaultExpandAll
                  checkable
                  checkStrictly
                  onSelect={(selectedKeys) => {
                    const key = String((selectedKeys as any[])?.[0] ?? "");
                    const ws = String(workspaceSlug || "");
                    const pid = String(projectId || "");
                    const params = new URLSearchParams();
                    if (repositoryId) params.set("repositoryId", String(repositoryId));
                    if (!key || key === "all") {
                      setSelectedModuleIds([]);
                      params.set("moduleId", "all");
                      router.push(`/${ws}/projects/${pid}/testhub/cases/mind?${params.toString()}`);
                      return;
                    }
                    setSelectedModuleIds([key]);
                    params.append("moduleId", key);
                    router.push(`/${ws}/projects/${pid}/testhub/cases/mind?${params.toString()}`);
                  }}
                  onCheck={(checkedKeys) => {
                    const nextKeys = Array.isArray(checkedKeys) ? checkedKeys : (checkedKeys as any)?.checked || [];
                    const moduleIds = (nextKeys as any[]).map((k) => String(k)).filter((k) => k && k !== "all");
                    setSelectedModuleIds(moduleIds);

                    const ws = String(workspaceSlug || "");
                    const pid = String(projectId || "");
                    const params = new URLSearchParams();
                    if (repositoryId) params.set("repositoryId", String(repositoryId));
                    if (!moduleIds.length) {
                      params.set("moduleId", "all");
                    } else {
                      for (const mid of moduleIds) params.append("moduleId", mid);
                    }
                    router.push(`/${ws}/projects/${pid}/testhub/cases/mind?${params.toString()}`);
                  }}
                  onExpand={onExpand}
                  expandedKeys={expandedKeys}
                  autoExpandParent={autoExpandParent}
                  treeData={treeData}
                  checkedKeys={{ checked: selectedModuleIds, halfChecked: [] }}
                  selectedKeys={[selectedModuleIds[0] || "all"]}
                  className="py-2 pl-2 custom-tree-indent"
                />
              </div>
            </Col>
            <Col flex="auto" className="h-full overflow-hidden">
              <div className="h-full w-full overflow-hidden">
                {!repositoryId && (
                  <div className="flex h-full items-center justify-center text-custom-text-300">请先选择一个用例库</div>
                )}
                {repositoryId && loadingMind && (
                  <div className="flex h-full items-center justify-center text-custom-text-300">加载中...</div>
                )}
                {repositoryId && !loadingMind && mindData && (
                  <CaseMindmap
                    data={mindData}
                    editable={true}
                    before={mindBefore}
                    onOperation={handleMindOperation}
                    onContextAction={handleContextAction}
                  />
                )}
                {repositoryId && !loadingMind && !mindData && (
                  <div className="flex h-full items-center justify-center text-custom-text-300">暂无数据</div>
                )}
              </div>
            </Col>
          </Row>
        </div>
      </div>
      <Modal
        open={renameOpen}
        title="重命名模块"
        okText="保存"
        cancelText="取消"
        onCancel={() => {
          setRenameOpen(false);
          setRenamingModuleId(null);
          setRenameValue("");
        }}
        onOk={async () => {
          const moduleId = renamingModuleId;
          const nextName = (renameValue || "").trim();
          if (!moduleId) return;
          if (!nextName) {
            message.warning("模块名称不能为空");
            return Promise.reject();
          }
          try {
            await caseModuleService.updateCaseModule(String(workspaceSlug || ""), moduleId, { name: nextName });
            setRenameOpen(false);
            setRenamingModuleId(null);
            setRenameValue("");
            await Promise.allSettled([fetchModules(), fetchMind(true)]);
            message.success("重命名成功");
          } catch (e: any) {
            message.error((e as any)?.error || "重命名失败");
            return Promise.reject(e);
          }
        }}
      >
        <Input
          autoFocus
          placeholder="请输入模块名称"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
        />
      </Modal>
    </>
  );
}
