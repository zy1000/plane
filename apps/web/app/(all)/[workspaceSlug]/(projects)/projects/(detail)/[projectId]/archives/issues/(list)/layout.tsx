/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet, useParams } from "react-router";
// components
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { ProjectTopNavigation } from "@/components/navigation/project-top-navigation";
import { ProjectArchivesHeader } from "../../header";

export default function ProjectArchiveIssuesLayout() {
  const { workspaceSlug, projectId } = useParams();

  return (
    <>
      <ProjectTopNavigation workspaceSlug={workspaceSlug ?? ""} projectId={projectId ?? ""} />
      <AppHeader header={<ProjectArchivesHeader activeTab="issues" />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
