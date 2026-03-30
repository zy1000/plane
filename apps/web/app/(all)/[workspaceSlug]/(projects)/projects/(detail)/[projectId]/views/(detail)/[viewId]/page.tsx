/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
import { PROJECT_VIEWS_VIEW_PERMISSION_KEY } from "@plane/constants";
// assets
import emptyView from "@/app/assets/empty-state/view.svg?url";
// components
import { EmptyState } from "@/components/common/empty-state";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { ProjectViewLayoutRoot } from "@/components/issues/issue-layouts/roots/project-view-layout-root";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useProjectView } from "@/hooks/store/use-project-view";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import type { Route } from "./+types/page";

function ProjectViewIssuesPage({ params }: Route.ComponentProps) {
  // router
  const router = useAppRouter();
  const { workspaceSlug, projectId, viewId } = params;
  // store hooks
  const { fetchViewDetails, getViewById } = useProjectView();
  const { getProjectById } = useProject();
  const { allowProjectPermissionKeys, workspaceUserInfo } = useUserPermissions();
  // derived values
  const projectView = getViewById(viewId);
  const project = getProjectById(projectId);
  const pageTitle = project?.name && projectView?.name ? `${project?.name} - ${projectView?.name}` : undefined;

  const canViewViews = allowProjectPermissionKeys(
    [PROJECT_VIEWS_VIEW_PERMISSION_KEY],
    workspaceSlug,
    projectId
  );
  const shouldFetchViewDetails = !(workspaceUserInfo && !canViewViews);
  const { error } = useSWR(
    shouldFetchViewDetails ? `VIEW_DETAILS_${viewId}` : null,
    () => fetchViewDetails(workspaceSlug, projectId, viewId)
  );

  if (workspaceUserInfo && !canViewViews) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  if (error) {
    return (
      <EmptyState
        image={emptyView}
        title="View does not exist"
        description="The view you are looking for does not exist or you don't have permission to view it."
        primaryButton={{
          text: "View other views",
          onClick: () => router.push(`/${workspaceSlug}/projects/${projectId}/views`),
        }}
      />
    );
  }

  return (
    <>
      <PageHead title={pageTitle} />
      <ProjectViewLayoutRoot />
    </>
  );
}

export default observer(ProjectViewIssuesPage);
