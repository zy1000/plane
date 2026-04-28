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
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { PROJECT_SETTINGS_ICONS } from "@/components/settings/project/sidebar/item-icon";
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
  const Icon = PROJECT_SETTINGS_ICONS.issue_types;
  const pageTitle = currentProjectDetails?.name ? `${currentProjectDetails.name} - ${t(settingsDetails.i18n_label)}` : undefined;
  const canView = allowProjectPermissionKeys(settingsDetails.permissionKeys ?? [], workspaceSlug, projectId);

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<IssueTypesProjectSettingsHeader />}>
      <PageHead title={pageTitle} />
      <div className="w-full">
        <SettingsHeading
          title={t("project_settings.issue_types.heading")}
          description={t("project_settings.issue_types.description")}
        />
        <div className="mt-6 rounded-lg border border-dashed border-subtle bg-surface-1 px-6 py-10">
          <div className="mx-auto flex max-w-md flex-col items-center text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-custom-background-80 text-tertiary">
              <Icon className="size-5" />
            </div>
            <h3 className="mt-4 text-sm font-medium text-primary">
              {t("project_settings.issue_types.placeholder.title")}
            </h3>
            <p className="mt-2 text-sm text-secondary">{t("project_settings.issue_types.placeholder.description")}</p>
          </div>
        </div>
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(IssueTypesSettingsPage);
