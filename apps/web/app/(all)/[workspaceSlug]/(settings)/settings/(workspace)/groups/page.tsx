/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import {
  WORKSPACE_GROUP_CREATE_PERMISSION_KEY,
  WORKSPACE_GROUP_DELETE_PERMISSION_KEY,
  WORKSPACE_GROUP_EDIT_PERMISSION_KEY,
  WORKSPACE_GROUP_MANAGE_MEMBER_PERMISSION_KEY,
  WORKSPACE_GROUP_MANAGE_ROLE_PERMISSION_KEY,
  WORKSPACE_GROUP_VIEW_PERMISSION_KEY,
} from "@plane/constants";
import type { IWorkspaceGroup } from "@plane/types";
import { Button } from "@plane/propel/button";
import { SearchIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore } from "@plane/ui";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { CountChip } from "@/components/common/count-chip";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { GroupDetailPanel } from "@/components/workspace/settings/groups/group-detail-panel";
import { GroupFormModal } from "@/components/workspace/settings/groups/group-form-modal";
import { WorkspaceGroupsList } from "@/components/workspace/settings/groups/workspace-groups-list";
import { useWorkspaceGroups } from "@/hooks/store/use-workspace-groups";
import { useMember } from "@/hooks/store/use-member";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";
import { GroupsWorkspaceSettingsHeader } from "./header";

