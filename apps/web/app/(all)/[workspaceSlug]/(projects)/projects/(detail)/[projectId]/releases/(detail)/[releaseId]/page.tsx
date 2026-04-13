/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import useSWR from "swr";
import { cn } from "@plane/utils";
import emptyModule from "@/app/assets/empty-state/module.svg?url";
import { EmptyState } from "@/components/common/empty-state";
import { PageHead } from "@/components/core/page-title";
import { ReleaseLayoutRoot } from "@/components/issues/issue-layouts/roots/release-layout-root";
import { ReleaseAnalyticsSidebar } from "@/components/releases/release-analytics-sidebar";
import { useProject } from "@/hooks/store/use-project";
import { useRelease } from "@/hooks/store/use-release";
import { useAppRouter } from "@/hooks/use-app-router";
import useLocalStorage from "@/hooks/use-local-storage";
import type { Route } from "./+types/page";

function ReleaseIssuesPage({ params }: Route.ComponentProps) {
  const router = useAppRouter();
  const { workspaceSlug, projectId, releaseId } = params;
  const { fetchReleaseDetails, getReleaseById } = useRelease();
  const { getProjectById } = useProject();
  const { setValue, storedValue } = useLocalStorage("release_sidebar_collapsed", "false");
  const isSidebarCollapsed = storedValue ? storedValue === "true" : false;

  const { error } = useSWR(`CURRENT_RELEASE_DETAILS_${releaseId}`, () =>
    fetchReleaseDetails(workspaceSlug, projectId, releaseId)
  );

  const projectRelease = getReleaseById(releaseId);
  const project = getProjectById(projectId);
  const pageTitle = project?.name && projectRelease?.name ? `${project?.name} - ${projectRelease?.name}` : undefined;

  const toggleSidebar = () => {
    setValue(`${!isSidebarCollapsed}`);
  };

  return (
    <>
      <PageHead title={pageTitle} />
      {error ? (
        <EmptyState
          image={emptyModule}
          title="Release does not exist"
          description="The release you are looking for does not exist or has been deleted."
          primaryButton={{
            text: "View other releases",
            onClick: () => router.push(`/${workspaceSlug}/projects/${projectId}/releases`),
          }}
        />
      ) : (
        <div className="flex h-full w-full">
          <div className="h-full w-full overflow-hidden">
            <ReleaseLayoutRoot />
          </div>
          {!isSidebarCollapsed && (
            <div
              className={cn(
                "vertical-scrollbar absolute right-0 z-13 flex scrollbar-sm h-full w-[24rem] flex-shrink-0 flex-col gap-3.5 overflow-y-auto border-l border-subtle bg-surface-1 px-6 shadow-raised-200 duration-300"
              )}
            >
              <ReleaseAnalyticsSidebar releaseId={releaseId} handleClose={toggleSidebar} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default observer(ReleaseIssuesPage);
