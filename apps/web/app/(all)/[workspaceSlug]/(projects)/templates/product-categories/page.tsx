import { observer } from "mobx-react";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { useTemplatePermissions } from "@/components/template-management";
import { ProductCategoriesPage } from "@/components/template-management/product-categories";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";

const TemplateProductCategoriesPage = observer(function TemplateProductCategoriesPage({
  workspaceSlug,
}: {
  workspaceSlug: string;
}) {
  const { workspaceInfoBySlug } = useUserPermissions();
  const { canViewLibraries } = useTemplatePermissions(workspaceSlug);

  // 产品分类与标准需求库同一套读权限（后端同样 403）
  if (workspaceInfoBySlug(workspaceSlug) && !canViewLibraries) return <NotAuthorizedView className="h-full" />;

  return <ProductCategoriesPage workspaceSlug={workspaceSlug} />;
});

export default function TemplateProductCategoriesRoutePage({ params }: Route.ComponentProps) {
  return <TemplateProductCategoriesPage workspaceSlug={params.workspaceSlug} />;
}
