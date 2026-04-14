/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { PageHead } from "@/components/core/page-title";
import { ArchivedReleasesHeader, ArchivedReleaseLayoutRoot } from "@/components/releases";
// hooks
import { useProject } from "@/hooks/store/use-project";
import type { Route } from "./+types/page";

function ProjectArchivedReleasesPage({ params }: Route.ComponentProps) {
  const { projectId } = params;
  const { getProjectById } = useProject();
  const project = getProjectById(projectId);
  const pageTitle = project?.name && `${project?.name} - Archived releases`;

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="relative flex h-full w-full flex-col overflow-hidden">
        <ArchivedReleasesHeader />
        <ArchivedReleaseLayoutRoot />
      </div>
    </>
  );
}

export default observer(ProjectArchivedReleasesPage);
