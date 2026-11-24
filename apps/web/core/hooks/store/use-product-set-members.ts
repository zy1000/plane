import { useCallback, useEffect, useState } from "react";
import type { TProductSetMember } from "@plane/types";
import { ProductSetService } from "@/services/product-set.service";

const productSetService = new ProductSetService();

/** 产品集「产品」页签：集内产品列表 + 加入 / 移出。加入后整份重拉（行里的产品状态、加入时间由后端给）。 */
export const useProductSetMembers = (workspaceSlug: string | undefined, productSetId: string | undefined) => {
  const [members, setMembers] = useState<TProductSetMember[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && productSetId));
  const [hasError, setHasError] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!workspaceSlug || !productSetId) return;
    setHasError(false);
    try {
      setMembers(await productSetService.listMembers(workspaceSlug, productSetId));
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, [productSetId, workspaceSlug]);

  useEffect(() => {
    setIsLoading(true);
    void fetchMembers();
  }, [fetchMembers]);

  const addMembers = useCallback(
    async (productIds: string[]) => {
      if (!workspaceSlug || !productSetId) throw new Error("Product set is required.");
      setIsMutating(true);
      try {
        await productSetService.addMembers(workspaceSlug, productSetId, productIds);
        await fetchMembers();
      } finally {
        setIsMutating(false);
      }
    },
    [fetchMembers, productSetId, workspaceSlug]
  );

  const removeMember = useCallback(
    async (productId: string) => {
      if (!workspaceSlug || !productSetId) throw new Error("Product set is required.");
      setIsMutating(true);
      try {
        await productSetService.removeMember(workspaceSlug, productSetId, productId);
        setMembers((current) => current.filter((member) => member.id !== productId));
      } finally {
        setIsMutating(false);
      }
    },
    [productSetId, workspaceSlug]
  );

  return { members, isLoading, hasError, isMutating, fetchMembers, addMembers, removeMember };
};

/**
 * 产品集列表页上的加入 / 移出：列表一次显示多个产品集，不为每个集各拉一份成员，
 * 只调接口；调完由调用方重拉产品集列表和产品列表（两边的汇总、所属产品集都变了）。
 */
export const useProductSetMemberActions = (workspaceSlug: string | undefined) => {
  const [isMutating, setIsMutating] = useState(false);

  const run = useCallback(async (action: () => Promise<unknown>) => {
    setIsMutating(true);
    try {
      await action();
    } finally {
      setIsMutating(false);
    }
  }, []);

  const addMembers = useCallback(
    async (productSetId: string, productIds: string[]) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      await run(() => productSetService.addMembers(workspaceSlug, productSetId, productIds));
    },
    [run, workspaceSlug]
  );

  const removeMember = useCallback(
    async (productSetId: string, productId: string) => {
      if (!workspaceSlug) throw new Error("Workspace is required.");
      await run(() => productSetService.removeMember(workspaceSlug, productSetId, productId));
    },
    [run, workspaceSlug]
  );

  return { isMutating, addMembers, removeMember };
};
