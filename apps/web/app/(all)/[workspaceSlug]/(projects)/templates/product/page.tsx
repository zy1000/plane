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
  const { canViewLibraries, canViewCaseTemplates } = useTemplatePermissions(workspaceSlug);

  // 产品模板同时服务标准需求库与模板用例库：任一读权限即可（后端同口径）
  if (workspaceInfoBySlug(workspaceSlug) && !canViewLibraries && !canViewCaseTemplates)
    return <NotAuthorizedView className="h-full" />;

  return <ProductCategoriesPage workspaceSlug={workspaceSlug} />;
});

export default function TemplateProductCategoriesRoutePage({ params }: Route.ComponentProps) {
  return <TemplateProductCategoriesPage workspaceSlug={params.workspaceSlug} />;
}
