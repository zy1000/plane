import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  TCreateStageReviewTemplatePayload,
  TStageReviewTemplate,
  TUpdateStageReviewTemplatePayload,
} from "@plane/types";
import { STAGE_REVIEW_ROOT_KINDS } from "@plane/types";
import { StageReviewTemplateService } from "@/services/stage-review-template.service";

const service = new StageReviewTemplateService();

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as Record<string, unknown>;
    const message = payload.error ?? payload.detail;
    if (typeof message === "string") return message;
  }
  return "Something went wrong.";
};

/** 一个阶段下的模板树：顶层节点（根评审，或没有根的阶段里的活动）各带自己的子活动 */
export type TStageReviewGroup = {
  stageId: string;
  stageLabel: string;
  nodes: { node: TStageReviewTemplate; children: TStageReviewTemplate[] }[];
  reviewCount: number;
  activityCount: number;
};

/** 左栏一项 = 数据字典 product_stage 的一个值。字典是阶段的唯一来源 */
export type TStageOption = { id: string; label: string };

const emptyGroup = (stageId: string, stageLabel: string): TStageReviewGroup => ({
  stageId,
  stageLabel,
  nodes: [],
  reviewCount: 0,
  activityCount: 0,
});

/**
 * 按 (阶段, parent) 把扁平列表折成树。
 *
 * **阶段清单来自数据字典而不是模板** —— 按模板派生的话，还没配模板的阶段在左栏里根本
 * 不存在，也就永远加不了第一条模板。字典还没加载出来时退化成按模板派生，避免首屏空白。
 */
const buildGroups = (templates: TStageReviewTemplate[], stages: TStageOption[]): TStageReviewGroup[] => {
  const childrenByParent = new Map<string, TStageReviewTemplate[]>();
  for (const template of templates) {
    if (!template.parent_id) continue;
    const bucket = childrenByParent.get(template.parent_id) ?? [];
    bucket.push(template);
    childrenByParent.set(template.parent_id, bucket);
  }

  // 字典顺序即左栏顺序；没有模板的阶段也占一行（计数 0 · 0）
  const groups = new Map<string, TStageReviewGroup>(
    stages.map((stage) => [stage.id, emptyGroup(stage.id, stage.label)])
  );

  for (const template of templates) {
    // 顶层节点决定树的骨架；子节点只挂在父下面，不单独进 nodes
    if (template.parent_id) continue;
    const stageId = template.stage_id;
    const group =
      groups.get(stageId) ??
      // 字典里没有这个值（被删过 / 字典还没加载）——仍然要显示，否则模板会凭空消失
      emptyGroup(stageId, template.stage_detail?.label ?? "");
    const children = childrenByParent.get(template.id) ?? [];
    group.nodes.push({ node: template, children });
    if (STAGE_REVIEW_ROOT_KINDS.includes(template.kind)) group.reviewCount += 1;
    else group.activityCount += 1;
    group.activityCount += children.length;
    groups.set(stageId, group);
  }
  return [...groups.values()];
};

export const useStageReviewTemplates = (workspaceSlug: string | undefined, stages: TStageOption[]) => {
  const [templates, setTemplates] = useState<TStageReviewTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    if (!workspaceSlug) return [];
    setIsLoading(true);
    setError(null);
    try {
      const response = await service.list(workspaceSlug);
      setTemplates(response);
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void fetchTemplates().catch(() => undefined);
  }, [fetchTemplates]);

  const upsert = useCallback((template: TStageReviewTemplate) => {
    setTemplates((current) => {
      const index = current.findIndex((item) => item.id === template.id);
      if (index === -1) return [...current, template];
      const next = [...current];
      next[index] = template;
      return next;
    });
  }, []);

  const createTemplate = useCallback(
    async (payload: TCreateStageReviewTemplatePayload) => {
      if (!workspaceSlug) return undefined;
      setIsMutating(true);
      try {
        const created = await service.create(workspaceSlug, payload);
        upsert(created);
        return created;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, upsert]
  );

  const updateTemplate = useCallback(
    async (templateId: string, payload: TUpdateStageReviewTemplatePayload) => {
      if (!workspaceSlug) return undefined;
      setIsMutating(true);
      try {
        const updated = await service.update(workspaceSlug, templateId, payload);
        upsert(updated);
        return updated;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug, upsert]
  );

  const deleteTemplate = useCallback(
    async (templateId: string) => {
      if (!workspaceSlug) return;
      setIsMutating(true);
      try {
        await service.destroy(workspaceSlug, templateId);
        // 删评审会连带删掉它下面的活动，本地也要一并摘掉，不重刷整页
        setTemplates((current) =>
          current.filter((item) => item.id !== templateId && item.parent_id !== templateId)
        );
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  const reorderTemplates = useCallback(
    async (orderedIds: string[]) => {
      if (!workspaceSlug || orderedIds.length === 0) return;
      // 先本地改顺序再发请求：拖完立即定位，失败时用服务端结果回正
      setTemplates((current) => {
        const rank = new Map(orderedIds.map((id, index) => [id, index]));
        return [...current].sort((a, b) => {
          const ra = rank.get(a.id);
          const rb = rank.get(b.id);
          if (ra === undefined || rb === undefined) return 0;
          return ra - rb;
        });
      });
      try {
        await service.reorder(workspaceSlug, orderedIds);
      } catch (requestError) {
        await fetchTemplates().catch(() => undefined);
        throw requestError;
      }
    },
    [workspaceSlug, fetchTemplates]
  );

  const groups = useMemo(() => buildGroups(templates, stages), [templates, stages]);

  return {
    templates,
    groups,
    isLoading,
    isMutating,
    error,
    fetchTemplates,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    reorderTemplates,
  };
};

export type TStageReviewTemplatesStore = ReturnType<typeof useStageReviewTemplates>;
