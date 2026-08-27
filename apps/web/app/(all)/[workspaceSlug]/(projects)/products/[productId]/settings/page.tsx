import { Navigate, useParams } from "react-router";
import { getProductSettingsPath } from "@/components/products/settings/navigation";

export default function ProductSettingsPage() {
  const { workspaceSlug, productId } = useParams();

  if (!workspaceSlug || !productId) return null;

  return <Navigate to={getProductSettingsPath(workspaceSlug, productId)} replace />;
}
