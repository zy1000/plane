import { useCallback, useEffect, useState } from "react";
import type { TRequirementType, TRequirementTypeConfiguration, TRequirementTypeConfigurationPayload } from "@plane/types";
import { RequirementTypeService } from "@/services/requirement-type.service";

const requirementTypeService = new RequirementTypeService();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load the requirement type.";
  }
  return "Unable to load the requirement type.";
};

/**
 * 需求类型编辑器的数据源：只有字段结构，没有明细行。
 *
 * 名称/描述与字段在同一次 PUT 里保存，共用一把乐观锁。
 */
export const useRequirementTypeDetails = ({
  workspaceSlug,
  requirementTypeId,
  onRequirementTypeUpdate,
}: {
  workspaceSlug: string | undefined;
  requirementTypeId: string | undefined;
  onRequirementTypeUpdate?: (requirementType: TRequirementType) => void;
}) => {
  const [configuration, setConfiguration] = useState<TRequirementTypeConfiguration | null>(null);
  const [isConfigurationLoading, setIsConfigurationLoading] = useState(Boolean(workspaceSlug && requirementTypeId));
  const [isMutating, setIsMutating] = useState(false);
  const [configurationError, setConfigurationError] = useState<string | null>(null);

  const fetchConfiguration = useCallback(async () => {
    if (!workspaceSlug || !requirementTypeId) return null;
    setIsConfigurationLoading(true);
    setConfigurationError(null);
    try {
      const response = await requirementTypeService.getConfiguration(workspaceSlug, requirementTypeId);
      setConfiguration(response);
      onRequirementTypeUpdate?.(response.requirement_type);
      return response;
    } catch (requestError) {
      setConfigurationError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsConfigurationLoading(false);
    }
  }, [onRequirementTypeUpdate, requirementTypeId, workspaceSlug]);

  useEffect(() => {
    setConfiguration(null);
    void fetchConfiguration().catch(() => undefined);
  }, [fetchConfiguration]);

  const updateConfiguration = useCallback(
    async (payload: TRequirementTypeConfigurationPayload) => {
      if (!workspaceSlug || !requirementTypeId) throw new Error("Requirement type is required.");
      setIsMutating(true);
      try {
        const response = await requirementTypeService.updateConfiguration(workspaceSlug, requirementTypeId, payload);
        setConfiguration(response);
        onRequirementTypeUpdate?.(response.requirement_type);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [onRequirementTypeUpdate, requirementTypeId, workspaceSlug]
  );

  return {
    configuration,
    isConfigurationLoading,
    isMutating,
    configurationError,
    fetchConfiguration,
    updateConfiguration,
  };
};
