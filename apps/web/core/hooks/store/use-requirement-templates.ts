import { useCallback, useState } from "react";
import {
  RequirementStructureService,
  type TRequirementTemplate,
  type TRequirementTemplatePayload,
  type TRequirementTemplateSummary,
} from "@/services/requirement-structure.service";

const requirementStructureService = new RequirementStructureService();

export const useRequirementTemplates = (workspaceSlug?: string, productId?: string) => {
  const [templates, setTemplates] = useState<TRequirementTemplateSummary[]>([]);
  const [template, setTemplate] = useState<TRequirementTemplate>();
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<unknown>();

  const requireScope = useCallback(() => {
    if (!workspaceSlug || !productId) throw new Error("缺少产品参数");
    return { workspaceSlug, productId };
  }, [productId, workspaceSlug]);
  const markDirty = useCallback(() => setIsDirty(true), []);
  const resetDirty = useCallback(() => setIsDirty(false), []);

  const fetchTemplates = useCallback(
    async (active = false) => {
      const scope = requireScope();
      setIsLoading(true);
      setError(undefined);
      try {
        const response = await requirementStructureService.getRequirementTemplates(
          scope.workspaceSlug,
          scope.productId,
          active
        );
        setTemplates(response);
        return response;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [requireScope]
  );

  const fetchTemplate = useCallback(
    async (templateId: string) => {
      const scope = requireScope();
      setIsLoading(true);
      setError(undefined);
      try {
        const response = await requirementStructureService.getRequirementTemplate(
          scope.workspaceSlug,
          scope.productId,
          templateId
        );
        setTemplate(response);
        setIsDirty(false);
        return response;
      } catch (err) {
        setError(err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [requireScope]
  );

  const createTemplate = useCallback(
    async (payload: TRequirementTemplatePayload) => {
      const scope = requireScope();
      setIsMutating(true);
      try {
        const created = await requirementStructureService.createRequirementTemplate(
          scope.workspaceSlug,
          scope.productId,
          payload
        );
        setTemplate(created);
        setTemplates((current) => [created, ...current.filter((item) => item.id !== created.id)]);
        setIsDirty(false);
        return created;
      } finally {
        setIsMutating(false);
      }
    },
    [requireScope]
  );

  const updateTemplate = useCallback(
    async (templateId: string, revision: number, payload: TRequirementTemplatePayload) => {
      const scope = requireScope();
      setIsMutating(true);
      try {
        const updated = await requirementStructureService.updateRequirementTemplate(
          scope.workspaceSlug,
          scope.productId,
          templateId,
          revision,
          payload
        );
        setTemplate(updated);
        setTemplates((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setIsDirty(false);
        return updated;
      } finally {
        setIsMutating(false);
      }
    },
    [requireScope]
  );

  const updateTemplateStatus = useCallback(
    async (templateId: string, revision: number, isActive: boolean) => {
      const scope = requireScope();
      setIsMutating(true);
      try {
        const updated = await requirementStructureService.updateRequirementTemplateStatus(
          scope.workspaceSlug,
          scope.productId,
          templateId,
          revision,
          isActive
        );
        setTemplates((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        setTemplate((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
        return updated;
      } finally {
        setIsMutating(false);
      }
    },
    [requireScope]
  );

  const deleteTemplate = useCallback(
    async (templateId: string) => {
      const scope = requireScope();
      setIsMutating(true);
      try {
        await requirementStructureService.deleteRequirementTemplate(scope.workspaceSlug, scope.productId, templateId);
        setTemplates((current) => current.filter((item) => item.id !== templateId));
        setTemplate((current) => (current?.id === templateId ? undefined : current));
        setIsDirty(false);
      } finally {
        setIsMutating(false);
      }
    },
    [requireScope]
  );

  return {
    createTemplate,
    deleteTemplate,
    error,
    fetchTemplate,
    fetchTemplates,
    isDirty,
    isLoading,
    isMutating,
    markDirty,
    resetDirty,
    template,
    templates,
    updateTemplate,
    updateTemplateStatus,
  };
};
