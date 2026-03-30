import { observer } from "mobx-react";
import { PROJECT_RELEASES_VIEW_PERMISSION_KEY } from "@plane/constants";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { useUserPermissions } from "@/hooks/store/user";
import { ModuleDetailContent } from "@/components/modules/module-detail-content";
import type { Route } from "./+types/page";

function ModuleOverviewEntryPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId, moduleId } = params;
  const { allowProjectPermissionKeys, workspaceUserInfo } = useUserPermissions();
  const canViewReleases = allowProjectPermissionKeys(
    [PROJECT_RELEASES_VIEW_PERMISSION_KEY],
    workspaceSlug,
    projectId
  );

  if (workspaceUserInfo && !canViewReleases) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  return (
    <>
      <PageHead title="Module Overview" />
      {moduleId ? <ModuleDetailContent moduleId={moduleId.toString()} isOpen /> : null}
    </>
  );
}

export default observer(ModuleOverviewEntryPage);
