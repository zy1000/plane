/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IWorkspaceRole } from "@plane/types";
import { useMember } from "@/hooks/store/use-member";
import { useUser, useUserPermissions } from "@/hooks/store/user";
// local imports
import { WorkspaceRoleMultiSelectField } from "./workspace-role-multi-select-field";

type Props = {
  workspaceSlug: string;
  memberId: string;
  selectedRoleIds: string[];
  roles: IWorkspaceRole[];
  isLoading: boolean;
  disabled?: boolean;
};

export function WorkspaceRoleMultiSelect(props: Props) {
  const { workspaceSlug, memberId, selectedRoleIds, roles, isLoading, disabled = false } = props;
  const {
    workspace: { updateMemberCustomRoles },
  } = useMember();
  const { data: currentUser } = useUser();
  const { fetchWorkspacePermissionKeys } = useUserPermissions();

  const customRoles = useMemo(() => roles.filter((role) => !role.is_system), [roles]);

  const selectedRoleNames = useMemo(
    () => customRoles.filter((role) => selectedRoleIds.includes(role.id)).map((role) => role.name),
    [customRoles, selectedRoleIds]
  );

  const handleChange = async (roleIds: string[]) => {
    try {
      const savedRoleIds = await updateMemberCustomRoles(workspaceSlug, memberId, roleIds);
      if (currentUser?.id === memberId) await fetchWorkspacePermissionKeys(workspaceSlug);
      const names = customRoles.filter((role) => savedRoleIds.includes(role.id)).map((role) => role.name);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "角色已更新",
        message: names.length > 0 ? `已分配角色：${names.join("、")}` : "已清空该成员的自定义角色。",
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "更新角色失败",
        message: "更新成员角色时出现错误，请重试。",
      });
    }
  };

  return (
    <div className="flex w-40 flex-col gap-1">
      {disabled ? (
        <span className={selectedRoleNames.length === 0 ? "text-13 text-placeholder" : "truncate text-13"}>
          {selectedRoleNames.length > 0 ? selectedRoleNames.join("、") : "—"}
        </span>
      ) : (
        <WorkspaceRoleMultiSelectField
          roles={roles}
          isLoading={isLoading}
          value={selectedRoleIds}
          onChange={handleChange}
        />
      )}
    </div>
  );
}
