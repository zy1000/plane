/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { Search, UsersRound, X } from "lucide-react";
import { PROJECT_SETTINGS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
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

      <section className="mt-6 overflow-hidden rounded-lg border border-subtle bg-surface-1">
        <div className="flex flex-col gap-3 border-b border-subtle px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-13 text-secondary">
            <UsersRound className="size-4 text-placeholder" />
            <span>{groups.length} 个工作区团队</span>
          </div>
          <div
            className={cn(
              "flex h-8 w-full items-center gap-2 rounded-md border bg-surface-2 px-2.5 sm:w-64",
              searchQuery ? "border-accent-primary/40" : "focus-within:border-accent-primary/40 border-subtle"
            )}
          >
            <Search className="size-3.5 shrink-0 text-placeholder" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索团队"
              className="min-w-0 flex-1 border-0 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="flex size-5 items-center justify-center rounded text-placeholder hover:bg-layer-1-hover hover:text-primary"
                aria-label="清除搜索"
              >
                <X className="size-3" />
              </button>
            )}
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
