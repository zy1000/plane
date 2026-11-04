/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { PROJECT_SETTINGS } from "@plane/constants";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { ProjectMemberList } from "@/components/project/member-list";
import { ProjectSettingsMemberDefaults } from "@/components/project/project-settings-member-defaults";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { MembersProjectSettingsHeader } from "./header";

function MembersSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  // store hooks
  const { currentProjectDetails } = useProject();
  const { workspaceUserInfo, allowProjectPermissionKeys } = useUserPermissions();
  const {
    project: { fetchProjectMembers },
  } = useMember();
  // derived values
  const pageTitle = currentProjectDetails?.name ? `${currentProjectDetails?.name} - 成员` : undefined;
  const canView = allowProjectPermissionKeys(PROJECT_SETTINGS.members.permissionKeys ?? [], workspaceSlug, projectId);
  const canManage = allowProjectPermissionKeys(
    PROJECT_SETTINGS.members.editPermissionKeys ?? [],
    workspaceSlug,
    projectId
  );
  // 布局层的成员 SWR 使用 revalidateIfStale:false，切换子页面不会重拉；此处在进入成员页时强制刷新一次
  useSWR(
    workspaceSlug && projectId ? `PROJECT_SETTINGS_MEMBERS_${projectId}` : null,
    workspaceSlug && projectId ? () => fetchProjectMembers(workspaceSlug, projectId) : null,
    { revalidateOnMount: true }
  );

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper
      header={<MembersProjectSettingsHeader canAdd={canManage} onAdd={() => setIsAddModalOpen(true)} />}
      hugging
    >
      <PageHead title={pageTitle} />
      <div className="flex flex-col gap-6">
        <ProjectSettingsMemberDefaults projectId={projectId} workspaceSlug={workspaceSlug} />
        <section>
          <ProjectMemberList
            projectId={projectId}
            workspaceSlug={workspaceSlug}
            canManage={canManage}
            isAddModalOpen={isAddModalOpen}
            onAddModalClose={() => setIsAddModalOpen(false)}
          />
        </section>
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(MembersSettingsPage);
