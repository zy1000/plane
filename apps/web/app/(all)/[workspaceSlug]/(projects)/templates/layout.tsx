import { observer } from "mobx-react";
import { Outlet, useLocation } from "react-router";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { TemplateCenterProvider, TemplateRail, useTemplatePermissions } from "@/components/template-management";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/layout";

/**
 * 库内页（某个需求库 / 用例库 / 用例详情）本身就有模块树 + 宽表格，再挂 240px 左栏太挤，
 * 这些页只留顶栏面包屑回到列表。
 */
const ASSET_DETAIL_PATH = /\/templates\/(libraries|test-cases)\/[^/]+/;

const TemplateManagementLayout = observer(function TemplateManagementLayout({ workspaceSlug }: { workspaceSlug: string }) {
  const { pathname } = useLocation();
  const { workspaceInfoBySlug } = useUserPermissions();
  const { canAccessTemplates } = useTemplatePermissions(workspaceSlug);

  // 权限还没拉回来时不要闪一下「无权访问」
  if (workspaceInfoBySlug(workspaceSlug) && !canAccessTemplates) {
    return <NotAuthorizedView className="h-full" />;
  }

  return (
    <TemplateCenterProvider workspaceSlug={workspaceSlug}>
      <div className="flex h-full w-full overflow-hidden">
        {!ASSET_DETAIL_PATH.test(pathname) && <TemplateRail workspaceSlug={workspaceSlug} />}
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
