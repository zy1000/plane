import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  TCreateProductRequirementPayload,
  TRequirement,
  TRequirementStatus,
  TUpdateProductRequirementPayload,
} from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load product requirements.";
  }
  return "Unable to load product requirements.";
};

export const useProductRequirements = (workspaceSlug: string | undefined, productId: string | undefined) => {
  const [requirements, setRequirements] = useState<TRequirement[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && productId));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilters, setStatusFilters] = useState<TRequirementStatus[]>([]);
  const [ownerFilters, setOwnerFilters] = useState<string[]>([]);
  const [pendingMyApprovalOnly, setPendingMyApprovalOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);

  const upsertRequirement = useCallback((requirement: TRequirement) => {
    setRequirements((current) => {
      const exists = current.some((item) => item.id === requirement.id);
      return exists
        ? current.map((item) => (item.id === requirement.id ? requirement : item))
        : [requirement, ...current];
    });
  }, []);

  const fetchRequirements = useCallback(async () => {
    if (!workspaceSlug || !productId) {
      setRequirements([]);
      setIsLoading(false);
      return [];
    }
    setIsLoading(true);
    setError(null);
    try {
      const response = await requirementService.listProductRequirements(workspaceSlug, productId);
      setRequirements(response);
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [productId, workspaceSlug]);

  useEffect(() => {
    setRequirements([]);
    setPage(1);
    void fetchRequirements().catch(() => undefined);
  }, [fetchRequirements]);

  useEffect(() => setPage(1), [ownerFilters, perPage, search, statusFilters]);

  const createRequirement = useCallback(
    async (payload: TCreateProductRequirementPayload) => {
      if (!workspaceSlug || !productId) throw new Error("Product scope is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.createProductRequirement(workspaceSlug, {
          ...payload,
          product_id: productId,
        });
        upsertRequirement(response);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [productId, upsertRequirement, workspaceSlug]
  );

  const updateRequirement = useCallback(
    async (requirementId: string, payload: TUpdateProductRequirementPayload) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        const response = await requirementService.updateProductRequirement(workspaceSlug, requirementId, payload);
        upsertRequirement(response);
        return response;
      } finally {
        setIsMutating(false);
      }
    },
    [upsertRequirement, workspaceSlug]
  );

  const deleteRequirement = useCallback(
    async (requirementId: string) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      setIsMutating(true);
      try {
        await requirementService.deleteProductRequirement(workspaceSlug, requirementId);
        setRequirements((current) => current.filter((item) => item.id !== requirementId));
      } finally {
        setIsMutating(false);
      }
    },
    [workspaceSlug]
  );

  const filteredRequirements = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return requirements.filter((requirement) => {
      const plainDescription = (requirement.description_html ?? "").replace(/<[^>]+>/g, " ");
      const matchesSearch =
        !normalizedSearch || `${requirement.title} ${plainDescription}`.toLocaleLowerCase().includes(normalizedSearch);
      const matchesStatus = statusFilters.length === 0 || statusFilters.includes(requirement.status);
      const matchesOwner = ownerFilters.length === 0 || ownerFilters.includes(requirement.owner_id);
      const matchesApproval = !pendingMyApprovalOnly || requirement.can_approve;
      return matchesSearch && matchesStatus && matchesOwner && matchesApproval;
    });
  }, [ownerFilters, pendingMyApprovalOnly, requirements, search, statusFilters]);

  const totalPages = Math.max(1, Math.ceil(filteredRequirements.length / perPage));
  const safePage = Math.min(page, totalPages);
  const paginatedRequirements = filteredRequirements.slice((safePage - 1) * perPage, safePage * perPage);

  return {
    requirements,
    filteredRequirements,
    paginatedRequirements,
    isLoading,
    isMutating,
    error,
    search,
    statusFilters,
    ownerFilters,
    pendingMyApprovalOnly,
    page: safePage,
    perPage,
    totalPages,
    setSearch,
    setStatusFilters,
    setOwnerFilters,
    setPendingMyApprovalOnly,
    setPage,
    setPerPage,
    fetchRequirements,
    createRequirement,
    updateRequirement,
    deleteRequirement,
    upsertRequirement,
  };
};
