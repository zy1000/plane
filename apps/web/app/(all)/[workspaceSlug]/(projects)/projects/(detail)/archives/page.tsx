/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// components
import { WorkspaceArchivesRoot } from "@/components/workspace/archives/workspace-archives-root";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";

const WorkspaceArchivesPage = observer(function WorkspaceArchivesPage() {
  const { workspaceSlug } = useParams();
  const { currentWorkspace } = useWorkspace();
  const { fetchProjects } = useProject();

  useSWR(
    workspaceSlug && currentWorkspace ? `WORKSPACE_PROJECTS_${workspaceSlug}` : null,
    workspaceSlug && currentWorkspace ? () => fetchProjects(workspaceSlug.toString()) : null,
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  return <WorkspaceArchivesRoot />;
});

export default WorkspaceArchivesPage;
