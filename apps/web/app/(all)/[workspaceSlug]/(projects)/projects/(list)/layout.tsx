/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Outlet } from "react-router";
// plane imports
import { WORKSPACE_PROJECT_VIEW_PERMISSION_KEY } from "@plane/constants";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
// local components
import { ProjectsListHeader } from "@/plane-web/components/projects/header";
import { ProjectsListMobileHeader } from "@/plane-web/components/projects/mobile-header";

const ProjectListLayout = observer(function ProjectListLayout() {
  const { workspaceSlug } = useParams();
  const { workspaceInfoBySlug, allowWorkspacePermissionKeys } = useUserPermissions();

  const resolvedWorkspaceSlug = workspaceSlug?.toString();
  const workspaceInfo = resolvedWorkspaceSlug ? workspaceInfoBySlug(resolvedWorkspaceSlug) : undefined;
  const canViewProjects = Boolean(
    resolvedWorkspaceSlug &&
    allowWorkspacePermissionKeys([WORKSPACE_PROJECT_VIEW_PERMISSION_KEY], resolvedWorkspaceSlug)
  );

  if (!resolvedWorkspaceSlug || !workspaceInfo) return null;
  if (!canViewProjects) return <NotAuthorizedView section="general" className="h-auto" />;

  return (
    <>
      <AppHeader header={<ProjectsListHeader />} mobileHeader={<ProjectsListMobileHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
});

export default ProjectListLayout;
