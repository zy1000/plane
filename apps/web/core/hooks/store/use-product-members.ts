import { useCallback } from "react";
import { orderBy } from "lodash-es";
import useSWR from "swr";
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

const EMPTY_MEMBERS: TProductMember[] = [];

const sortByJoiningDate = (members: TProductMember[]) =>
  orderBy(members, [(member) => Date.parse(member.created_at) || 0], ["desc"]);

/**
 * 产品成员列表的 SWR key。同一产品的多个调用点（成员设置页 / 通用设置 / 产品编辑弹窗）
 * 共用一次请求 —— 组件内各存一份 state 会让它们各拉一遍。
 */
export const getProductMembersKey = (workspaceSlug: string, productId: string) =>
  `product-members-${workspaceSlug}-${productId}`;

export const useProductMembers = (workspaceSlug: string | undefined, productId: string | undefined) => {
  // 收成一个 const：TS 不会把函数参数的窄化带进下面的 fetcher 闭包
  const scope = workspaceSlug && productId ? { workspaceSlug, productId } : null;

  const { data, error, isLoading, mutate } = useSWR(
    scope ? getProductMembersKey(scope.workspaceSlug, scope.productId) : null,
    scope
      ? async () => sortByJoiningDate(await productMemberService.list(scope.workspaceSlug, scope.productId))
      : null,
    // 成员变动很低频，且增删改都就地并进缓存，不必切回标签页就重拉
    { revalidateOnFocus: false }
  );

  const members = data ?? EMPTY_MEMBERS;

  const fetchMembers = useCallback(async () => (await mutate()) ?? EMPTY_MEMBERS, [mutate]);

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

      // 新增的行就地并进缓存，不回源重拉（与改角色/移除一致）
      if (createdMembers.length > 0) {
        await mutate(
          (current = EMPTY_MEMBERS) => {
            const createdMemberIds = new Set(createdMembers.map((member) => member.id));
            return sortByJoiningDate([
              ...createdMembers,
              ...current.filter((member) => !createdMemberIds.has(member.id)),
            ]);
          },
          { revalidate: false }
        );
      }
      return result;
    },
    [mutate, productId, workspaceSlug]
  );

  const updateMemberRoles = useCallback(
    async (membershipId: number, customRoleIds: number[]) => {
      if (!workspaceSlug || !productId) throw new Error("Product scope is required.");
      const response = await productMemberService.updateRoles(workspaceSlug, productId, membershipId, {
        custom_role_ids: customRoleIds,
      });
      await mutate(
        (current = EMPTY_MEMBERS) => current.map((member) => (member.id === membershipId ? response : member)),
        { revalidate: false }
      );
      return response;
    },
    [mutate, productId, workspaceSlug]
  );

  const removeMember = useCallback(
    async (membershipId: number) => {
      if (!workspaceSlug || !productId) throw new Error("Product scope is required.");
      await productMemberService.remove(workspaceSlug, productId, membershipId);
      await mutate((current = EMPTY_MEMBERS) => current.filter((member) => member.id !== membershipId), {
        revalidate: false,
      });
    },
    [mutate, productId, workspaceSlug]
  );

  return {
    members,
    isLoading,
    error: error ? getErrorMessage(error, "Product members could not be loaded.") : null,
    fetchMembers,
    addMembers,
    updateMemberRoles,
    removeMember,
  };
};
