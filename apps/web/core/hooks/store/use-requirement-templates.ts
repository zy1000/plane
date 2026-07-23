import { useCallback, useEffect, useState } from "react";
import type { TCreateRequirementTemplatePayload, TRequirement } from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load requirement templates.";
  }
  return "Unable to load requirement templates.";
};

export const useRequirementTemplates = (workspaceSlug: string | undefined) => {
  const [templates, setTemplates] = useState<TRequirement[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upsertTemplate = useCallback((template: TRequirement) => {
    setTemplates((current) => {
      const index = current.findIndex((item) => item.id === template.id);
      if (index === -1) return [template, ...current];
      return current.map((item) => (item.id === template.id ? template : item));
    });
  }, []);

  const fetchTemplates = useCallback(async () => {
    if (!workspaceSlug) return [];
    setIsLoading(true);
    setError(null);
    try {
      const response = await requirementService.listTemplates(workspaceSlug);
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

  const createTemplate = useCallback(
    async (payload: TCreateRequirementTemplatePayload) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.createTemplate(workspaceSlug, payload);
        upsertTemplate(response);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [upsertTemplate, workspaceSlug]
  );

  const deleteTemplate = useCallback(
    async (templateId: string) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        await requirementService.deleteTemplate(workspaceSlug, templateId);
        setTemplates((current) => current.filter((item) => item.id !== templateId));
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  const deleteTemplates = useCallback(
    async (templateIds: string[]) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      if (templateIds.length === 0) return;
      setIsMutating(true);
      try {
        const results = await Promise.allSettled(
          templateIds.map((templateId) => requirementService.deleteTemplate(workspaceSlug, templateId))
        );
        const deletedTemplateIds = new Set(
          results.flatMap((result, index) => (result.status === "fulfilled" ? [templateIds[index]] : []))
        );
        setTemplates((current) => current.filter((item) => !deletedTemplateIds.has(item.id)));
        const failedResult = results.find((result) => result.status === "rejected");
        if (failedResult?.status === "rejected") throw failedResult.reason;
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  return {
    templates,
    isLoading,
    isMutating,
    error,
    fetchTemplates,
    createTemplate,
    deleteTemplate,
    deleteTemplates,
    upsertTemplate,
  };
};
