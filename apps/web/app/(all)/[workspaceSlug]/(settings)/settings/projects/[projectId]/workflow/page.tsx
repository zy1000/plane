/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { PROJECT_SETTINGS } from "@plane/constants";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { ProjectWorkflowRoot } from "@/components/project-workflows";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { WorkflowProjectSettingsHeader } from "./header";

function WorkflowSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { currentProjectDetails } = useProject();
  const { workspaceUserInfo, allowProjectPermissionKeys } = useUserPermissions();

  const pageTitle = currentProjectDetails?.name ? `${currentProjectDetails.name} - 工作流` : undefined;

  const canView = allowProjectPermissionKeys(PROJECT_SETTINGS.workflow.permissionKeys ?? [], workspaceSlug, projectId);

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<WorkflowProjectSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <div className="w-full">
        <SettingsHeading title="工作流" description="配置工作项在不同状态之间的流转规则。" />
        <div className="mt-8">
          <ProjectWorkflowRoot workspaceSlug={workspaceSlug} projectId={projectId} />
        </div>
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(WorkflowSettingsPage);
