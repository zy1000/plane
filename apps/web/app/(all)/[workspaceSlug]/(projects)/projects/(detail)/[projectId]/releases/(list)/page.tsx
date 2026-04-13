/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useCallback } from "react";
import { observer } from "mobx-react";
import { PROJECT_RELEASES_VIEW_PERMISSION_KEY } from "@plane/constants";
import type { TModuleFilters } from "@plane/types";
import { calculateTotalFilters } from "@plane/utils";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { ModuleAppliedFiltersList } from "@/components/modules";
import { ReleasesListView } from "@/components/releases/releases-list-view";
import { useProject } from "@/hooks/store/use-project";
import { useReleaseFilter } from "@/hooks/store/use-release-filter";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";

function ProjectReleasesPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { getProjectById } = useProject();
  const { allowProjectPermissionKeys, workspaceUserInfo } = useUserPermissions();
  const {
    currentProjectFilters = {},
    currentProjectDisplayFilters,
    clearAllFilters,
    updateFilters,
    updateDisplayFilters,
  } = useReleaseFilter();
  const project = getProjectById(projectId);
  const pageTitle = project?.name ? `${project?.name} - 发布` : undefined;
  const canViewReleases = allowProjectPermissionKeys(
    [PROJECT_RELEASES_VIEW_PERMISSION_KEY],
    workspaceSlug,
    projectId
  );

  const handleRemoveFilter = useCallback(
    (key: keyof TModuleFilters, value: string | null) => {
      let newValues = currentProjectFilters[key] ?? [];

      if (!value) newValues = [];
      else newValues = newValues.filter((val) => val !== value);

      updateFilters(projectId, { [key]: newValues });
    },
    [currentProjectFilters, projectId, updateFilters]
  );

  if (workspaceUserInfo && !canViewReleases) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="flex h-full w-full flex-col">
        {(calculateTotalFilters(currentProjectFilters) !== 0 || currentProjectDisplayFilters?.favorites) && (
          <ModuleAppliedFiltersList
            appliedFilters={currentProjectFilters}
            isFavoriteFilterApplied={currentProjectDisplayFilters?.favorites ?? false}
            handleClearAllFilters={() => clearAllFilters(projectId)}
            handleRemoveFilter={handleRemoveFilter}
            handleDisplayFiltersUpdate={(val) => updateDisplayFilters(projectId, val)}
            alwaysAllowEditing
          />
        )}
        <ReleasesListView />
      </div>
    </>
  );
}

export default observer(ProjectReleasesPage);
