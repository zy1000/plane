import { Outlet, useParams } from "react-router";
import { ProductDetailsLayout } from "@/components/products";

export default function ProductDetailRouteLayout() {
  const { workspaceSlug, productId } = useParams();

  if (!workspaceSlug || !productId) return null;

  return (
    <ProductDetailsLayout workspaceSlug={workspaceSlug} productId={productId}>
      <Outlet />
    </ProductDetailsLayout>
  );
}
