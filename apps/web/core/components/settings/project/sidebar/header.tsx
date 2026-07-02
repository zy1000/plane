/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { ROLE_DETAILS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { IconButton } from "@plane/propel/icon-button";
import { ProjectIcon } from "@plane/propel/icons";
import type { ICustomSearchSelectOption } from "@plane/types";
import { CustomSearchSelect } from "@plane/ui";
// components
import { SwitcherLabel } from "@/components/common/switcher-label";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";
// local imports
import { getProjectSettingsReturnPath, PROJECT_SETTINGS_RETURN_TO_PARAM } from "@/components/settings/project/navigation";
import { ProjectHeaderButton } from "../../../navigation/project-header-button";

type Props = {
  projectId: string;
};

export const ProjectSettingsSidebarHeader = observer(function ProjectSettingsSidebarHeader(props: Props) {
  const { projectId } = props;
  // router
  const router = useAppRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // store hooks
  const { getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { joinedProjectIds, getPartialProjectById } = useProject();
  // derived values
  const projectDetails = getPartialProjectById(projectId);
  const workspaceSlug = currentWorkspace?.slug;
  const settingsSearch = searchParams.toString();
  const returnPath = getProjectSettingsReturnPath({
    projectId,
    returnTo: searchParams.get(PROJECT_SETTINGS_RETURN_TO_PARAM),
    workspaceSlug,
  });
  const currentProjectRole = currentWorkspace?.slug
    ? getProjectRoleByWorkspaceSlugAndProjectId(currentWorkspace.slug, projectId)
    : undefined;
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
  // translation
  const { t } = useTranslation();

  const handleProjectChange = useCallback(
    (value: string) => {
      const workspaceSlug = currentWorkspace?.slug;
      if (!workspaceSlug || value === projectId) return;

      const currentPathPrefix = `/${workspaceSlug}/settings/projects/${projectId}`;
      const nextPathPrefix = `/${workspaceSlug}/settings/projects/${value}`;
      const nextPath = pathname.startsWith(currentPathPrefix)
        ? pathname.replace(currentPathPrefix, nextPathPrefix)
        : nextPathPrefix;
      const nextPathWithTrailingSlash = nextPath.endsWith("/") ? nextPath : `${nextPath}/`;

      router.push(settingsSearch ? `${nextPathWithTrailingSlash}?${settingsSearch}` : nextPathWithTrailingSlash);
    },
    [currentWorkspace?.slug, pathname, projectId, router, settingsSearch]
  );

  if (!currentProjectRole || !projectDetails) return null;

  return (
    <div className="shrink-0">
      <div className="flex items-center gap-1 py-3 pr-5 pl-4 text-body-md-medium">
        <IconButton
          variant="ghost"
          size="base"
          icon={ArrowLeft}
          onClick={() => router.push(returnPath)}
        />
        <p>Project settings</p>
      </div>
      <div className="mt-1.5 px-5 py-0.5">
        <CustomSearchSelect
          options={switcherOptions}
          value={projectDetails.id}
          onChange={handleProjectChange}
          customButton={<ProjectHeaderButton project={projectDetails} />}
          className="w-full rounded"
          customButtonClassName="group flex w-full items-center rounded-sm hover:bg-surface-2 outline-none cursor-pointer"
        />
        <p className="mt-1 truncate pl-9 text-caption-md-regular">
          {t(ROLE_DETAILS[currentProjectRole].i18n_title)}
        </p>
      </div>
    </div>
  );
});
