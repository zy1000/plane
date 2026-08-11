/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { PROJECT_REQUIREMENTS_VIEW_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { TypedProjectLayoutRoot } from "@/components/issues/issue-layouts/roots/typed-project-layout-root";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";

/**
 * 研发需求页：按工作项类别「需求」过滤的工作项视图。
 *
 * 它本质是工作项视图，不是需求实体 —— /requirements 这个词让给了真正的产品需求
 * （见 core/components/projects/requirements）。权限 key 仍是
 * project.requirements.view：那个 key 已写进线上角色配置，跟着页面一起迁走。
 */
function ProjectDevRequirementsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { t } = useTranslation();
  const { getProjectById } = useProject();
  const { allowProjectPermissionKeys, workspaceUserInfo } = useUserPermissions();

  const project = getProjectById(projectId);
  const pageTitle = project?.name ? `${project.name} - ${t("sidebar.dev_requirements")}` : undefined;
  const canViewRequirements = allowProjectPermissionKeys(
    [PROJECT_REQUIREMENTS_VIEW_PERMISSION_KEY],
    workspaceSlug,
    projectId
  );

  if (workspaceUserInfo && !canViewRequirements) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="h-full w-full">
        <TypedProjectLayoutRoot variant="dev_requirements" />
      </div>
    </>
  );
}

export default observer(ProjectDevRequirementsPage);
