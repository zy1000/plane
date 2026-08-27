import { useCallback, useEffect, useState } from "react";
import type { TProductReleasesResponse } from "@plane/types";
import { ReleaseService } from "@/services/release.service";

const releaseService = new ReleaseService();

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const payload = error as { error?: string; detail?: string };
    return payload.error ?? payload.detail ?? "Unable to load releases.";
  }
  return "Unable to load releases.";
};

const EMPTY_RESPONSE: TProductReleasesResponse = { linked_project_count: 0, releases: [] };

/**
 * 本产品关联项目下的发布单聚合。
 *
 * 发布单是项目级资源，这一侧刻意只读：建单、改单都在项目侧完成，产品页只提供
 * 跨项目的观察视角。响应里带 linked_project_count 用于区分「产品还没关联项目」
 * 和「关联项目暂无发布单」两档空态。
 */
export const useProductReleases = ({
  workspaceSlug,
  productId,
}: {
  workspaceSlug: string | undefined;
  productId: string | undefined;
}) => {
  const [data, setData] = useState<TProductReleasesResponse>(EMPTY_RESPONSE);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && productId));
  const [error, setError] = useState<string | null>(null);

  const fetchReleases = useCallback(async () => {
    if (!workspaceSlug || !productId) return EMPTY_RESPONSE;
    setIsLoading(true);
    setError(null);
    try {
      const response = await releaseService.getProductReleases(workspaceSlug, productId);
      setData(response ?? EMPTY_RESPONSE);
      return response;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [productId, workspaceSlug]);

  useEffect(() => {
    void fetchReleases().catch(() => undefined);
  }, [fetchReleases]);

  return { data, isLoading, error, fetchReleases };
};
