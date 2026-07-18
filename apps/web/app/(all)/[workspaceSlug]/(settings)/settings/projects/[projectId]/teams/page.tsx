/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { PROJECT_SETTINGS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { SearchIcon } from "@plane/propel/icons";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { ProjectGroupDetailPanel } from "@/components/project/settings/groups/project-group-detail-panel";
import { ProjectGroupsList } from "@/components/project/settings/groups/project-groups-list";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { useProject } from "@/hooks/store/use-project";
import { useProjectGroups } from "@/hooks/store/use-project-groups";
import { useProjectRoles } from "@/hooks/store/use-project-roles";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";
import { TeamsProjectSettingsHeader } from "./header";

function TeamsSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const { currentProjectDetails } = useProject();
  const { workspaceUserInfo, allowProjectPermissionKeys, fetchUserProjectInfo } = useUserPermissions();
  const { groups, isLoading, error, fetchGroups, getGroupMembers, loadGroupMembers, addRoles, removeRole } =
    useProjectGroups(workspaceSlug, projectId);
  const { roles, isLoading: isRolesLoading, fetchRoles } = useProjectRoles(workspaceSlug, projectId);

  const canView = allowProjectPermissionKeys(PROJECT_SETTINGS.teams.permissionKeys ?? [], workspaceSlug, projectId);
  const canCreate = allowProjectPermissionKeys(["project.group_grant.create"], workspaceSlug, projectId);
  const canDelete = allowProjectPermissionKeys(["project.group_grant.delete"], workspaceSlug, projectId);

  useSWR(canView ? `PROJECT_GROUPS_${workspaceSlug}_${projectId}` : null, canView ? fetchGroups : null);
  useSWR(
    canView && canCreate ? `PROJECT_GROUP_ROLES_${workspaceSlug}_${projectId}` : null,
    canView && canCreate ? fetchRoles : null
  );

  useEffect(() => {
    if (selectedGroupId) void loadGroupMembers(selectedGroupId);
  }, [selectedGroupId, loadGroupMembers]);

  useEffect(() => {
    if (selectedGroupId && !groups.some((group) => group.id === selectedGroupId)) setSelectedGroupId(null);
  }, [groups, selectedGroupId]);

  const filteredGroups = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return groups;
    return groups.filter(
      (group) =>
        group.name.toLocaleLowerCase().includes(query) || group.description?.toLocaleLowerCase().includes(query)
    );
  }, [groups, searchQuery]);
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;
  const memberState = selectedGroupId ? getGroupMembers(selectedGroupId) : null;
  const pageTitle = currentProjectDetails?.name ? `${currentProjectDetails.name} - 团队` : undefined;

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<TeamsProjectSettingsHeader />} hugging>
      <PageHead title={pageTitle} />
      <SettingsHeading
        title={t("common.teams")}
        description="将项目角色分配给工作区团队；只有同时属于项目和该团队的成员才会继承角色。"
      />

      <section className="mt-6">
        <div className="flex items-center justify-between gap-4 overflow-x-hidden border-b border-subtle py-2">
          <div className="text-14 font-semibold">{t("common.teams")}</div>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center justify-start gap-1.5 rounded-md border border-subtle bg-surface-1 px-2 py-1">
              <SearchIcon className="h-3.5 w-3.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search"
                className="w-full max-w-[234px] border-none bg-transparent text-13 placeholder:text-placeholder focus:outline-none"
              />
            </div>
          </div>
        </div>
        <ProjectGroupsList
          groups={filteredGroups}
          isLoading={isLoading}
          error={error}
          hasSearch={Boolean(searchQuery.trim())}
          activeGroupId={selectedGroupId}
          roles={roles}
          isRolesLoading={isRolesLoading}
          canCreateRole={canCreate}
          canDeleteRole={canDelete}
          onOpen={(group) => setSelectedGroupId(group.id)}
          onRetry={() => void fetchGroups()}
          onAddRoles={addRoles}
          onRemoveRole={removeRole}
          onPermissionsChanged={() => fetchUserProjectInfo(workspaceSlug, projectId).then(() => undefined)}
        />
      </section>

      <ProjectGroupDetailPanel
        isOpen={Boolean(selectedGroup)}
        group={selectedGroup}
        members={memberState?.data ?? []}
        isMembersLoading={memberState?.isLoading ?? false}
        membersError={memberState?.error ?? null}
        onClose={() => setSelectedGroupId(null)}
        onRetryMembers={(groupId) => void loadGroupMembers(groupId, true)}
      />
    </SettingsContentWrapper>
  );
}

export default observer(TeamsSettingsPage);
