import { useParams } from "react-router";
import { ProductRequirementDetailPage, ProductRequirementsProvider } from "@/components/products/requirements";

export default function ProductRequirementDetailRoutePage() {
  const { workspaceSlug, productId } = useParams();
  if (!workspaceSlug || !productId) return null;
  return (
    <ProductRequirementsProvider workspaceSlug={workspaceSlug} productId={productId}>
      <ProductRequirementDetailPage />
    </ProductRequirementsProvider>
  );
}
