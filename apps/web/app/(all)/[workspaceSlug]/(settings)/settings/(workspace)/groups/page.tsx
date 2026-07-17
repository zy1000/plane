/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { PlusIcon, Search, UsersRound, X } from "lucide-react";
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

      <section className="w-full">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2.5">
              <div className="flex size-9 items-center justify-center rounded-lg border border-subtle bg-layer-1 text-secondary">
                <UsersRound className="size-4" />
              </div>
              <div className="flex items-center gap-2">
                <h1 className="text-h3-medium text-primary">团队</h1>
                <CountChip count={groups.length} className="h-5" />
              </div>
            </div>
            <p className="mt-2 max-w-[70ch] text-13 leading-5 text-secondary">
              将工作区成员组织成团队，并通过角色统一授予权限。团队成员会自动继承该团队的全部角色权限。
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 py-2 focus-within:border-accent-strong sm:w-64">
              <Search className="size-3.5 shrink-0 text-placeholder" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索团队"
                className="min-w-0 flex-1 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="flex size-5 items-center justify-center rounded text-placeholder hover:bg-layer-1-hover hover:text-primary"
                  aria-label="清除团队搜索"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
            {canCreate && (
              <Button variant="primary" size="lg" prependIcon={<PlusIcon />} onClick={() => setShowCreateModal(true)}>
                创建团队
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-subtle bg-surface-1">
          <WorkspaceGroupsList
            groups={filteredGroups}
            totalGroupCount={groups.length}
            isLoading={isLoading}
            error={listError}
            hasSearchQuery={Boolean(searchQuery.trim())}
            activeGroupId={selectedGroupId}
            canEdit={canEdit}
            canDelete={canDelete}
            canCreate={canCreate}
            onOpen={(group) => setSelectedGroupId(group.id)}
            onEdit={setEditingGroup}
            onDelete={setPendingDelete}
            onRetry={() => void fetchGroups()}
            onCreate={() => setShowCreateModal(true)}
          />
        </div>
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
