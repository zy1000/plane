/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { Check, ChevronDown } from "lucide-react";
import { PROJECT_ERROR_MESSAGES, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IProjectRole } from "@plane/types";
import { MultiSelectDropdown } from "@plane/ui";
import { useMember } from "@/hooks/store/use-member";

type ProjectRoleDropdownOption = {
  value: string;
  data: IProjectRole;
};

type Props = {
  workspaceSlug: string;
  projectId: string;
  memberId: string;
  selectedRoleIds: string[];
  roles: IProjectRole[];
  isLoading: boolean;
  disabled?: boolean;
};

export function ProjectRoleMultiSelect(props: Props) {
  const { workspaceSlug, projectId, memberId, selectedRoleIds, roles, isLoading, disabled = false } = props;
  const { t } = useTranslation();

  const {
    project: { updateMemberCustomRoles },
  } = useMember();

  const options: ProjectRoleDropdownOption[] = useMemo(
    () =>
      roles.map((role: IProjectRole) => ({
        value: role.id,
        data: role,
      })),
    [roles]
  );

  const buttonLabel = useMemo(() => {
    if (isLoading) return <span className="text-placeholder">加载中...</span>;
    if (selectedRoleIds.length === 0) return <span className="text-placeholder">选择角色</span>;
    const selectedNames = roles
      .filter((r) => selectedRoleIds.includes(r.id))
      .map((r) => r.name);
    if (selectedNames.length === 0) return <span className="text-placeholder">选择角色</span>;
    if (selectedNames.length === 1) return <span>{selectedNames[0]}</span>;
    return <span>{selectedNames[0]} +{selectedNames.length - 1}</span>;
  }, [isLoading, selectedRoleIds, roles]);

  const handleChange = async (newRoleIds: string[]) => {
    try {
      const savedRoleIds = await updateMemberCustomRoles(workspaceSlug, projectId, memberId, newRoleIds);
      const savedRoleNames = roles
        .filter((role) => savedRoleIds.includes(role.id))
        .map((role) => role.name);

      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "角色已更新",
        message: savedRoleNames.length > 0 ? `已分配角色：${savedRoleNames.join("、")}` : "已清空该成员的项目角色。",
      });
    } catch (error) {
      if (isProjectPermissionError(error)) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
          message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
            ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
            : undefined,
        });
      } else {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "更新角色失败",
          message: "更新成员角色时出现错误，请重试。",
        });
      }
    }
  };

  return (
    <MultiSelectDropdown
      value={selectedRoleIds}
      onChange={handleChange}
      options={options}
      disabled={disabled}
      disableSorting
      keyExtractor={(option) => option.data.id}
      queryArray={["name"]}
      inputPlaceholder="搜索角色..."
      buttonContent={() => (
        <div className="flex w-full items-center justify-between gap-1 rounded border border-strong px-3 py-2 text-13 cursor-pointer !px-0 !justify-start hover:bg-surface-1 border-none">
          {buttonLabel}
          <ChevronDown className="size-3 flex-shrink-0 text-secondary" />
        </div>
      )}
      buttonClassName="flex w-full items-center justify-between gap-1 rounded border border-strong px-3 py-2 text-13 cursor-pointer"
      containerClassName="w-32 rounded-md p-0"
      optionsContainerClassName="w-52"
      renderItem={({ value, selected }) => {
        const role = roles.find((r) => r.id === value);
        if (!role) return null;
        return (
          <div className="flex w-full items-center justify-between gap-2 truncate text-13">
            <span className="truncate">{role.name}</span>
            {selected && <Check className="size-3 flex-shrink-0" />}
          </div>
        );
      }}
    />
  );
}
