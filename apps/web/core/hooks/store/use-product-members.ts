import { useCallback, useEffect, useState } from "react";
import { orderBy } from "lodash-es";
import type { TCreateProductMemberPayload, TProductMember } from "@plane/types";
import { ProductMemberService } from "@/services/product-member.service";

const productMemberService = new ProductMemberService();

export type TProductMemberBulkMutationResult = {
  succeededIds: string[];
  failures: {
    targetId: string;
    message: string;
  }[];
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return fallback;

  const errorRecord = error as Record<string, unknown>;
  const preferredValue = errorRecord.detail ?? errorRecord.error ?? errorRecord.member ?? errorRecord.custom_role_ids;
  if (typeof preferredValue === "string") return preferredValue;
  if (Array.isArray(preferredValue) && typeof preferredValue[0] === "string") return preferredValue[0];
  return fallback;
};

const sortByJoiningDate = (members: TProductMember[]) =>
  orderBy(members, [(member) => Date.parse(member.created_at) || 0], ["desc"]);

export const useProductMembers = (workspaceSlug: string | undefined, productId: string | undefined) => {
  const [members, setMembers] = useState<TProductMember[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(workspaceSlug && productId));
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!workspaceSlug || !productId) {
      setMembers([]);
      setIsLoading(false);
      return [];
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await productMemberService.list(workspaceSlug, productId);
      const sortedResponse = sortByJoiningDate(response);
      setMembers(sortedResponse);
      return sortedResponse;
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Product members could not be loaded."));
      throw requestError;
    } finally {
      setIsLoading(false);
    }
  }, [productId, workspaceSlug]);

  useEffect(() => {
    setMembers([]);
    void fetchMembers().catch(() => undefined);
  }, [fetchMembers]);

  const addMembers = useCallback(
    async (payloads: TCreateProductMemberPayload[]): Promise<TProductMemberBulkMutationResult> => {
      if (!workspaceSlug || !productId) throw new Error("Product scope is required.");

      const uniquePayloads = Array.from(new Map(payloads.map((payload) => [payload.member, payload])).values());
      const settledResults = await Promise.allSettled(
        uniquePayloads.map((payload) => productMemberService.create(workspaceSlug, productId, payload))
      );
      const createdMembers: TProductMember[] = [];
      const result: TProductMemberBulkMutationResult = { succeededIds: [], failures: [] };

      settledResults.forEach((settledResult, index) => {
        const targetId = uniquePayloads[index].member;
        if (settledResult.status === "fulfilled") {
          createdMembers.push(settledResult.value);
          result.succeededIds.push(targetId);
          return;
        }
        result.failures.push({
          targetId,
          message: getErrorMessage(settledResult.reason, "Product member could not be added."),
        });
      });

      if (createdMembers.length > 0) {
        setMembers((current) => {
          const createdMemberIds = new Set(createdMembers.map((member) => member.id));
          return sortByJoiningDate([
            ...createdMembers,
            ...current.filter((member) => !createdMemberIds.has(member.id)),
          ]);
        });
      }
      return result;
    },
    [productId, workspaceSlug]
  );

  const updateMemberRoles = useCallback(
    async (membershipId: number, customRoleIds: number[]) => {
      if (!workspaceSlug || !productId) throw new Error("Product scope is required.");
      const response = await productMemberService.updateRoles(workspaceSlug, productId, membershipId, {
        custom_role_ids: customRoleIds,
      });
      setMembers((current) => current.map((member) => (member.id === membershipId ? response : member)));
      return response;
    },
    [productId, workspaceSlug]
  );

  const removeMember = useCallback(
    async (membershipId: number) => {
      if (!workspaceSlug || !productId) throw new Error("Product scope is required.");
      await productMemberService.remove(workspaceSlug, productId, membershipId);
      setMembers((current) => current.filter((member) => member.id !== membershipId));
    },
    [productId, workspaceSlug]
  );

  return {
    members,
    isLoading,
    error,
    fetchMembers,
    addMembers,
    updateMemberRoles,
    removeMember,
  };
};
