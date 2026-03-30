/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { PROJECT_SETTINGS } from "@plane/constants";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { EstimateRoot } from "@/components/estimates";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { EstimatesProjectSettingsHeader } from "./header";

function EstimatesSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  // store
  const { currentProjectDetails } = useProject();
  const { workspaceUserInfo, allowProjectPermissionKeys } = useUserPermissions();

  // derived values
  const pageTitle = currentProjectDetails?.name ? `${currentProjectDetails?.name} - Estimates` : undefined;
  const canView = allowProjectPermissionKeys(PROJECT_SETTINGS.estimates.permissionKeys ?? [], workspaceSlug, projectId);
  const canEdit = allowProjectPermissionKeys(
    ["estimate.create", "estimate.edit", "estimate.delete"],
    workspaceSlug,
    projectId
  );

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<EstimatesProjectSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className={`w-full ${canEdit ? "" : "pointer-events-none opacity-60"}`}>
        <EstimateRoot workspaceSlug={workspaceSlug} projectId={projectId} isAdmin={canEdit} />
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(EstimatesSettingsPage);
