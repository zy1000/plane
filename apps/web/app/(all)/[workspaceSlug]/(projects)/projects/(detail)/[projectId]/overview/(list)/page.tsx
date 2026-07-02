"use client";

import { observer } from "mobx-react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
// plane imports
import { EUserPermissionsLevel, PROJECT_OVERVIEW_VIEW_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EUserProjectRoles, type TPageNavigationTabs } from "@plane/types";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { DetailedEmptyState } from "@/components/empty-state/detailed-empty-state-root";
import { PagesListRoot } from "@/components/pages/list/root";
import { PagesListView } from "@/components/pages/pages-list-view";
import { buildProjectSettingsPath, getPathWithSearch } from "@/components/settings/project/navigation";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { useResolvedAssetPath } from "@/hooks/use-resolved-asset-path";

// plane web hooks
import { EPageStoreType } from "@/plane-web/hooks/store";
import { OverviewListView } from "./OverviewList";

const ProjectPagesPage = observer(() => {
  // router
  const router = useAppRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const type = searchParams.get("type");
  const { workspaceSlug, projectId } = useParams();
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { getProjectById, currentProjectDetails } = useProject();
  const { allowPermissions, allowProjectPermissionKeys, workspaceUserInfo } = useUserPermissions();
  // derived values
  const project = getProjectById(projectId.toString());
  if (!project) return;
  const pageTitle = project?.name ? `${project?.name} - Overview` : undefined;
  const canPerformEmptyStateActions = allowPermissions([EUserProjectRoles.ADMIN], EUserPermissionsLevel.PROJECT);
  const resolvedPath = useResolvedAssetPath({ basePath: "/empty-state/disabled-feature/pages" });
  const currentPath = getPathWithSearch(pathname, searchParams);


  if (!workspaceSlug || !projectId) return <></>;

  const workspaceSlugString = workspaceSlug.toString();
  const projectIdString = projectId.toString();
  const canViewOverview = allowProjectPermissionKeys(
    [PROJECT_OVERVIEW_VIEW_PERMISSION_KEY],
    workspaceSlugString,
    projectIdString
  );

  if (workspaceUserInfo && !canViewOverview) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  // No access to cycle
  if (currentProjectDetails?.page_view === false)
    return (
      <div className="flex items-center justify-center h-full w-full">
        <DetailedEmptyState
          title={t("disabled_project.empty_state.page.title")}
          description={t("disabled_project.empty_state.page.description")}
          assetPath={resolvedPath}
          primaryButton={{
            text: t("disabled_project.empty_state.page.primary_button.text"),
            onClick: () => {
              router.push(
                buildProjectSettingsPath({
                  workspaceSlug: workspaceSlugString,
                  projectId: projectIdString,
                  settingsPath: "/features",
                  currentPath,
                })
              );
            },
            disabled: !canPerformEmptyStateActions,
          }}
        />
      </div>
    );
  return (
    <>
      <PageHead title={pageTitle} />

      <OverviewListView key={project.id} project={project} workspaceSlug={workspaceSlugString} />
    </>
  );
});

export default ProjectPagesPage;
