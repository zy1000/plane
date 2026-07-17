/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { Check, ChevronDown } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IWorkspaceRole } from "@plane/types";
import { MultiSelectDropdown } from "@plane/ui";
import { useMember } from "@/hooks/store/use-member";
import { useUser, useUserPermissions } from "@/hooks/store/user";

type TWorkspaceRoleOption = {
  value: string;
  data: IWorkspaceRole;
};

type Props = {
  workspaceSlug: string;
  memberId: string;
  selectedRoleIds: string[];
  inheritedRoleIds: string[];
  roles: IWorkspaceRole[];
  isLoading: boolean;
  disabled?: boolean;
};

export function WorkspaceRoleMultiSelect(props: Props) {
  const { workspaceSlug, memberId, selectedRoleIds, inheritedRoleIds, roles, isLoading, disabled = false } = props;
  const {
    workspace: { updateMemberCustomRoles },
  } = useMember();
  const { data: currentUser } = useUser();
  const { fetchWorkspacePermissionKeys } = useUserPermissions();

  const customRoles = useMemo(() => roles.filter((role) => !role.is_system), [roles]);
  const options: TWorkspaceRoleOption[] = useMemo(
    () => customRoles.map((role) => ({ value: role.id, data: role })),
    [customRoles]
  );
  const inheritedNames = roles.filter((role) => inheritedRoleIds.includes(role.id)).map((role) => role.name);

  const buttonLabel = useMemo(() => {
    if (isLoading) return <span className="text-placeholder">加载中...</span>;
    const selectedNames = customRoles.filter((role) => selectedRoleIds.includes(role.id)).map((role) => role.name);
    if (selectedNames.length === 0) return <span className="text-placeholder">选择角色</span>;
    if (selectedNames.length === 1) return <span>{selectedNames[0]}</span>;
    return (
      <span>
        {selectedNames[0]} +{selectedNames.length - 1}
      </span>
    );
  }, [customRoles, isLoading, selectedRoleIds]);

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
        <MultiSelectDropdown
          value={selectedRoleIds}
          onChange={handleChange}
          options={options}
          disabled={isLoading}
          disableSorting
          keyExtractor={(option) => option.data.id}
          queryArray={["name"]}
          inputPlaceholder="搜索角色..."
          buttonContent={() => (
            <div className="flex w-full cursor-pointer items-center justify-between gap-1 text-13">
              {buttonLabel}
              <ChevronDown className="size-3 shrink-0 text-secondary" />
            </div>
          )}
          buttonClassName="flex w-full items-center justify-between gap-1 rounded border-none px-0 py-1 text-13"
          containerClassName="w-40 rounded-md p-0"
          optionsContainerClassName="w-52"
          renderItem={({ value, selected }) => {
            const role = customRoles.find((item) => item.id === value);
            if (!role) return null;
            return (
              <div className="flex w-full items-center justify-between gap-2 truncate text-13">
                <span className="truncate">{role.name}</span>
                {selected && <Check className="size-3 shrink-0" />}
              </div>
            );
          }}
        />
      )}
      {inheritedNames.length > 0 && (
        <span className="truncate text-11 text-tertiary" title={inheritedNames.join("、")}>
          团队继承：{inheritedNames.join("、")}
        </span>
      )}
    </div>
  );
}
