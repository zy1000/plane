import useSWR from "swr";
import type { TProductOverview } from "@plane/types";
import { ProductService } from "@/services/product.service";

const productService = new ProductService();

export const getProductOverviewKey = (workspaceSlug: string, productId: string) =>
  `product-overview-${workspaceSlug}-${productId}`;

/**
 * 产品概览页的汇总数字（需求 / 测试）。
 *
 * 关联项目、发布两块不在这里：直接用 useProductProjects / useProductReleases，与对应页签共用
 * 同一份数据（关联项目走同一个 SWR key，切页签不重拉）。
 */
export const useProductOverview = ({
  workspaceSlug,
  productId,
}: {
  workspaceSlug: string | undefined;
  productId: string | undefined;
}) => {
  const scope = workspaceSlug && productId ? { workspaceSlug, productId } : null;

  const { data, error, isLoading } = useSWR<TProductOverview>(
    scope ? getProductOverviewKey(scope.workspaceSlug, scope.productId) : null,
    scope ? () => productService.getOverview(scope.workspaceSlug, scope.productId) : null,
    { revalidateOnFocus: false }
  );

  return { overview: data, isLoading, hasError: Boolean(error) };
};
