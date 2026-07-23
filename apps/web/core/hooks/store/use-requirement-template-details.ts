import { useCallback, useEffect, useState } from "react";
import type {
  TRequirement,
  TRequirementConfiguration,
  TRequirementConfigurationPayload,
  TRequirementDetailBatchSavePayload,
  TRequirementDetailData,
  TRequirementDetailFilter,
  TRequirementDetailsResponse,
} from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load the requirement template.";
  }
  return "Unable to load the requirement template.";
};

const EMPTY_PAGE: TRequirementDetailsResponse = {
  results: [],
  total_count: 0,
  total_pages: 0,
  count: 0,
};

export const useRequirementTemplateDetails = ({
  workspaceSlug,
  templateId,
  onTemplateUpdate,
}: {
  workspaceSlug: string | undefined;
  templateId: string | undefined;
  onTemplateUpdate?: (template: TRequirement) => void;
}) => {
  const [configuration, setConfiguration] = useState<TRequirementConfiguration | null>(null);
  const [detailsPage, setDetailsPage] = useState<TRequirementDetailsResponse>(EMPTY_PAGE);
  const [isConfigurationLoading, setIsConfigurationLoading] = useState(Boolean(workspaceSlug && templateId));
  const [isDetailsLoading, setIsDetailsLoading] = useState(Boolean(workspaceSlug && templateId));
  const [isMutating, setIsMutating] = useState(false);
  const [configurationError, setConfigurationError] = useState<string | null>(null);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<TRequirementDetailFilter[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [perPage, setPerPage] = useState(20);

  const fetchConfiguration = useCallback(async () => {
    if (!workspaceSlug || !templateId) return null;
    setIsConfigurationLoading(true);
    setConfigurationError(null);
    try {
      const response = await requirementService.getConfiguration(workspaceSlug, templateId);
      setConfiguration(response);
      onTemplateUpdate?.(response.requirement);
      return response;
    } catch (requestError) {
      setConfigurationError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsConfigurationLoading(false);
    }
  }, [onTemplateUpdate, templateId, workspaceSlug]);

  const fetchDetails = useCallback(async () => {
    if (!workspaceSlug || !templateId) return EMPTY_PAGE;
    setIsDetailsLoading(true);
    setDetailsError(null);
    try {
      const response = await requirementService.listDetails(workspaceSlug, templateId, {
        cursor,
        perPage,
        search,
        filters,
      });
      setDetailsPage(response);
      return response;
    } catch (requestError) {
      setDetailsError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsDetailsLoading(false);
    }
  }, [cursor, filters, perPage, search, templateId, workspaceSlug]);

  useEffect(() => {
    setConfiguration(null);
    setDetailsPage(EMPTY_PAGE);
    setCursor(undefined);
    void fetchConfiguration().catch(() => undefined);
  }, [fetchConfiguration]);

  useEffect(() => {
    void fetchDetails().catch(() => undefined);
  }, [fetchDetails]);

  const updateConfiguration = useCallback(
    async (payload: TRequirementConfigurationPayload) => {
      if (!workspaceSlug || !templateId) throw new Error("Requirement template is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.updateConfiguration(workspaceSlug, templateId, payload);
        setConfiguration(response);
        onTemplateUpdate?.(response.requirement);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [onTemplateUpdate, templateId, workspaceSlug]
  );

  const createDetail = useCallback(
    async (data: TRequirementDetailData, position: { before_id?: string; after_id?: string } = {}) => {
      if (!workspaceSlug || !templateId) throw new Error("Requirement template is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.createDetail(workspaceSlug, templateId, { data, ...position });
        await fetchDetails();
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchDetails, templateId, workspaceSlug]
  );

  const updateDetail = useCallback(
    async (detailId: string, data: TRequirementDetailData, version: number) => {
      if (!workspaceSlug || !templateId) throw new Error("Requirement template is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.updateDetail(workspaceSlug, templateId, detailId, {
          data,
          version,
        });
        setDetailsPage((current) => ({
          ...current,
          results: current.results.map((item) => (item.id === response.id ? response : item)),
        }));
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [templateId, workspaceSlug]
  );

  const deleteDetails = useCallback(
    async (detailIds: string[]) => {
      if (!workspaceSlug || !templateId) throw new Error("Requirement template is required.");
      if (!detailIds.length) return;
      setIsMutating(true);
      try {
        if (detailIds.length === 1) {
          await requirementService.deleteDetail(workspaceSlug, templateId, detailIds[0]);
        } else {
          await requirementService.bulkDeleteDetails(workspaceSlug, templateId, detailIds);
        }
        await fetchDetails();
      } finally {
        setIsMutating(false);
      }
    },
    [fetchDetails, templateId, workspaceSlug]
  );

  const saveDetailBatch = useCallback(
    async (payload: TRequirementDetailBatchSavePayload) => {
      if (!workspaceSlug || !templateId) throw new Error("Requirement template is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.bulkSaveDetails(workspaceSlug, templateId, payload);
        await fetchDetails();
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [fetchDetails, templateId, workspaceSlug]
  );

  const updateSearch = useCallback((value: string) => {
    setCursor(undefined);
    setSearch(value);
  }, []);
  const updateFilters = useCallback((value: TRequirementDetailFilter[]) => {
    setCursor(undefined);
    setFilters(value);
  }, []);
  const updatePerPage = useCallback((value: number) => {
    setCursor(undefined);
    setPerPage(value);
  }, []);

  return {
    configuration,
    detailsPage,
    isConfigurationLoading,
    isDetailsLoading,
    isMutating,
    configurationError,
    detailsError,
    search,
    filters,
    cursor,
    perPage,
    setSearch: updateSearch,
    setFilters: updateFilters,
    setCursor,
    setPerPage: updatePerPage,
    fetchConfiguration,
    fetchDetails,
    updateConfiguration,
    createDetail,
    updateDetail,
    deleteDetails,
    saveDetailBatch,
  };
};
