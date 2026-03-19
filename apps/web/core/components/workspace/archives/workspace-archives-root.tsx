/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
// components
import { PageHead } from "@/components/core/page-title";
import { ProjectTableList } from "@/components/project/table-list";
import { ProjectCardList } from "@/components/project/card-list";
// hooks
import { useProjectFilter } from "@/hooks/store/use-project-filter";
import { useWorkspace } from "@/hooks/store/use-workspace";

/**
 * Standalone workspace-level archives page component.
 * Displays only archived projects without the filter bar.
 * This is intentionally kept separate from ProjectRoot to allow
 * independent customization of the workspace archives view.
 */
export const WorkspaceArchivesRoot = observer(function WorkspaceArchivesRoot() {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const { updateDisplayFilters, viewMode } = useProjectFilter();

  const pageTitle = currentWorkspace?.name
    ? `${currentWorkspace?.name} - ${t("archives")}`
    : undefined;

  // Always show archived projects in this view
  useEffect(() => {
    if (!workspaceSlug) return;
    updateDisplayFilters(workspaceSlug.toString(), { archived_projects: true, show_archived_projects: false });
  }, [workspaceSlug, updateDisplayFilters]);

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
