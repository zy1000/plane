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
import { IssueSchemeFollowBanner } from "@/components/issue-scheme/follow-banner";
import { IssueTypesSettingsContent } from "@/components/project-issue-types/root";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { IssueTypesProjectSettingsHeader } from "./header";

function IssueTypesSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  // store
  const { currentProjectDetails } = useProject();
  const { workspaceUserInfo, allowProjectPermissionKeys } = useUserPermissions();
  // translation
  const { t } = useTranslation();
  // derived values
  const settingsDetails = PROJECT_SETTINGS.issue_types;
  const pageTitle = currentProjectDetails?.name
    ? `${currentProjectDetails.name} - ${t(settingsDetails.i18n_label)}`
    : undefined;
  const canView = allowProjectPermissionKeys(settingsDetails.permissionKeys ?? [], workspaceSlug, projectId);

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<IssueTypesProjectSettingsHeader />}>
      <PageHead title={pageTitle} />
      <IssueSchemeFollowBanner workspaceSlug={workspaceSlug} projectId={projectId} />
      <IssueTypesSettingsContent workspaceSlug={workspaceSlug} projectId={projectId} />
    </SettingsContentWrapper>
  );
}

export default observer(IssueTypesSettingsPage);
