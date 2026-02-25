/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TProjectAppliedDisplayFilterKeys, TProjectFilters } from "@plane/types";
import { calculateTotalFilters } from "@plane/utils";
// components
import { PageHead } from "@/components/core/page-title";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useProjectFilter } from "@/hooks/store/use-project-filter";
import { useWorkspace } from "@/hooks/store/use-workspace";
// local imports
import { ProjectAppliedFiltersList } from "./applied-filters";
import { ProjectCardList } from "./card-list";
import { ProjectTableList } from "./table-list";

export const ProjectRoot = observer(function ProjectRoot() {
  const { currentWorkspace } = useWorkspace();
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
  const { t } = useTranslation();
  // store
  const { totalProjectIds, filteredProjectIds } = useProject();
  const {
    currentWorkspaceFilters,
    currentWorkspaceAppliedDisplayFilters,
    clearAllFilters,
    clearAllAppliedDisplayFilters,
    updateFilters,
    updateDisplayFilters,
    viewMode,
  } = useProjectFilter();
  // derived values
  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace?.name} - ${t("workspace_projects.label", { count: 2 })}`
    : undefined;

  const isArchived = pathname.includes("/archives");

  const allowedDisplayFilters =
    currentWorkspaceAppliedDisplayFilters?.filter((filter) => (isArchived ? true : filter !== "archived_projects")) ??
    [];

  const handleRemoveFilter = useCallback(
    (key: keyof TProjectFilters, value: string | null) => {
      if (!workspaceSlug) return;
      let newValues = currentWorkspaceFilters?.[key] ?? [];

      if (!value) newValues = [];
      else newValues = newValues.filter((val) => val !== value);

      updateFilters(workspaceSlug.toString(), { [key]: newValues });
    },
    [currentWorkspaceFilters, updateFilters, workspaceSlug]
  );

  const handleRemoveDisplayFilter = useCallback(
    (key: TProjectAppliedDisplayFilterKeys) => {
      if (!workspaceSlug) return;
      updateDisplayFilters(workspaceSlug.toString(), { [key]: false });
    },
    [updateDisplayFilters, workspaceSlug]
  );

  const handleClearAllFilters = useCallback(() => {
    if (!workspaceSlug) return;
    clearAllFilters(workspaceSlug.toString());
    clearAllAppliedDisplayFilters(workspaceSlug.toString());
    if (isArchived) updateDisplayFilters(workspaceSlug.toString(), { archived_projects: true });
  }, [clearAllFilters, clearAllAppliedDisplayFilters, isArchived, updateDisplayFilters, workspaceSlug]);

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
        {(calculateTotalFilters(currentWorkspaceFilters ?? {}) !== 0 || allowedDisplayFilters.length > 0) && (
          <ProjectAppliedFiltersList
            appliedFilters={currentWorkspaceFilters ?? {}}
            appliedDisplayFilters={allowedDisplayFilters}
            handleClearAllFilters={handleClearAllFilters}
            handleRemoveFilter={handleRemoveFilter}
            handleRemoveDisplayFilter={handleRemoveDisplayFilter}
            filteredProjects={filteredProjectIds?.length ?? 0}
            totalProjects={totalProjectIds?.length ?? 0}
            alwaysAllowEditing
          />
        )}
        <div
          className={`flex-1 min-h-0 overflow-hidden transition-opacity duration-150 ease-linear ${
            viewOpacity === 0 ? "opacity-0" : "opacity-100"
          }`}
        >
          {renderedViewMode === "list" ? <ProjectTableList /> : <ProjectCardList />}
        </div>
      </div>
    </>
  );
});
