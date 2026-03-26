/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { cn } from "@plane/utils";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { GroupsSidebar } from "@/components/workspace/settings/groups/groups-sidebar";
import { MembersPanel } from "@/components/workspace/settings/groups/members-panel";
import { RolesPanel } from "@/components/workspace/settings/groups/roles-panel";
// hooks
import { useWorkspaceGroups } from "@/hooks/store/use-workspace-groups";
import { useMember } from "@/hooks/store/use-member";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import type { Route } from "./+types/page";
import { GroupsWorkspaceSettingsHeader } from "./header";

const WorkspaceGroupsPage = observer(function WorkspaceGroupsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;

  // selected group state
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // store hooks
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { workspace: workspaceMemberStore, memberMap } = useMember();

  // derived permissions
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const canView = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
    EUserPermissionsLevel.WORKSPACE
  );

  // workspace groups hook
  const {
    groups,
    isLoading,
    getGroupDetail,
    loadGroupDetail,
    availableRoles,
    fetchAvailableRoles,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    addMember,
    removeMember,
    addRole,
    removeRole,
  } = useWorkspaceGroups(workspaceSlug);

  // fetch groups on mount
  useSWR(canView ? `WORKSPACE_GROUPS_${workspaceSlug}` : null, canView ? fetchGroups : null);

  // fetch available roles for admin
  useEffect(() => {
    if (isAdmin && workspaceSlug) {
      fetchAvailableRoles();
    }
  }, [isAdmin, workspaceSlug, fetchAvailableRoles]);

  // auto-select first group when groups load
  useEffect(() => {
    if (groups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(groups[0].id);
    }
    // if the selected group was deleted, select the first remaining group
    if (selectedGroupId && !groups.find((g) => g.id === selectedGroupId)) {
      setSelectedGroupId(groups.length > 0 ? groups[0].id : null);
    }
  }, [groups, selectedGroupId]);

  // load group detail when selection changes
  useEffect(() => {
    if (selectedGroupId) {
      void loadGroupDetail(selectedGroupId);
    }
  }, [selectedGroupId, loadGroupDetail]);

  // page title
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - 团队` : undefined;

  // build workspace member options list from the MobX store
  const memberOptions = useMemo(() => {
    const memberIds = workspaceMemberStore.getWorkspaceMemberIds(workspaceSlug);
    return memberIds
      .map((userId) => {
        const userLite = memberMap[userId];
        const membership = workspaceMemberStore.workspaceMemberMap?.[workspaceSlug]?.[userId];
        if (!userLite || !membership) return null;
        const displayName =
          `${userLite.first_name ?? ""} ${userLite.last_name ?? ""}`.trim() ||
          userLite.display_name ||
          userLite.email ||
          "";
        return {
          id: userId,
          memberId: membership.id,
          displayName,
          avatarUrl: userLite.avatar_url,
          email: userLite.email,
        };
      })
      .filter(Boolean) as { id: string; memberId: string; displayName: string; avatarUrl?: string; email?: string }[];
  }, [workspaceMemberStore, memberMap, workspaceSlug]);

  // selected group & detail
  const selectedGroup = selectedGroupId ? (groups.find((g) => g.id === selectedGroupId) ?? null) : null;
  const groupDetail = selectedGroupId ? getGroupDetail(selectedGroupId) : null;

  const handleSelectGroup = (groupId: string) => {
    setSelectedGroupId(groupId);
  };

  const handleDeleteGroup = async (groupId: string) => {
    await deleteGroup(groupId);
    // auto-select logic is handled by the useEffect above
  };

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<GroupsWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />

      <section
        className={cn(
          // SettingsContentWrapper wraps content in a ScrollArea with a py-9 div that
          // has no defined height. Using h-[calc(100svh-8rem)] gives the section a
          // viewport-relative fixed height so each panel can use flex-1 + overflow-y-auto
          // for independent scrolling. min-h-[560px] ensures a usable size on small screens.
          "flex h-[calc(100svh-8rem)] min-h-[560px] w-full overflow-hidden rounded-lg border border-subtle bg-surface-1",
          {
            "opacity-60 pointer-events-none": !canView,
          }
        )}
      >
        {/* Left: Groups list sidebar */}
        <GroupsSidebar
          groups={groups}
          totalGroupCount={groups.length}
          isLoading={isLoading}
          isAdmin={isAdmin}
          selectedGroupId={selectedGroupId}
          onSelectGroup={handleSelectGroup}
          onCreate={createGroup}
          onUpdate={async (groupId, data) => {
            await updateGroup(groupId, data);
          }}
          onDelete={handleDeleteGroup}
        />

        {/* Right: Members + Roles panels */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Selected group info header */}
          {selectedGroup && (
            <div className="flex shrink-0 items-start gap-3 border-b border-subtle bg-surface-1 px-6 py-3.5">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-body-md-semibold text-primary">{selectedGroup.name}</h2>
                {selectedGroup.description?.trim() && (
                  <p className="truncate text-body-xs-regular text-tertiary">{selectedGroup.description}</p>
                )}
              </div>
            </div>
          )}

          {/* Panels row */}
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <MembersPanel
              group={selectedGroup}
              members={groupDetail?.members ?? []}
              isLoading={Boolean(groupDetail?.isLoading)}
              isAdmin={isAdmin}
              memberOptions={memberOptions}
              onAddMember={addMember}
              onRemoveMember={removeMember}
            />
            <RolesPanel
              group={selectedGroup}
              roles={groupDetail?.roles ?? []}
              isLoading={Boolean(groupDetail?.isLoading)}
              isAdmin={isAdmin}
              availableRoles={availableRoles}
              onAddRole={addRole}
              onRemoveRole={removeRole}
            />
          </div>
        </div>
      </section>
    </SettingsContentWrapper>
  );
});

export default WorkspaceGroupsPage;
