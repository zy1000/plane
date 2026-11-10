import { observer } from "mobx-react";
import { Link, Outlet } from "react-router";
// plane imports
import { getButtonStyling } from "@plane/propel/button";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { TemplateCenterProvider, TemplateRail, useTemplatePermissions } from "@/components/template-management";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/layout";

/**
 * 模板中心的左栏接管了工作区侧栏（(projects)/layout.tsx 在 /templates 下不渲染它），
 * 所以库内页（某个需求库 / 用例库 / 用例详情）也挂左栏；嫌挤可以把它收起成图标条。
 */
const TemplateManagementLayout = observer(function TemplateManagementLayout({ workspaceSlug }: { workspaceSlug: string }) {
  const { workspaceInfoBySlug } = useUserPermissions();
  const { canAccessTemplates } = useTemplatePermissions(workspaceSlug);

  // 权限还没拉回来时不要闪一下「无权访问」；这里没有工作区侧栏，要给一个回去的出口
  if (workspaceInfoBySlug(workspaceSlug) && !canAccessTemplates) {
    return (
      <NotAuthorizedView
        className="h-full"
        actionButton={
          <Link to={`/${workspaceSlug}/`} className={getButtonStyling("primary", "base")}>
            返回工作区
          </Link>
        }
      />
    );
  }

  return (
    <TemplateCenterProvider workspaceSlug={workspaceSlug}>
      <div className="flex h-full w-full overflow-hidden">
        <TemplateRail workspaceSlug={workspaceSlug} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </div>
      </div>
    </TemplateCenterProvider>
  );
});

export default function TemplateManagementRouteLayout({ params }: Route.ComponentProps) {
  return <TemplateManagementLayout workspaceSlug={params.workspaceSlug} />;
}
