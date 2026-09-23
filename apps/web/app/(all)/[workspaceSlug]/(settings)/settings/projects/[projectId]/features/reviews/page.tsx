/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// components
import { PROJECT_SETTINGS } from "@plane/constants";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { ProjectSettingsFeatureControlItem } from "@/components/settings/project/content/feature-control-item";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { FeaturesReviewsProjectSettingsHeader } from "./header";
import { SettingsHeading } from "@/components/settings/heading";

function FeaturesReviewsSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  // store hooks
  const { workspaceUserInfo, allowProjectPermissionKeys } = useUserPermissions();
  const { currentProjectDetails } = useProject();
  // translation
  const { t } = useTranslation();
  // derived values
  const pageTitle = currentProjectDetails?.name
    ? `${currentProjectDetails?.name} settings - ${t("project_settings.features.reviews.short_title")}`
    : undefined;
  const canView = allowProjectPermissionKeys(
    PROJECT_SETTINGS.features_reviews.permissionKeys ?? [],
    workspaceSlug,
    projectId
  );
  const canEdit = allowProjectPermissionKeys(
    PROJECT_SETTINGS.features_reviews.editPermissionKeys ?? [],
    workspaceSlug,
    projectId
  );

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<FeaturesReviewsProjectSettingsHeader />}>
      <PageHead title={pageTitle} />
      <section className="w-full">
        <SettingsHeading
          title={t("project_settings.features.reviews.title")}
          description={t("project_settings.features.reviews.description")}
        />
        <div className="mt-7">
          <ProjectSettingsFeatureControlItem
            title={t("project_settings.features.reviews.toggle_title")}
            description={t("project_settings.features.reviews.toggle_description")}
            disabled={!canEdit}
            featureProperty="review_view"
            devModeFeatureKey="review_view"
            projectId={projectId}
            value={!!currentProjectDetails?.review_view}
            workspaceSlug={workspaceSlug}
          />
        </div>
      </section>
    </SettingsContentWrapper>
  );
}

export default observer(FeaturesReviewsSettingsPage);
