import { useCallback, useEffect, useState } from "react";
import type { TProductProject } from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load linked projects.";
  }
  return "Unable to load linked projects.";
};

const EMPTY_LINKS: TProductProject[] = [];

/**
 * 引用了本产品的项目。
 *
 * 与 useProjectProducts 查的是同一张关联表，只是方向相反。产品负责人可以在产品页
 * 增删关联；解除时若该项目下还有本产品需求，后端会 409。
 */
export const useProductProjects = ({
  workspaceSlug,
  productId,
}: {
  workspaceSlug: string | undefined;
  productId: string | undefined;
}) => {
  const [links, setLinks] = useState<TProductProject[]>(EMPTY_LINKS);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && productId));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    if (!workspaceSlug || !productId) return EMPTY_LINKS;
    setIsLoading(true);
    setError(null);
    try {
      const response = await requirementService.listProductProjects(workspaceSlug, productId);
      setLinks(response ?? EMPTY_LINKS);
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [productId, workspaceSlug]);

  useEffect(() => {
    void fetchProjects().catch(() => undefined);
  }, [fetchProjects]);

  const updateProjects = useCallback(
    async (payload: { projects?: string[]; removed_projects?: string[] }) => {
      if (!workspaceSlug || !productId) throw new Error("Product is required.");
      setIsMutating(true);
      try {
        await requirementService.updateProductProjects(workspaceSlug, productId, payload);
        await fetchProjects();
      } finally {
        setIsMutating(false);
      }
    },
    [fetchProjects, productId, workspaceSlug]
  );

  return { links, isLoading, isMutating, error, fetchProjects, updateProjects };
};
