/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { PROJECT_SETTINGS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { ProjectPmsSyncSettingsRoot } from "@/components/settings/project/pms-sync-root";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { PmsSyncProjectSettingsHeader } from "./header";

function PmsSyncSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { currentProjectDetails } = useProject();
  const { workspaceUserInfo, allowProjectPermissionKeys } = useUserPermissions();
  const { t } = useTranslation();

  const pageTitle = currentProjectDetails?.name
    ? `${currentProjectDetails.name} - ${t("project_settings.pms_sync.label" as never)}`
    : undefined;

  const canView = allowProjectPermissionKeys(PROJECT_SETTINGS.pms_sync.permissionKeys ?? [], workspaceSlug, projectId);
  const canEdit = allowProjectPermissionKeys(
    PROJECT_SETTINGS.pms_sync.editPermissionKeys ?? [],
    workspaceSlug,
    projectId
  );

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<PmsSyncProjectSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <div className="w-full">
        <SettingsHeading
          title={t("project_settings.pms_sync.heading" as never)}
          description={t("project_settings.pms_sync.description" as never)}
        />
        <div className="mt-8">
          <ProjectPmsSyncSettingsRoot workspaceSlug={workspaceSlug} projectId={projectId} canEdit={canEdit} />
        </div>
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(PmsSyncSettingsPage);
