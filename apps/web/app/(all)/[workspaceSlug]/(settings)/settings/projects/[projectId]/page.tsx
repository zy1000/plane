/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { PROJECT_SETTINGS } from "@plane/constants";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { ProjectDetailsForm } from "@/components/project/form";
import { ProjectDetailsFormLoader } from "@/components/project/form-loader";
import { ProjectSettingsReadOnly } from "@/components/project/settings/general";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { GeneralProjectSettingsHeader } from "./header";

function ProjectSettingsPage({ params }: Route.ComponentProps) {
  // router
  const { workspaceSlug, projectId } = params;
  // store hooks
  const { currentProjectDetails } = useProject();
  const { allowProjectPermissionKeys, workspaceUserInfo } = useUserPermissions();
  // derived values
  const canView = allowProjectPermissionKeys(PROJECT_SETTINGS.general.permissionKeys ?? [], workspaceSlug, projectId);
  const canEdit = allowProjectPermissionKeys(
    PROJECT_SETTINGS.general.editPermissionKeys ?? [],
    workspaceSlug,
    projectId
  );

  const pageTitle = currentProjectDetails?.name ? `${currentProjectDetails?.name} - General Settings` : undefined;

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<GeneralProjectSettingsHeader />}>
      <PageHead title={pageTitle} />
      {/* 管理员是可编辑表单（含危险操作区）；其他成员是同一套分组的只读视图 */}
      {!currentProjectDetails ? (
        <ProjectDetailsFormLoader />
      ) : canEdit ? (
        <ProjectDetailsForm project={currentProjectDetails} workspaceSlug={workspaceSlug} projectId={projectId} />
      ) : (
        <ProjectSettingsReadOnly project={currentProjectDetails} workspaceSlug={workspaceSlug} projectId={projectId} />
      )}
    </SettingsContentWrapper>
  );
}

export default observer(ProjectSettingsPage);
