import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  TCreateDevModeStagePayload,
  TDevModeDetail,
  TDevModeStage,
  TDevModeStageTemplateNode,
  TUpdateDevModePayload,
  TUpdateDevModeStagePayload,
} from "@plane/types";
import { DEV_MODE_MAX_WORKLOAD_RATIO } from "@plane/types";
import { DevModeService } from "@/services/dev-mode.service";
import { getDevModeErrorMessage } from "./use-dev-modes";

const service = new DevModeService();

/** 勾选面板的树：顶层节点（汇总评审，或没有汇总评审的阶段里的活动）各带自己的子活动 */
export type TDevModeTemplateTreeNode = {
  node: TDevModeStageTemplateNode;
  children: TDevModeStageTemplateNode[];
};

const buildTemplateTree = (nodes: TDevModeStageTemplateNode[]): TDevModeTemplateTreeNode[] => {
  const childrenByParent = new Map<string, TDevModeStageTemplateNode[]>();
  for (const node of nodes) {
    if (!node.parent_id) continue;
    const bucket = childrenByParent.get(node.parent_id) ?? [];
    bucket.push(node);
    childrenByParent.set(node.parent_id, bucket);
  }
  return nodes
    .filter((node) => !node.parent_id)
    .map((node) => ({ node, children: childrenByParent.get(node.id) ?? [] }));
};

/**
 * 模式详情：模式本身 + 阶段列表 + 当前展开阶段的评审勾选。
 *
 * 勾选是「草稿 → 保存」而不是即时写入：面板里勾改的是本地 `draftSelection`，底栏出现
 * 还原 / 保存，保存时整体 PUT。这样父节点的全选/半选不会连发几十个请求。
 */
