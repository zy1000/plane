import { observer } from "mobx-react";
// plane imports
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
  const { workspaceInfoBySlug } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();

  // 后端对工作区成员读写全开（同数据字典），这里只看是否是成员
  const canEdit = Boolean(workspaceSlug && workspaceInfoBySlug(workspaceSlug));

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