const WorkspaceGroupsPage = observer(function WorkspaceGroupsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<IWorkspaceGroup | null>(null);
  const [pendingDelete, setPendingDelete] = useState<IWorkspaceGroup | null>(null);
  const [isDeleteSubmitting, setIsDeleteSubmitting] = useState(false);

  const { workspaceUserInfo, allowWorkspacePermissionKeys, fetchWorkspacePermissionKeys } = useUserPermissions();
  const { currentWorkspace } = useWorkspace();
  const { workspace: workspaceMemberStore, memberMap } = useMember();

  const canView = allowWorkspacePermissionKeys([WORKSPACE_GROUP_VIEW_PERMISSION_KEY], workspaceSlug);
  const canCreate = allowWorkspacePermissionKeys([WORKSPACE_GROUP_CREATE_PERMISSION_KEY], workspaceSlug);
  const canEdit = allowWorkspacePermissionKeys([WORKSPACE_GROUP_EDIT_PERMISSION_KEY], workspaceSlug);
  const canDelete = allowWorkspacePermissionKeys([WORKSPACE_GROUP_DELETE_PERMISSION_KEY], workspaceSlug);
  const canManageMembers = allowWorkspacePermissionKeys([WORKSPACE_GROUP_MANAGE_MEMBER_PERMISSION_KEY], workspaceSlug);
  const canManageRoles = allowWorkspacePermissionKeys([WORKSPACE_GROUP_MANAGE_ROLE_PERMISSION_KEY], workspaceSlug);

  const {
    groups,
    isLoading,
    listError,
    getGroupDetail,
    loadGroupDetail,
    availableRoles,
    isAvailableRolesLoading,
    availableRolesError,
    fetchAvailableRoles,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    addMembers,
    removeMember,
    addRoles,
    removeRole,
  } = useWorkspaceGroups(workspaceSlug);

  useSWR(canView ? `WORKSPACE_GROUPS_${workspaceSlug}` : null, canView ? fetchGroups : null);

  useEffect(() => {
    if (canManageRoles && workspaceSlug) void fetchAvailableRoles();
  }, [canManageRoles, workspaceSlug, fetchAvailableRoles]);

  useEffect(() => {
    if (selectedGroupId) void loadGroupDetail(selectedGroupId);
  }, [selectedGroupId, loadGroupDetail]);

  useEffect(() => {
    if (selectedGroupId && !groups.some((group) => group.id === selectedGroupId)) setSelectedGroupId(null);
  }, [groups, selectedGroupId]);

  const memberOptions = useMemo(() => {
    const memberIds = workspaceMemberStore.getWorkspaceMemberIds(workspaceSlug);
    return memberIds
      .map((userId) => {
        const userLite = memberMap[userId];
        const membership = workspaceMemberStore.workspaceMemberMap?.[workspaceSlug]?.[userId];
        if (!userLite || !membership) return null;
        const displayName =
          userLite.display_name ||
          `${userLite.first_name ?? ""} ${userLite.last_name ?? ""}`.trim() ||
          userLite.email ||
          "未知成员";
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

  const filteredGroups = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return groups;
    return groups.filter(
      (group) =>
        group.name.toLowerCase().includes(normalizedQuery) || group.description?.toLowerCase().includes(normalizedQuery)
    );
  }, [groups, searchQuery]);

  const selectedGroup = selectedGroupId ? (groups.find((group) => group.id === selectedGroupId) ?? null) : null;
  const groupDetail = selectedGroupId ? getGroupDetail(selectedGroupId) : null;
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace.name} - 团队` : undefined;

  const handleCreate = async (data: { name: string; description: string }) => {
    const newGroup = await createGroup(data);
    setToast({ type: TOAST_TYPE.SUCCESS, title: "团队已创建", message: `已创建「${newGroup.name}」` });
    setSelectedGroupId(newGroup.id);
  };

  const handleUpdate = async (data: { name: string; description: string }) => {
    if (!editingGroup) return;
    await updateGroup(editingGroup.id, data);
    setToast({ type: TOAST_TYPE.SUCCESS, title: "已保存", message: "团队信息已更新" });
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleteSubmitting(true);
    try {
      await deleteGroup(pendingDelete.id);
      if (selectedGroupId === pendingDelete.id) setSelectedGroupId(null);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "团队已删除", message: `已删除「${pendingDelete.name}」` });
      setPendingDelete(null);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "删除失败", message: "请稍后重试" });
    } finally {
      setIsDeleteSubmitting(false);
    }
  };

  if (workspaceUserInfo && !canView) {
    return <NotAuthorizedView section="settings" className="h-auto" />;
  }

  return (
    <SettingsContentWrapper header={<GroupsWorkspaceSettingsHeader />} hugging>
      <PageHead title={pageTitle} />

      <section className="size-full">
        <div className="flex items-center justify-between gap-4 pb-3.5">
          <h4 className="flex items-center gap-2.5 text-h3-medium">
            团队
            {groups.length > 0 && <CountChip count={groups.length} className="m-auto h-5" />}
          </h4>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5 py-1.5">
              <SearchIcon className="h-3.5 w-3.5 text-placeholder" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索..."
                className="w-full max-w-[234px] border-none bg-transparent text-body-xs-regular outline-none placeholder:text-placeholder"
              />
            </div>
            {canCreate && (
              <Button variant="primary" size="lg" onClick={() => setShowCreateModal(true)}>
                创建团队
              </Button>
            )}
          </div>
        </div>

        <WorkspaceGroupsList
          groups={filteredGroups}
          totalGroupCount={groups.length}
          isLoading={isLoading}
          error={listError}
          hasSearchQuery={Boolean(searchQuery.trim())}
          canEdit={canEdit}
          canDelete={canDelete}
          onOpen={(group) => setSelectedGroupId(group.id)}
          onEdit={setEditingGroup}
          onDelete={setPendingDelete}
          onRetry={() => void fetchGroups()}
        />
      </section>

      <GroupFormModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} onSubmit={handleCreate} />
      <GroupFormModal
        isOpen={Boolean(editingGroup)}
        group={editingGroup}
        onClose={() => setEditingGroup(null)}
        onSubmit={handleUpdate}
      />

      <GroupDetailPanel
        isOpen={Boolean(selectedGroup)}
        group={selectedGroup}
        members={groupDetail?.members ?? []}
        roles={groupDetail?.roles ?? []}
        isDetailLoading={Boolean(groupDetail?.isLoading)}
        isDetailLoaded={Boolean(groupDetail?.loaded)}
        detailError={groupDetail?.error ?? null}
        availableRoles={availableRoles}
        isAvailableRolesLoading={isAvailableRolesLoading}
        availableRolesError={availableRolesError}
        memberOptions={memberOptions}
        canEdit={canEdit}
        canDelete={canDelete}
        canManageMembers={canManageMembers}
        canManageRoles={canManageRoles}
        onClose={() => setSelectedGroupId(null)}
        onEdit={setEditingGroup}
        onDelete={setPendingDelete}
        onRetryDetail={(groupId) => void loadGroupDetail(groupId, true)}
        onRetryAvailableRoles={() => void fetchAvailableRoles()}
        onAddMembers={addMembers}
        onRemoveMember={removeMember}
        onAddRoles={addRoles}
        onRemoveRole={removeRole}
        onPermissionsChanged={async () => {
          await fetchWorkspacePermissionKeys(workspaceSlug);
        }}
      />

      <AlertModalCore
        isOpen={Boolean(pendingDelete)}
        handleClose={() => setPendingDelete(null)}
        handleSubmit={handleConfirmDelete}
        isSubmitting={isDeleteSubmitting}
        title="删除此团队？"
        content={
          pendingDelete ? (
            <>
              删除「<span className="font-medium text-primary">{pendingDelete.name}</span>
              」后，团队成员将不再通过该团队继承角色权限。成员账号和角色本身不会被删除，此操作不可恢复。
            </>
          ) : null
        }
        secondaryButtonText="取消"
        primaryButtonText={{ default: "删除团队", loading: "删除中…" }}
      />
    </SettingsContentWrapper>
  );
});

export default WorkspaceGroupsPage;
