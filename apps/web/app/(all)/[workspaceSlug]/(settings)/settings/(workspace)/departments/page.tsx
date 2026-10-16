import { observer } from "mobx-react";
// plane imports
import { WORKSPACE_SETTINGS_EDIT_PERMISSION_KEY, WORKSPACE_SETTINGS_VIEW_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsFullBleedContentWrapper } from "@/components/settings/content-wrapper";
import { DepartmentsRoot } from "@/components/workspace/settings/departments";
// hooks
import { useDepartments } from "@/hooks/store/use-departments";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { DepartmentsWorkspaceSettingsHeader } from "./header";

const WorkspaceDepartmentsPage = observer(function WorkspaceDepartmentsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { t } = useTranslation();
  const { allowWorkspacePermissionKeys, workspaceUserInfo } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();

  // 与后端 GET departments（WORKSPACE_SETTINGS_VIEW）、同步接口（WORKSPACE_SETTINGS_EDIT）一一对应
  const canView = allowWorkspacePermissionKeys([WORKSPACE_SETTINGS_VIEW_PERMISSION_KEY], workspaceSlug);
  const canSync = allowWorkspacePermissionKeys([WORKSPACE_SETTINGS_EDIT_PERMISSION_KEY], workspaceSlug);
  const departmentsState = useDepartments(canView ? workspaceSlug : undefined);

  if (workspaceUserInfo[workspaceSlug] && !canView) return <NotAuthorizedView section="settings" className="h-auto" />;

  return (
    // 左树 + 右表各自滚动，要占满可用高度：用不套 ScrollArea 的全出血外壳
    <SettingsFullBleedContentWrapper header={<DepartmentsWorkspaceSettingsHeader />}>
      <PageHead
        title={currentWorkspace?.name ? `${currentWorkspace.name} - ${t("workspace_settings.settings.departments.title")}` : undefined}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-page-x py-6 lg:px-12">
        <DepartmentsRoot canSync={canSync} {...departmentsState} />
      </div>
    </SettingsFullBleedContentWrapper>
  );
});

export default WorkspaceDepartmentsPage;
