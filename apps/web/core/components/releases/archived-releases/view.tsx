/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import AllFiltersImage from "@/app/assets/empty-state/module/all-filters.svg?url";
import NameFilterImage from "@/app/assets/empty-state/module/name-filter.svg?url";
import { ReleaseListItem } from "@/components/releases/release-list-item";
import { ReleasePeekOverview } from "@/components/releases/release-peek-overview";
import { CycleModuleListLayoutLoader } from "@/components/ui/loader/cycle-module-list-loader";
import { useRelease } from "@/hooks/store/use-release";
import { useReleaseFilter } from "@/hooks/store/use-release-filter";

export interface IArchivedReleasesView {
  workspaceSlug: string;
  projectId: string;
}

export const ArchivedReleasesView = observer(function ArchivedReleasesView(props: IArchivedReleasesView) {
  const { workspaceSlug, projectId } = props;
  const { getFilteredArchivedReleaseIds, loader } = useRelease();
  const { archivedModulesSearchQuery } = useReleaseFilter();
  const filteredArchivedReleaseIds = getFilteredArchivedReleaseIds(projectId);

  if (loader || !filteredArchivedReleaseIds) return <CycleModuleListLayoutLoader />;

  if (filteredArchivedReleaseIds.length === 0)
    return (
      <div className="grid h-full w-full place-items-center">
        <div className="text-center">
          <img
            src={archivedModulesSearchQuery.trim() === "" ? AllFiltersImage : NameFilterImage}
            className="mx-auto h-36 w-36 sm:h-48 sm:w-48"
            alt="No matching releases"
          />
          <h5 className="mt-7 mb-1 text-18 font-medium">No matching releases</h5>
          <p className="text-14 text-placeholder">
            {archivedModulesSearchQuery.trim() === ""
              ? "Remove the filters to see all releases"
              : "Remove the search criteria to see all releases"}
          </p>
        </div>
      </div>
    );

  return (
    <div className="h-full overflow-y-auto">
      <div className="flex h-full w-full justify-between">
        <div className="vertical-scrollbar flex scrollbar-lg h-full w-full flex-col overflow-y-auto">
          {filteredArchivedReleaseIds.map((releaseId) => (
            <ReleaseListItem key={releaseId} releaseId={releaseId} />
          ))}
        </div>
        <ReleasePeekOverview projectId={projectId} workspaceSlug={workspaceSlug} isArchived />
      </div>
    </div>
  );
});
