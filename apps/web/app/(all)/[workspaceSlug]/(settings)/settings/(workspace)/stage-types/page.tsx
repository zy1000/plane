import { observer } from "mobx-react";
// plane imports
import { PERMISSION_KEYS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// components
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { StageTypesRoot } from "@/components/workspace/settings/stage-types";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { StageTypesWorkspaceSettingsHeader } from "./header";

const WorkspaceStageTypesPage = observer(function WorkspaceStageTypesPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { t } = useTranslation();
  const { allowWorkspacePermissionKeys } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();

  // 与后端写接口同一把 key
  const canEdit = allowWorkspacePermissionKeys([PERMISSION_KEYS.WORKSPACE_STAGE_TYPE_MANAGE], workspaceSlug);

  return (
    <SettingsContentWrapper header={<StageTypesWorkspaceSettingsHeader />}>
      <PageHead
        title={
          currentWorkspace?.name
            ? `${currentWorkspace.name} - ${t("workspace_settings.settings.stage_types.title")}`
            : undefined
        }
      />
      <StageTypesRoot workspaceSlug={workspaceSlug} canEdit={canEdit} />
    </SettingsContentWrapper>
  );
});

export default WorkspaceStageTypesPage;
