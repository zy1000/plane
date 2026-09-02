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
    return payload.error ?? payload.detail ?? "Unable to load linked products.";
  }
  return "Unable to load linked products.";
};

const EMPTY_LINKS: TProductProject[] = [];

/** 关联产品列表的 SWR key。项目「产品」页与项目需求页左栏共用同一份数据 */
export const getProjectProductsKey = (workspaceSlug: string, projectId: string) =>
  `project-products-${workspaceSlug}-${projectId}`;

/**
 * 项目关联的产品。
 *
 * 这层关系没有独立的业务语义，它只回答「本项目能引用哪些产品的需求」—— 需求关联
 * 弹窗的候选池就是按它过滤的。所以项目需求页也要用它：一个产品都没关联时，候选池
 * 必然为空，空态该说的是「先去关联产品」而不是「没有需求」。增删在项目「产品」页。
 *
 * 与产品侧 useProductProjects 同一套 SWR 写法：增删后 mutate 只换数据不亮骨架屏，
 * isLoading 只在首次加载为 true。
 */
export const useProjectProducts = ({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string | undefined;
  projectId: string | undefined;
}) => {
  const [isMutating, setIsMutating] = useState(false);

  // 收成一个 const：TS 不会把函数参数的窄化带进下面的 fetcher 闭包
  const scope = workspaceSlug && projectId ? { workspaceSlug, projectId } : null;

  const { data, error, isLoading, mutate } = useSWR(
    scope ? getProjectProductsKey(scope.workspaceSlug, scope.projectId) : null,
    scope
      ? async () => {
          try {
            return await requirementService.listProjectProducts(scope.workspaceSlug, scope.projectId);
          } catch (requestError) {
            // service 层抛的是 error?.response?.data：断网 / 超时没有 response，会抛出 undefined，
            // SWR 的 error 也就是空的 —— 产品页会把「加载失败」误画成「没有关联产品」空态
            throw requestError ?? new Error("Unable to load linked products.");
          }
        }
      : null,
    // 关联关系变动很低频，且增删都走 updateProducts 主动 mutate，不必切回标签页就重拉
    { revalidateOnFocus: false }
  );

  const links = data ?? EMPTY_LINKS;

  const fetchProducts = useCallback(async () => (await mutate()) ?? EMPTY_LINKS, [mutate]);

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
      } finally {
        // 后端的增删不是原子的：混合提交撞上 409（产品下还有需求）时新增的那部分已经
        // 落库。无论成败都刷一次，列表与弹窗的分组才是真实状态；刷新自身出错由 SWR
        // 记进 error，不盖住原错误
        await mutate().catch(() => undefined);
        setIsMutating(false);
      }
    },
    [mutate, projectId, workspaceSlug]
  );

  return {
    links,
    isLoading,
    isMutating,
    error: error ? getErrorMessage(error) : null,
    fetchProducts,
    updateProducts,
  };
};
