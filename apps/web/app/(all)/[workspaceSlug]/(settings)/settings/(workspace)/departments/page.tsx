import { observer } from "mobx-react";
// plane imports
import { PERMISSION_KEYS } from "@plane/constants";
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

  // 与后端部门树 / 人员接口同一口径；同步接口对人员名单认部门管理或集成管理
  const canView = allowWorkspacePermissionKeys(
    [PERMISSION_KEYS.WORKSPACE_DEPARTMENT_VIEW, PERMISSION_KEYS.WORKSPACE_DEPARTMENT_MANAGE],
    workspaceSlug
  );
  const canSync = allowWorkspacePermissionKeys(
    [PERMISSION_KEYS.WORKSPACE_DEPARTMENT_MANAGE, PERMISSION_KEYS.WORKSPACE_INTEGRATION_MANAGE],
    workspaceSlug
  );
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
