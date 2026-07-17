/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { EUserPermissionsLevel, WORKSPACE_PROJECT_CREATE_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { EIssuesStoreType, EUserWorkspaceRoles } from "@plane/types";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";

export const GlobalViewEmptyState = observer(function GlobalViewEmptyState() {
  // plane imports
  const { t } = useTranslation();
  // store hooks
  const { workspaceProjectIds } = useProject();
  const { toggleCreateIssueModal, toggleCreateProjectModal } = useCommandPalette();
  const { allowPermissions, allowWorkspacePermissionKeys } = useUserPermissions();
  // derived values
  const hasMemberLevelPermission = allowPermissions(
    [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  const canCreateProjects = allowWorkspacePermissionKeys([WORKSPACE_PROJECT_CREATE_PERMISSION_KEY]);

  if (workspaceProjectIds?.length === 0) {
    return (
      <EmptyStateDetailed
        title={t("workspace_projects.empty_state.no_projects.title")}
        description={t("workspace_projects.empty_state.no_projects.description")}
        assetKey="project"
        assetClassName="size-40"
        actions={
          canCreateProjects
            ? [
                {
                  label: t("workspace_projects.empty_state.no_projects.primary_button.text"),
                  onClick: () => {
                    toggleCreateProjectModal(true);
                  },
                  variant: "primary",
                },
              ]
            : []
        }
      />
    );
  }

  return (
    <EmptyStateDetailed
      title={t(`workspace_empty_state.views.title`)}
      description={t(`workspace_empty_state.views.description`)}
      assetKey="project"
      assetClassName="size-40"
      actions={
        hasMemberLevelPermission
          ? [
              {
                label: t(`workspace_empty_state.views.cta_primary`),
                onClick: () => {
                  toggleCreateIssueModal(true, EIssuesStoreType.PROJECT);
                },
                variant: "primary",
              },
            ]
          : []
      }
    />
  );
});
