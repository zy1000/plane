/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { setPromiseToast } from "@plane/propel/toast";
import type { IProject, TDevModeFeatureKey } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
import { isDevModeFeatureAllowed } from "@plane/utils";
// components
import { SettingsBoxedControlItem } from "@/components/settings/boxed-control-item";
import { ProjectSettingsDevModeFeatureLock } from "@/components/settings/project/content/dev-mode-feature-lock";
// hooks
import { useProject } from "@/hooks/store/use-project";

type Props = {
  description?: React.ReactNode;
  disabled?: boolean;
  projectId: string;
  featureProperty: keyof IProject;
  /** 这个组件在研发模式里对应的开关 key；模式关掉它时开关灰显并注明不支持 */
  devModeFeatureKey: TDevModeFeatureKey;
  title: React.ReactNode;
  value: boolean;
  workspaceSlug: string;
};

export const ProjectSettingsFeatureControlItem = observer(function ProjectSettingsFeatureControlItem(props: Props) {
  const { description, devModeFeatureKey, disabled, featureProperty, projectId, title, value, workspaceSlug } = props;
  // store hooks
  const { getProjectById, updateProject } = useProject();
  // derived values
  const currentProjectDetails = getProjectById(projectId);
  // 模式是上限：模式没开的组件，项目这边只能看不能改，显示为关
  const devMode = currentProjectDetails?.dev_mode_detail;
  const isAllowedByDevMode = isDevModeFeatureAllowed(currentProjectDetails, devModeFeatureKey);

  const handleSubmit = () => {
    if (!workspaceSlug || !projectId || !currentProjectDetails) return;

    // making the request to update the project feature
    const settingsPayload = {
      [featureProperty]: !currentProjectDetails?.[featureProperty],
    };
    const updateProjectPromise = updateProject(workspaceSlug, projectId, settingsPayload);

    setPromiseToast(updateProjectPromise, {
      loading: "Updating project feature...",
      success: {
        title: "Success!",
        message: () => "Project feature updated successfully.",
      },
      error: {
        title: "Error!",
        message: () => "Something went wrong while updating project feature. Please try again.",
      },
    });
    void updateProjectPromise.then(() => {
      return undefined;
    });
  };

  return (
    <SettingsBoxedControlItem
      title={title}
      description={
        <>
          {description}
          {!isAllowedByDevMode && devMode ? (
            <ProjectSettingsDevModeFeatureLock devMode={devMode} workspaceSlug={workspaceSlug} />
          ) : null}
        </>
      }
      className={isAllowedByDevMode ? undefined : "bg-layer-1"}
      control={
        <ToggleSwitch
          value={isAllowedByDevMode && value}
          onChange={handleSubmit}
          disabled={disabled || !isAllowedByDevMode}
          size="sm"
        />
      }
    />
  );
});
