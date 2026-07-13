import { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Outlet } from "react-router";
import { useProducts } from "@/hooks/store/use-products";
import type { TWorkspaceProduct } from "@/services/product.service";
import { ProductNavigation } from "./product-navigation";

export type TProductDetailOutletContext = {
  product: TWorkspaceProduct | null;
  isLoading: boolean;
  error: unknown;
  refetchProduct: () => Promise<TWorkspaceProduct | undefined>;
};

export const ProductDetailLayout = observer(function ProductDetailLayout() {
  const { productId, workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString();
  const id = productId?.toString();
  const { error, fetchProduct, isLoading, product } = useProducts(slug);

  useEffect(() => {
    if (id) void fetchProduct(id).catch(() => undefined);
  }, [fetchProduct, id]);

  if (!slug || !id) return null;

  const refetchProduct = () => fetchProduct(id);

  return (
    <>
      <ProductNavigation workspaceSlug={slug} productId={id} productName={product?.name} isLoading={isLoading} />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet context={{ product, isLoading, error, refetchProduct } satisfies TProductDetailOutletContext} />
      </div>
    </>
  );
});