export const useDevModeDetail = (workspaceSlug: string | undefined, devModeId: string | undefined) => {
  const [devMode, setDevMode] = useState<TDevModeDetail | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && devModeId));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 勾选面板
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [templateNodes, setTemplateNodes] = useState<TDevModeStageTemplateNode[]>([]);
  const [draftSelection, setDraftSelection] = useState<Set<string>>(new Set());
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(false);
  const [isSavingTemplates, setIsSavingTemplates] = useState(false);

  const fetchDevMode = useCallback(async () => {
    if (!workspaceSlug || !devModeId) return undefined;
    setIsLoading(true);
    setError(null);
    try {
      const response = await service.retrieve(workspaceSlug, devModeId);
      setDevMode(response);
      return response;
    } catch (requestError) {
      setError(getDevModeErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug, devModeId]);

  useEffect(() => {
    void fetchDevMode().catch(() => undefined);
  }, [fetchDevMode]);

  const stages = useMemo(() => devMode?.stages ?? [], [devMode]);

  const setStages = useCallback((updater: (current: TDevModeStage[]) => TDevModeStage[]) => {
    setDevMode((current) => (current ? { ...current, stages: updater(current.stages) } : current));
  }, []);

  /**
   * 占比合计与剩余：表格底栏与表单提示共用。
   *
   * 按「分」（乘 100 取整）累加再除回来，不直接加两位小数的浮点数 —— 0.1 + 0.2 那类
   * 误差会让底栏显示 100.00000000000001%，更糟的是让表单把合法输入判成超限。
   * 后端用 Decimal 比较，不会有这个问题，误差纯粹是前端造出来的。
   */
  const workloadTotal = useMemo(() => {
    const cents = stages.reduce((sum, stage) => sum + Math.round(Number(stage.workload_ratio ?? 0) * 100), 0);
    return cents / 100;
  }, [stages]);
  const workloadRemaining = Math.round((DEV_MODE_MAX_WORKLOAD_RATIO - workloadTotal) * 100) / 100;

  // ---- 模式本身 ------------------------------------------------------------

  const updateDevMode = useCallback(
    async (payload: TUpdateDevModePayload) => {
      if (!workspaceSlug || !devModeId) return undefined;
      setIsMutating(true);
      try {
        const updated = await service.update(workspaceSlug, devModeId, payload);
        setDevMode((current) => (current ? { ...current, ...updated } : current));
        return updated;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, devModeId]
  );

  // ---- 阶段 ----------------------------------------------------------------

  const createStage = useCallback(
    async (payload: TCreateDevModeStagePayload) => {
      if (!workspaceSlug || !devModeId) return undefined;
      setIsMutating(true);
      try {
        const created = await service.createStage(workspaceSlug, devModeId, payload);
        setStages((current) => [...current, created]);
        return created;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, devModeId, setStages]
  );

  const bulkCreateStages = useCallback(
    async (stageTypeIds: string[]) => {
      if (!workspaceSlug || !devModeId) return undefined;
      setIsMutating(true);
      try {
        const result = await service.bulkCreateStages(workspaceSlug, devModeId, stageTypeIds);
        // 批量接口只回计数，阶段本体重新拉一次
        await fetchDevMode().catch(() => undefined);
        return result;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, devModeId, fetchDevMode]
  );

  const updateStage = useCallback(
    async (stageId: string, payload: TUpdateDevModeStagePayload) => {
      if (!workspaceSlug || !devModeId) return undefined;
      setIsMutating(true);
      try {
        const updated = await service.updateStage(workspaceSlug, devModeId, stageId, payload);
        setStages((current) => current.map((item) => (item.id === stageId ? updated : item)));
        return updated;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, devModeId, setStages]
  );

  const deleteStage = useCallback(
    async (stageId: string) => {
      if (!workspaceSlug || !devModeId) return;
      setIsMutating(true);
      try {
        await service.deleteStage(workspaceSlug, devModeId, stageId);
        setStages((current) => current.filter((item) => item.id !== stageId));
        setActiveStageId((current) => (current === stageId ? null : current));
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, devModeId, setStages]
  );

  const bulkDeleteStages = useCallback(
    async (stageIds: string[]) => {
      if (!workspaceSlug || !devModeId || stageIds.length === 0) return;
      setIsMutating(true);
      try {
        await service.bulkDeleteStages(workspaceSlug, devModeId, stageIds);
        const removed = new Set(stageIds);
        setStages((current) => current.filter((item) => !removed.has(item.id)));
        setActiveStageId((current) => (current && removed.has(current) ? null : current));
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, devModeId, setStages]
  );

  const reorderStages = useCallback(
    async (orderedIds: string[]) => {
      if (!workspaceSlug || !devModeId || orderedIds.length === 0) return;
      // 先本地改顺序再发请求：拖完立即定位，失败时用服务端结果回正
      setStages((current) => {
        const rank = new Map(orderedIds.map((id, index) => [id, index]));
        return [...current].sort((a, b) => {
          const ra = rank.get(a.id);
          const rb = rank.get(b.id);
          if (ra === undefined || rb === undefined) return 0;
          return ra - rb;
        });
      });
      try {
        await service.reorderStages(workspaceSlug, devModeId, orderedIds);
      } catch (requestError) {
        await fetchDevMode().catch(() => undefined);
        throw requestError;
      }
    },
    [workspaceSlug, devModeId, setStages, fetchDevMode]
  );

  // ---- 阶段下的评审勾选 ------------------------------------------------------

  const openStage = useCallback(
    async (stageId: string | null) => {
      setActiveStageId(stageId);
      if (!workspaceSlug || !devModeId || !stageId) {
        setTemplateNodes([]);
        setDraftSelection(new Set());
        return;
      }
      setIsTemplatesLoading(true);
      try {
        const nodes = await service.listStageTemplates(workspaceSlug, devModeId, stageId);
        setTemplateNodes(nodes);
        setDraftSelection(new Set(nodes.filter((node) => node.selected).map((node) => node.id)));
      } catch (requestError) {
        setTemplateNodes([]);
        setDraftSelection(new Set());
        throw requestError;
      } finally {
        setIsTemplatesLoading(false);
      }
    },
    [workspaceSlug, devModeId]
  );

  /** 勾一个节点。勾汇总评审时连带它下面的活动一起勾/取消（父节点全选 / 半选） */
  const toggleTemplate = useCallback(
    (templateId: string, checked: boolean) => {
      setDraftSelection((current) => {
        const next = new Set(current);
        const affected = [templateId, ...templateNodes.filter((n) => n.parent_id === templateId).map((n) => n.id)];
        for (const id of affected) {
          if (checked) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    [templateNodes]
  );

  const resetTemplateDraft = useCallback(() => {
    setDraftSelection(new Set(templateNodes.filter((node) => node.selected).map((node) => node.id)));
  }, [templateNodes]);

  const saveTemplateDraft = useCallback(async () => {
    if (!workspaceSlug || !devModeId || !activeStageId) return;
    setIsSavingTemplates(true);
    try {
      const templateIds = [...draftSelection];
      await service.setStageTemplates(workspaceSlug, devModeId, activeStageId, templateIds);
      // 本地把 selected 落定，底栏的「未保存」随之消失；顺便更新阶段行上的计数
      const selected = new Set(templateIds);
      setTemplateNodes((current) => current.map((node) => ({ ...node, selected: selected.has(node.id) })));
      setStages((current) =>
        current.map((item) => (item.id === activeStageId ? { ...item, template_count: templateIds.length } : item))
      );
    } finally {
      setIsSavingTemplates(false);
    }
  }, [workspaceSlug, devModeId, activeStageId, draftSelection, setStages]);

  const templateTree = useMemo(() => buildTemplateTree(templateNodes), [templateNodes]);
  const hasTemplateChanges = useMemo(() => {
    const saved = new Set(templateNodes.filter((node) => node.selected).map((node) => node.id));
    if (saved.size !== draftSelection.size) return true;
    for (const id of draftSelection) if (!saved.has(id)) return true;
    return false;
  }, [templateNodes, draftSelection]);

  const activeStage = useMemo(
    () => stages.find((stage) => stage.id === activeStageId) ?? null,
    [stages, activeStageId]
  );

  return {
    devMode,
    stages,
    isLoading,
    isMutating,
    error,
    workloadTotal,
    workloadRemaining,
    fetchDevMode,
    updateDevMode,
    createStage,
    bulkCreateStages,
    updateStage,
    deleteStage,
    bulkDeleteStages,
    reorderStages,
    // 勾选面板
    activeStage,
    activeStageId,
    openStage,
    templateTree,
    templateNodes,
    draftSelection,
    toggleTemplate,
    resetTemplateDraft,
    saveTemplateDraft,
    hasTemplateChanges,
    isTemplatesLoading,
    isSavingTemplates,
  };
};

export type TDevModeDetailStore = ReturnType<typeof useDevModeDetail>;
