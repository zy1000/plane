/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { isEmpty } from "lodash-es";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IPermissionGroup, IWorkspaceMember } from "@plane/types";
// components
import { MembersLayoutLoader } from "@/components/ui/loader/layouts/members-layout-loader";
import { ConfirmWorkspaceMemberRemove } from "@/components/workspace/confirm-workspace-member-remove";
import type { RowData } from "@/components/workspace/settings/member-columns";
import { MemberAccessModal } from "@/components/workspace/settings/member-access-modal";
import { MembersVirtualTable } from "@/components/workspace/settings/members-virtual-table";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUser, useUserPermissions, useUserSettings } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
// plane web imports
import { useMemberColumns } from "@/plane-web/components/workspace/settings/useMemberColumns";

type Props = {
  memberDetails: (IWorkspaceMember | null)[];
};

export const WorkspaceMembersListItem = observer(function WorkspaceMembersListItem(props: Props) {
  const { memberDetails } = props;
  const {
    columns,
    workspaceSlug,
    removeMemberModal,
    setRemoveMemberModal,
    editingMember,
    setEditingMember,
    jobRoles,
    groups,
    groupMap,
  } = useMemberColumns();
  // router
  const router = useAppRouter();
  // store hooks
  const { data: currentUser } = useUser();
  const {
    workspace: { removeMemberFromWorkspace, updateMemberAccess },
  } = useMember();
  const { leaveWorkspace, fetchWorkspacePermissionKeys } = useUserPermissions();
  const { getWorkspaceRedirectionUrl } = useWorkspace();
  const { fetchCurrentUserSettings } = useUserSettings();
  const { t } = useTranslation();
  // derived values

  const handleLeaveWorkspace = async () => {
    if (!workspaceSlug || !currentUser) return;

    try {
      await leaveWorkspace(workspaceSlug.toString());
      await fetchCurrentUserSettings();
      router.push(getWorkspaceRedirectionUrl());
    } catch (err: unknown) {
      const error = err as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: error?.error || t("something_went_wrong_please_try_again"),
      });
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!workspaceSlug || !memberId) return;

    try {
      await removeMemberFromWorkspace(workspaceSlug.toString(), memberId);
    } catch (err: unknown) {
      const error = err as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: error?.error || t("something_went_wrong_please_try_again"),
      });
    }
  };

  const handleRemove = async (memberId: string) => {
    if (memberId === currentUser?.id) await handleLeaveWorkspace();
    else await handleRemoveMember(memberId);
  };

  // is the member current logged in user
  // const isCurrentUser = memberDetails?.member.id === currentUser?.id;
  // is the current logged in user admin
  // role change access-
  // 1. user cannot change their own role
  // 2. only admin or member can change role
  // 3. user cannot change role of higher role

  if (isEmpty(columns)) return <MembersLayoutLoader />;

  const teamGroupNames = editingMember
    ? (editingMember.group_role_ids ?? [])
        .filter((id) => !(editingMember.custom_role_ids ?? []).includes(id))
        .map((id) => groupMap.get(id))
        .filter((group): group is IPermissionGroup => !!group)
        .map((group) => group.name)
    : [];

  return (
    <div className="grid border-t border-subtle">
      <MemberAccessModal
        member={editingMember}
        jobRoles={jobRoles}
        groups={groups}
        teamGroupNames={teamGroupNames}
        onClose={() => setEditingMember(null)}
        onSubmit={async (value) => {
          if (!editingMember) return;
          await updateMemberAccess(workspaceSlug, editingMember.member.id, value);
          // 改的是自己：权限可能变了，刷新自己的 key
          if (editingMember.member.id === currentUser?.id) await fetchWorkspacePermissionKeys(workspaceSlug);
          setToast({ type: TOAST_TYPE.SUCCESS, title: "已保存", message: "成员的角色与权限组已更新" });
          setEditingMember(null);
        }}
      />
      {removeMemberModal && (
        <ConfirmWorkspaceMemberRemove
          isOpen={removeMemberModal.member.id.length > 0}
          onClose={() => setRemoveMemberModal(null)}
          userDetails={{
            id: removeMemberModal.member.id,
            display_name: removeMemberModal.member.display_name || "",
          }}
          onSubmit={() => handleRemove(removeMemberModal.member.id)}
        />
      )}
      <MembersVirtualTable<RowData>
        columns={columns ?? []}
        data={
          (memberDetails?.filter((member): member is IWorkspaceMember => member !== null) ?? []) as unknown as RowData[]
        }
        keyExtractor={(rowData) => rowData?.member.id ?? ""}
        tHeadClassName="border-b border-subtle"
        thClassName="text-left font-medium divide-x-0 text-placeholder"
        tBodyClassName="divide-y-0"
        tBodyTrClassName="divide-x-0 p-4 h-10 text-secondary"
        tHeadTrClassName="divide-x-0"
      />
    </div>
  );
});
