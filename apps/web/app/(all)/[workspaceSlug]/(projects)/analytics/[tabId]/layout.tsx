/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Outlet } from "react-router";
// plane imports
import { WORKSPACE_ANALYTICS_VIEW_PERMISSION_KEY } from "@plane/constants";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { WorkspaceManagementNavigation } from "@/components/navigation/workspace-management-header";
// hooks
import { useUserPermissions } from "@/hooks/store/user";

const WorkspaceAnalyticsTabLayout = observer(function WorkspaceAnalyticsTabLayout() {
  const { workspaceSlug } = useParams();
  const { workspaceInfoBySlug, allowWorkspacePermissionKeys } = useUserPermissions();

  const resolvedWorkspaceSlug = workspaceSlug?.toString();
  const workspaceInfo = resolvedWorkspaceSlug ? workspaceInfoBySlug(resolvedWorkspaceSlug) : undefined;
  const canViewAnalytics = Boolean(
    resolvedWorkspaceSlug &&
    allowWorkspacePermissionKeys([WORKSPACE_ANALYTICS_VIEW_PERMISSION_KEY], resolvedWorkspaceSlug)
  );

  if (!resolvedWorkspaceSlug || !workspaceInfo) return null;
  if (!canViewAnalytics) return <NotAuthorizedView section="general" className="h-auto" />;

  return (
    <>
      <WorkspaceManagementNavigation />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
});

export default WorkspaceAnalyticsTabLayout;
