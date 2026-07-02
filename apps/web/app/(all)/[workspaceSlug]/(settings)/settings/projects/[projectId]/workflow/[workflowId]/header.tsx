/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useLocation, useParams } from "react-router";
// plane imports
import { PROJECT_SETTINGS } from "@plane/constants";
import { Breadcrumbs } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { SettingsPageHeader } from "@/components/settings/page-header";
import { PROJECT_SETTINGS_ICONS } from "@/components/settings/project/sidebar/item-icon";

type TWorkflowDetailHeaderProps = {
  workflowName?: string;
};

export const WorkflowDetailHeader = observer(function WorkflowDetailHeader({
  workflowName,
}: TWorkflowDetailHeaderProps) {
  const { workspaceSlug, projectId } = useParams<{ workspaceSlug: string; projectId: string }>();
  const location = useLocation();
  const Icon = PROJECT_SETTINGS_ICONS.workflow;
  const settingsDetails = PROJECT_SETTINGS.workflow;

  return (
    <SettingsPageHeader
      leftItem={
        <div className="flex items-center gap-2">
          <Breadcrumbs>
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink
                  label="工作流"
                  href={`/${workspaceSlug}/settings/projects/${projectId}/workflow${location.search}`}
                  icon={<Icon className="size-4 text-tertiary" />}
                />
              }
            />
            {workflowName && (
              <Breadcrumbs.Item
                component={
                  <BreadcrumbLink label={workflowName} isLast />
                }
              />
            )}
          </Breadcrumbs>
        </div>
      }
    />
  );
});
