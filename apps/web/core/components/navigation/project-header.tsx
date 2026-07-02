/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import { observer } from "mobx-react";
import { usePathname, useSearchParams } from "next/navigation";
import { Settings } from "lucide-react";
// plane imports
import { ProjectIcon } from "@plane/propel/icons";
import type { ICustomSearchSelectOption } from "@plane/types";
import { CustomSearchSelect, Tooltip } from "@plane/ui";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
// plane web imports
import { useNavigationItems } from "@/plane-web/components/navigations";
// local imports
import { buildProjectSettingsPath, getPathWithSearch } from "@/components/settings/project/navigation";
import { SwitcherLabel } from "../common/switcher-label";
import { ProjectHeaderButton } from "./project-header-button";
import { getTabUrl } from "./tab-navigation-utils";
import { useTabPreferences } from "./use-tab-preferences";

type TProjectHeaderProps = {
  workspaceSlug: string;
  projectId: string;
};

export const ProjectHeader = observer(function ProjectHeader(props: TProjectHeaderProps) {
  const { workspaceSlug, projectId } = props;
  // router
  const router = useAppRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // store hooks
  const { joinedProjectIds, getPartialProjectById } = useProject();
  const { allowPermissions, allowProjectPermissionKeys } = useUserPermissions();

  // Get current project details
  const currentProjectDetails = getPartialProjectById(projectId);

  // Get available navigation items for this project
  const navigationItems = useNavigationItems({
    workspaceSlug: workspaceSlug,
    projectId,
    project: currentProjectDetails,
    allowPermissions,
    allowProjectPermissionKeys,
  });

  // Get preferences from hook
  const { tabPreferences } = useTabPreferences(workspaceSlug, projectId);

  // Memoize available tab keys
  const availableTabKeys = useMemo(() => navigationItems.map((item) => item.key), [navigationItems]);

  // Memoize validated default tab key
  const validatedDefaultTabKey = useMemo(
    () =>
      availableTabKeys.includes(tabPreferences.defaultTab)
        ? tabPreferences.defaultTab
        : availableTabKeys[0] || "work_items",
    [availableTabKeys, tabPreferences.defaultTab]
  );

  // Memoize switcher options to prevent recalculation on every render
  const switcherOptions = useMemo<ICustomSearchSelectOption[]>(
    () =>
      joinedProjectIds
        .map((id): ICustomSearchSelectOption | null => {
          const project = getPartialProjectById(id);
          if (!project) return null;

          return {
            value: id,
            query: project.name,
            content: (
              <SwitcherLabel
                name={project.name}
                logo_props={project.logo_props}
                LabelIcon={ProjectIcon}
                type="material"
              />
            ),
          };
        })
        .filter((option): option is ICustomSearchSelectOption => option !== null),
    [joinedProjectIds, getPartialProjectById]
  );

  // Memoize onChange handler
  const handleProjectChange = useCallback(
    (value: string) => {
      if (value !== currentProjectDetails?.id) {
        const destinationTabKey = availableTabKeys.includes("overview") ? "overview" : validatedDefaultTabKey;
        router.push(getTabUrl(workspaceSlug, value, destinationTabKey));
      }
    },
    [currentProjectDetails?.id, router, workspaceSlug, availableTabKeys, validatedDefaultTabKey]
  );

  const handleProjectsClick = useCallback(() => {
    router.push(`/${workspaceSlug}/projects/`);
  }, [router, workspaceSlug]);

  const currentPath = getPathWithSearch(pathname, searchParams);

  const handleProjectSettingsClick = useCallback(() => {
    router.push(buildProjectSettingsPath({ workspaceSlug, projectId, currentPath }));
  }, [router, workspaceSlug, projectId, currentPath]);

  // Early return if no project details
  if (!currentProjectDetails) return null;

  return (
    <>
      <button type="button" onClick={handleProjectsClick} className="cursor-pointer text-13 font-medium">
        项目管理
      </button>
      <div className="shrink-0 h-5 w-1 border-l border-subtle mx-2" />
      <CustomSearchSelect
        options={switcherOptions}
        value={currentProjectDetails.id}
        onChange={handleProjectChange}
        customButton={currentProjectDetails ? <ProjectHeaderButton project={currentProjectDetails} /> : null}
        className="h-full rounded"
        customButtonClassName="group flex items-center gap-0.5 rounded-sm hover:bg-surface-2 outline-none cursor-pointer h-full"
      />
      <Tooltip tooltipContent="项目设置" position="bottom">
        <button
          type="button"
          onClick={handleProjectSettingsClick}
          className="ml-1 flex size-6 flex-shrink-0 items-center justify-center rounded hover:bg-surface-2 text-tertiary hover:text-secondary transition-colors"
        >
          <Settings className="size-3.5" />
        </button>
      </Tooltip>
    </>
  );
});
