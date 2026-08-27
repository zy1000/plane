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
import { useTranslation } from "@plane/i18n";
import { ArchiveIcon } from "@plane/propel/icons";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { WorkspaceManagementNavigation } from "@/components/navigation/workspace-management-header";
// hooks
import { useUserPermissions } from "@/hooks/store/user";

const WorkspaceArchivesLayout = observer(function WorkspaceArchivesLayout() {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
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
      <WorkspaceManagementNavigation icon={<ArchiveIcon className="size-4 flex-shrink-0" />} title={t("archives")} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
});

export default WorkspaceArchivesLayout;
