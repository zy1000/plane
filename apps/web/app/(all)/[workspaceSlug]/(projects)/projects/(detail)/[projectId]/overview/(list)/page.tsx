"use client";

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { PROJECT_OVERVIEW_VIEW_PERMISSION_KEY } from "@plane/constants";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { OverviewListView } from "./OverviewList";

const ProjectOverviewPage = observer(() => {
  const { workspaceSlug, projectId } = useParams();
  // store hooks
  const { getProjectById } = useProject();
  const { allowProjectPermissionKeys, workspaceUserInfo } = useUserPermissions();
  // derived values
  const project = getProjectById(projectId.toString());
  if (!project) return;
  const pageTitle = project?.name ? `${project?.name} - Overview` : undefined;

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

  return (
    <>
      <PageHead title={pageTitle} />

      <OverviewListView key={project.id} project={project} workspaceSlug={workspaceSlugString} />
    </>
  );
});

export default ProjectOverviewPage;
