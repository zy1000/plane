import { useCallback, useEffect, useState } from "react";
import type { TProductSet, TProductSetPayload } from "@plane/types";
import { ProductSetService } from "@/services/product-set.service";

const productSetService = new ProductSetService();

/** 后端的业务拒绝：{ error, code, ... } 或序列化器的 { 字段: [错误码] } */
export type TProductSetRequestError = { error?: string; code?: string } & Record<string, unknown>;

/**
 * 产品集列表 + 增删改。汇总数字（集内产品、需求数…）只有列表接口给，所以每次写操作后整份重拉，
 * 不在本地拼；产品集数量少，重拉一次的代价可以忽略。
 */
export const useProductSets = (workspaceSlug: string | undefined) => {
  const [productSets, setProductSets] = useState<TProductSet[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug));
  const [hasError, setHasError] = useState(false);

  const fetchProductSets = useCallback(async () => {
    if (!workspaceSlug) return [];
    setHasError(false);
    try {
      const response = await productSetService.list(workspaceSlug);
      setProductSets(response);
      return response;
    } catch (requestError) {
      setHasError(true);
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [workspaceSlug]);

  useEffect(() => {
    void fetchProductSets().catch(() => undefined);
  }, [fetchProductSets]);

  const createProductSet = useCallback(
    async (payload: TProductSetPayload) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      const created = await productSetService.create(workspaceSlug, payload);
      await fetchProductSets();
      return created;
    },
    [fetchProductSets, workspaceSlug]
  );

  const updateProductSet = useCallback(
    async (productSetId: string, payload: Partial<TProductSetPayload>) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      await productSetService.update(workspaceSlug, productSetId, payload);
      await fetchProductSets();
    },
    [fetchProductSets, workspaceSlug]
  );

  const deleteProductSet = useCallback(
    async (productSetId: string) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      await productSetService.remove(workspaceSlug, productSetId);
      setProductSets((current) => current.filter((productSet) => productSet.id !== productSetId));
    },
    [workspaceSlug]
  );

  return {
    productSets,
    isLoading,
    hasError,
    fetchProductSets,
    createProductSet,
    updateProductSet,
    deleteProductSet,
  };
};
