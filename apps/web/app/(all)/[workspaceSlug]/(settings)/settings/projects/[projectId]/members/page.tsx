/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { PROJECT_SETTINGS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { ProjectMemberList } from "@/components/project/member-list";
import { ProjectSettingsMemberDefaults } from "@/components/project/project-settings-member-defaults";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
// constants
import { PROJECT_MEMBERS } from "@/constants/fetch-keys";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// plane web imports
import { ProjectTeamspaceList } from "@/plane-web/components/projects/teamspaces/teamspace-list";
// local imports
import type { Route } from "./+types/page";
import { MembersProjectSettingsHeader } from "./header";

function MembersSettingsPage({ params }: Route.ComponentProps) {
  // router
  const { workspaceSlug, projectId } = params;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { currentProjectDetails } = useProject();
  const { workspaceUserInfo, allowProjectPermissionKeys, getProjectRoleByWorkspaceSlugAndProjectId } =
    useUserPermissions();
  const {
    project: { fetchProjectMembers },
  } = useMember();
  // derived values
  const pageTitle = currentProjectDetails?.name ? `${currentProjectDetails?.name} - Members` : undefined;
  const canView = allowProjectPermissionKeys(PROJECT_SETTINGS.members.permissionKeys ?? [], workspaceSlug, projectId);
  const currentProjectRole = getProjectRoleByWorkspaceSlugAndProjectId(workspaceSlug, projectId);
  // 布局层的成员 SWR 使用 revalidateIfStale:false，切换子页面不会重拉；此处在进入成员页时强制刷新一次
  useSWR(
    workspaceSlug && projectId ? PROJECT_MEMBERS(projectId, currentProjectRole) : null,
    workspaceSlug && projectId ? () => fetchProjectMembers(workspaceSlug, projectId) : null,
    { revalidateOnMount: true }
  );

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<MembersProjectSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <SettingsHeading title={t("common.members")} />
      <ProjectSettingsMemberDefaults projectId={projectId} workspaceSlug={workspaceSlug} />
      <ProjectTeamspaceList projectId={projectId} workspaceSlug={workspaceSlug} />
      <ProjectMemberList projectId={projectId} workspaceSlug={workspaceSlug} />
    </SettingsContentWrapper>
  );
}

export default observer(MembersSettingsPage);
