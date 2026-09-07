import { observer } from "mobx-react";
import { Outlet } from "react-router";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { TemplateManagementTopNavigation, useTemplatePermissions } from "@/components/template-management";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/layout";

const TemplateManagementLayout = observer(function TemplateManagementLayout({ workspaceSlug }: { workspaceSlug: string }) {
  const { workspaceInfoBySlug } = useUserPermissions();
  const { canAccessTemplates } = useTemplatePermissions(workspaceSlug);

  // 权限还没拉回来时不要闪一下「无权访问」
  if (workspaceInfoBySlug(workspaceSlug) && !canAccessTemplates) {
    return <NotAuthorizedView className="h-full" />;
  }

  return (
    <>
      <TemplateManagementTopNavigation workspaceSlug={workspaceSlug} />
      <Outlet />
    </>
  );
});

export default function TemplateManagementRouteLayout({ params }: Route.ComponentProps) {
  return <TemplateManagementLayout workspaceSlug={params.workspaceSlug} />;
}
