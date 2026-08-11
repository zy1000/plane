import { useCallback, useEffect, useState } from "react";
import type { TProductProject } from "@plane/types";
import { RequirementService } from "@/services/requirement.service";

const requirementService = new RequirementService();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load linked products.";
  }
  return "Unable to load linked products.";
};

const EMPTY_LINKS: TProductProject[] = [];

/**
 * 项目关联的产品。
 *
 * 这层关系没有独立的业务语义，它只回答「本项目能引用哪些产品的需求」—— 需求关联
 * 弹窗的候选池就是按它过滤的。所以项目需求页也要用它：一个产品都没关联时，候选池
 * 必然为空，空态该说的是「先去关联产品」而不是「没有需求」。
 */
export const useProjectProducts = ({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string | undefined;
  projectId: string | undefined;
}) => {
  const [links, setLinks] = useState<TProductProject[]>(EMPTY_LINKS);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && projectId));
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    if (!workspaceSlug || !projectId) return EMPTY_LINKS;
    setIsLoading(true);
    setError(null);
    try {
      const response = await requirementService.listProjectProducts(workspaceSlug, projectId);
      setLinks(response ?? EMPTY_LINKS);
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, workspaceSlug]);

  useEffect(() => {
    void fetchProducts().catch(() => undefined);
  }, [fetchProducts]);

  /**
   * 一次调用同时增删，与工作项挂模块的接口同形。调用方用 lodash 的 xor 求差集，
   * 见 components/issues/issue-detail/module-select.tsx。
   */
  const updateProducts = useCallback(
    async (payload: { products?: string[]; removed_products?: string[] }) => {
      if (!workspaceSlug || !projectId) throw new Error("Project is required.");
      setIsMutating(true);
      try {
        await requirementService.updateProjectProducts(workspaceSlug, projectId, payload);
        await fetchProducts();
      } finally {
        setIsMutating(false);
      }
    },
    [fetchProducts, projectId, workspaceSlug]
  );

  return { links, isLoading, isMutating, error, fetchProducts, updateProducts };
};
