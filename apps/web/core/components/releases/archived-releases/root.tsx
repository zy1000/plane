/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import type { TModuleFilters } from "@plane/types";
import { calculateTotalFilters } from "@plane/utils";
import { ModuleAppliedFiltersList } from "@/components/modules";
import { CycleModuleListLayoutLoader } from "@/components/ui/loader/cycle-module-list-loader";
import { useRelease } from "@/hooks/store/use-release";
import { useReleaseFilter } from "@/hooks/store/use-release-filter";
import { ArchivedReleasesView } from "./view";

export const ArchivedReleaseLayoutRoot = observer(function ArchivedReleaseLayoutRoot() {
  const { workspaceSlug, projectId } = useParams();
  const { t } = useTranslation();
  const { fetchArchivedReleases, projectArchivedReleaseIds, loader } = useRelease();
  const { clearAllFilters, currentProjectArchivedFilters, updateFilters } = useReleaseFilter();
  const totalArchivedReleases = projectArchivedReleaseIds?.length ?? 0;

  useSWR(
    workspaceSlug && projectId ? `ARCHIVED_RELEASES_${workspaceSlug.toString()}_${projectId.toString()}` : null,
    async () => {
      if (workspaceSlug && projectId) {
        await fetchArchivedReleases(workspaceSlug.toString(), projectId.toString());
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const handleRemoveFilter = useCallback(
    (key: keyof TModuleFilters, value: string | null) => {
      if (!projectId) return;
      let newValues = currentProjectArchivedFilters?.[key] ?? [];

      if (!value) newValues = [];
      else newValues = newValues.filter((val) => val !== value);

      updateFilters(projectId.toString(), { [key]: newValues }, "archived");
    },
    [currentProjectArchivedFilters, projectId, updateFilters]
  );

  if (!workspaceSlug || !projectId) return <></>;

  if (loader || !projectArchivedReleaseIds) {
    return <CycleModuleListLayoutLoader />;
  }

  return (
    <>
      {calculateTotalFilters(currentProjectArchivedFilters ?? {}) !== 0 && (
        <div className="border-b border-subtle px-5 py-3">
          <ModuleAppliedFiltersList
            appliedFilters={currentProjectArchivedFilters ?? {}}
            handleClearAllFilters={() => clearAllFilters(projectId.toString(), "archived")}
            handleRemoveFilter={handleRemoveFilter}
            alwaysAllowEditing
            isArchived
          />
        </div>
      )}
      {totalArchivedReleases === 0 ? (
        <div className="h-full place-items-center">
          <EmptyStateDetailed
            assetKey="archived-module"
            title={t("workspace_empty_state.archive_releases.title") ?? "No archived releases"}
            description={
              t("workspace_empty_state.archive_releases.description") ?? "No releases have been archived yet."
            }
          />
        </div>
      ) : (
        <div className="relative h-full w-full overflow-auto">
          <ArchivedReleasesView workspaceSlug={workspaceSlug.toString()} projectId={projectId.toString()} />
        </div>
      )}
    </>
  );
});
