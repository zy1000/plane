import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Outlet } from "react-router";
import { ProductsProvider } from "@/components/products";
import { useUserPermissions } from "@/hooks/store/user";

const ProductsLayout = observer(function ProductsLayout() {
  const { workspaceSlug } = useParams();
  const { workspaceInfoBySlug } = useUserPermissions();
  const slug = workspaceSlug?.toString();

  if (!slug || !workspaceInfoBySlug(slug)) return null;

  return (
    <ProductsProvider workspaceSlug={slug}>
      <Outlet />
    </ProductsProvider>
  );
});

export default ProductsLayout;
