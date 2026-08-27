import { Navigate, useParams } from "react-router";

export default function ProductDetailIndexPage() {
  const { workspaceSlug, productId } = useParams();

  if (!workspaceSlug || !productId) return null;

  return <Navigate to={`/${workspaceSlug}/products/${productId}/requirements`} replace />;
}
