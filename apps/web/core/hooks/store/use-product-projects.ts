import { useCallback, useState } from "react";
import useSWR from "swr";
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
 * 关联项目列表的 SWR key。
 *
 * 需求详情里有三处各自要这份数据（所属项目多选 / 关联区的项目菜单 / 按项目分组的工作项），
 * 走同一个 key 才能合成一次请求 —— 换回组件内 useState 会让它们各拉一遍。
 */
export const getProductProjectsKey = (workspaceSlug: string, productId: string) =>
  `product-projects-${workspaceSlug}-${productId}`;

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
  const [isMutating, setIsMutating] = useState(false);

  // 收成一个 const：TS 不会把函数参数的窄化带进下面的 fetcher 闭包
  const scope = workspaceSlug && productId ? { workspaceSlug, productId } : null;

  const { data, error, isLoading, mutate } = useSWR(
    scope ? getProductProjectsKey(scope.workspaceSlug, scope.productId) : null,
    scope ? () => requirementService.listProductProjects(scope.workspaceSlug, scope.productId) : null,
    // 关联关系变动很低频，且增删都走 updateProjects 主动 mutate，不必切回标签页就重拉
    { revalidateOnFocus: false }
  );

  const links = data ?? EMPTY_LINKS;

  const fetchProjects = useCallback(async () => (await mutate()) ?? EMPTY_LINKS, [mutate]);

  const updateProjects = useCallback(
    async (payload: { projects?: string[]; removed_projects?: string[] }) => {
      if (!workspaceSlug || !productId) throw new Error("Product is required.");
      setIsMutating(true);
      try {
        await requirementService.updateProductProjects(workspaceSlug, productId, payload);
        await mutate();
      } finally {
        setIsMutating(false);
      }
    },
    [mutate, productId, workspaceSlug]
  );

  return {
    links,
    isLoading,
    isMutating,
    error: error ? getErrorMessage(error) : null,
    fetchProjects,
    updateProjects,
  };
};
