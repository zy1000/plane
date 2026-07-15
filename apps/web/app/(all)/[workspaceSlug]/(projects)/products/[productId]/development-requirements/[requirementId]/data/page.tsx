import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useAppRouter } from "@/hooks/use-app-router";

export default function DevelopmentRequirementDataPage() {
  const { productId, requirementId, workspaceSlug } = useParams();
  const router = useAppRouter();

  useEffect(() => {
    if (!workspaceSlug || !productId || !requirementId) return;
    router.replace(`/${workspaceSlug}/products/${productId}/development-requirements/${requirementId}?tab=details`);
  }, [productId, requirementId, router, workspaceSlug]);

  return <div className="h-full animate-pulse bg-layer-1" />;
}
