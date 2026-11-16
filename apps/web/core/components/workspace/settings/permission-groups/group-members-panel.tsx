/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IPermissionGroup } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { AddMemberModal } from "@/components/workspace/settings/groups/add-member-modal";
import { useMember } from "@/hooks/store/use-member";
import type { usePermissionGroupMembers } from "@/hooks/store/use-permission-group-detail";
import { PermissionGroupMembersTable } from "./group-members-table";
import { PERMISSION_GROUP_KIND_LABELS, getPermissionGroupErrorMessage } from "./helpers";
import { getMemberDisplayName } from "./member-identity-cell";

type Props = {
  workspaceSlug: string;
  group: IPermissionGroup;
  canManage: boolean;
  /** 成员数据由详情页取（数字卡片也要用），这里只渲染和增删 */
  members: ReturnType<typeof usePermissionGroupMembers>;
  /** 加人 / 移人后刷新列表里的人数 */
  onChanged: () => void;
};

/**
 * 工作区权限组 / 数据权限详情的「成员」页签：直接添加的人 ∪ 挂着组所绑角色的人（「授权来源」列标明）。
 * 这里只能增删直接添加的人；经角色的要摘掉角色或解除组与角色的绑定。团队绑定带来的不在这里列（在团队页看）
 */
export const PermissionGroupMembersPanel = observer(function PermissionGroupMembersPanel(props: Props) {
  const { workspaceSlug, group, canManage, members, onChanged } = props;
  const { memberIds, isLoading, error, reload, addMembers, removeMember } = members;
  const {
    getUserDetails,
    workspace: { getWorkspaceMemberIds, workspaceMemberMap },
  } = useMember();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  const memberOptions = useMemo(
    () =>
      getWorkspaceMemberIds(workspaceSlug)
        .filter((userId) => workspaceMemberMap?.[workspaceSlug]?.[userId]?.is_active !== false)
        .map((userId) => {
          const user = getUserDetails(userId);
          if (!user) return null;
          return {
            id: userId,
            memberId: userId,
            displayName: getMemberDisplayName(user),
            avatarUrl: user.avatar_url,
            email: user.email,
          };
        })
        .filter((option): option is NonNullable<typeof option> => option !== null),
    [getWorkspaceMemberIds, getUserDetails, workspaceMemberMap, workspaceSlug]
  );

  const handleRemove = async () => {
    if (!pendingRemove) return;
    setIsRemoving(true);
    try {
      await removeMember(pendingRemove);
      onChanged();
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已移出" });
      setPendingRemove(null);
    } catch (removeError) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "移出失败",
        message: getPermissionGroupErrorMessage(removeError, "请稍后重试"),
      });
    } finally {
      setIsRemoving(false);
    }
  };

  const pendingUser = pendingRemove ? getUserDetails(pendingRemove) : undefined;

  return (
    <>
      <PermissionGroupMembersTable
        workspaceSlug={workspaceSlug}
        members={isLoading && members.members.length === 0 ? null : members.members}
        error={error}
        onRetry={() => void reload()}
        onRemove={canManage ? setPendingRemove : undefined}
        action={
          canManage ? (
            <Button variant="primary" size="xl" className="h-9 px-4" onClick={() => setIsAddOpen(true)}>
              添加成员
            </Button>
          ) : undefined
        }
      />

      <AddMemberModal
        isOpen={isAddOpen}
        memberOptions={memberOptions}
        existingMembers={memberIds.map((member) => ({ member }))}
        targetLabel={PERMISSION_GROUP_KIND_LABELS[group.kind]}
        onClose={() => setIsAddOpen(false)}
        onAdd={async (userIds) => {
          try {
            await addMembers(userIds);
            onChanged();
            return { succeededIds: userIds, failures: [] };
          } catch (addError) {
            return {
              succeededIds: [],
              failures: userIds.map((targetId) => ({
                targetId,
                message: getPermissionGroupErrorMessage(addError, "添加失败"),
              })),
            };
          }
        }}
      />

      <AlertModalCore
        isOpen={Boolean(pendingRemove)}
        handleClose={() => setPendingRemove(null)}
        handleSubmit={handleRemove}
        isSubmitting={isRemoving}
        title={`把 ${getMemberDisplayName(pendingUser)} 移出「${group.name}」？`}
        content={
          group.kind === "data"
            ? "移出后，该成员不再通过直接添加获得此数据权限组的项目 / 产品可见范围；经团队或角色获得的不受影响。"
            : "移出后，该成员不再通过直接添加拥有此权限组的权限；经团队或角色获得的不受影响。"
        }
        primaryButtonText={{ loading: "移出中", default: "移出" }}
      />
    </>
  );
});
