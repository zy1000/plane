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
 * 与 useProjectProducts 查的是同一张关联表，只是方向相反。这一侧刻意只读：关联关系
 * 由项目自己维护（项目设置里挑产品），产品页越权改它会让「项目能引用哪些产品」的
 * 归属变得含糊，所以这里只暴露读取。
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

  return { links, isLoading, error, fetchProjects };
};
