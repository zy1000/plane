/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import { PageHead } from "@/components/core/page-title";
import { CycleAttachmentsContent } from "@/components/cycles/cycle-attachments-content";
import { useCycle } from "@/hooks/store/use-cycle";
import { useProject } from "@/hooks/store/use-project";
import type { Route } from "./+types/page";

function CycleAttachmentsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId, cycleId } = params;
  const { getCycleById } = useCycle();
  const { getProjectById } = useProject();

  const cycle = getCycleById(cycleId);
  const project = getProjectById(projectId);
  const pageTitle = project?.name && cycle?.name ? `${project.name} - ${cycle.name} - 附件` : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <CycleAttachmentsContent workspaceSlug={workspaceSlug} projectId={projectId} cycleId={cycleId} />
    </>
  );
}

export default observer(CycleAttachmentsPage);
