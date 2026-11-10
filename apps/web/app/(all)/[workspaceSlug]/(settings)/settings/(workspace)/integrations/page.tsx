import { observer } from "mobx-react";
// plane imports
import { PERMISSION_KEYS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { IntegrationsRoot } from "@/components/workspace/settings/integrations";
// hooks
import { useExternalIntegrations } from "@/hooks/store/use-external-integrations";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { IntegrationsWorkspaceSettingsHeader } from "./header";

const WorkspaceIntegrationsPage = observer(function WorkspaceIntegrationsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { t } = useTranslation();
  const { allowWorkspacePermissionKeys, workspaceUserInfo } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();

  // 侧边栏只是隐藏入口，直接敲 URL 仍能进来：与后端列表 / 同步接口的 key 一一对应再判一次
  const canView = allowWorkspacePermissionKeys(
    [PERMISSION_KEYS.WORKSPACE_INTEGRATION_VIEW, PERMISSION_KEYS.WORKSPACE_INTEGRATION_MANAGE],
    workspaceSlug
  );
  const canSync = allowWorkspacePermissionKeys([PERMISSION_KEYS.WORKSPACE_INTEGRATION_MANAGE], workspaceSlug);
  const integrationsState = useExternalIntegrations(canView ? workspaceSlug : undefined);

  if (workspaceUserInfo[workspaceSlug] && !canView)
    return <NotAuthorizedView section="settings" className="h-auto" />;

  return (
    <SettingsContentWrapper header={<IntegrationsWorkspaceSettingsHeader />} hugging>
      <PageHead
        title={
          currentWorkspace?.name
            ? `${currentWorkspace.name} - ${t("workspace_settings.settings.integrations.title")}`
            : undefined
        }
      />
      <IntegrationsRoot workspaceSlug={workspaceSlug} canSync={canSync} {...integrationsState} />
    </SettingsContentWrapper>
  );
});

export default WorkspaceIntegrationsPage;
