/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState, useEffect } from "react";
import { observer } from "mobx-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { WorkflowTransitionsRoot } from "@/components/project-workflows/workflow-transitions";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// services
import {
  ProjectWorkflowService,
  type TWorkflow,
} from "@/services/project/project-workflow.service";
// local imports
import type { Route } from "./+types/page";
import { WorkflowDetailHeader } from "./header";

const workflowService = new ProjectWorkflowService();

function WorkflowDetailPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId, workflowId } = params;
  const { currentProjectDetails } = useProject();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();

  const [workflow, setWorkflow] = useState<TWorkflow | null>(null);
  const [isLoadingWorkflow, setIsLoadingWorkflow] = useState(true);

  const canPerformProjectAdminActions = allowPermissions(
    [EUserPermissions.ADMIN],
    EUserPermissionsLevel.PROJECT
  );

  useEffect(() => {
    if (!workspaceSlug || !projectId || !workflowId) return;
    setIsLoadingWorkflow(true);
    workflowService
      .fetchWorkflows(workspaceSlug, projectId)
      .then((workflows) => {
        const found = workflows.find((w) => w.id === workflowId) ?? null;
        setWorkflow(found);
      })
      .finally(() => setIsLoadingWorkflow(false));
  }, [workspaceSlug, projectId, workflowId]);

  const pageTitle = currentProjectDetails?.name
    ? `${currentProjectDetails.name} - ${workflow?.name ?? "工作流详情"}`
    : undefined;

  if (workspaceUserInfo && !canPerformProjectAdminActions) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<WorkflowDetailHeader workflowName={workflow?.name} />} hugging>
      <PageHead title={pageTitle} />
      <div className="w-full">
        {isLoadingWorkflow ? (
          <div className="flex flex-col gap-3">
            <div className="h-14 w-64 animate-pulse rounded-lg bg-layer-1" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-14 animate-pulse rounded-lg border border-subtle bg-layer-1" />
            ))}
          </div>
        ) : !workflow ? (
          <div className="flex items-center justify-center py-16 text-sm text-secondary">
            未找到工作流
          </div>
        ) : (
          <WorkflowTransitionsRoot
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            workflow={workflow}
          />
        )}
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(WorkflowDetailPage);
