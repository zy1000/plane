/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
// components
import { PageHead } from "@/components/core/page-title";
import { FiltersRow } from "@/components/rich-filters/filters-row";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useProjectFilter } from "@/hooks/store/use-project-filter";
import { useWorkspace } from "@/hooks/store/use-workspace";
// local imports
import { ProjectCardList } from "./card-list";
import { useProjectListFiltering } from "./filters/use-project-list-filtering";
import { ProjectTableList } from "./table-list";

export const ProjectRoot = observer(function ProjectRoot() {
  const { currentWorkspace } = useWorkspace();
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
  const { t } = useTranslation();
  const workspaceSlugString = workspaceSlug?.toString();
  // store
  const { totalProjectIds, filteredProjectIds } = useProject();
  const { updateDisplayFilters, viewMode } = useProjectFilter();
  const { lookups, filter } = useProjectListFiltering(workspaceSlugString);
  // derived values
  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace?.name} - ${t("workspace_projects.label", { count: 2 })}`
    : undefined;

  const isArchived = pathname.includes("/archives");

  useEffect(() => {
    if (!workspaceSlug) return;
    if (isArchived) {
      updateDisplayFilters(workspaceSlug.toString(), { archived_projects: true, show_archived_projects: false });
    } else {
      updateDisplayFilters(workspaceSlug.toString(), { archived_projects: false });
    }
  }, [isArchived, updateDisplayFilters, workspaceSlug]);

  const [renderedViewMode, setRenderedViewMode] = useState(viewMode);
  const [viewOpacity, setViewOpacity] = useState<0 | 100>(100);

  useEffect(() => {
    if (viewMode === renderedViewMode) return;
    setViewOpacity(0);
    const timeoutId = window.setTimeout(() => {
      setRenderedViewMode(viewMode);
      window.setTimeout(() => setViewOpacity(100), 20);
    }, 150);
    return () => window.clearTimeout(timeoutId);
  }, [renderedViewMode, viewMode]);

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="flex h-full w-full flex-col">
        {filter && (
          <FiltersRow
            filter={filter}
            summary={t("workspace_projects.filters.summary", {
              filtered: filteredProjectIds?.length ?? 0,
              total: totalProjectIds?.length ?? 0,
            })}
          />
        )}
        <div
          className={`flex-1 min-h-0 overflow-hidden transition-opacity duration-150 ease-linear ${
            viewOpacity === 0 ? "opacity-0" : "opacity-100"
          }`}
        >
          {renderedViewMode === "list" ? <ProjectTableList lookups={lookups} /> : <ProjectCardList />}
        </div>
      </div>
    </>
  );
});
