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
import type { IProjectRole, IProjectRoleSource } from "@plane/types";
import { MultiSelectDropdown } from "@plane/ui";
import { cn } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";

type ProjectRoleDropdownOption = {
  value: string;
  data: IProjectRole;
  disabled?: boolean;
};

type Props = {
  workspaceSlug: string;
  projectId: string;
  memberId: string;
  selectedRoleIds: string[];
  /** 该成员通过团队继承的角色来源（type === "group_role"） */
  inheritedSources?: IProjectRoleSource[];
  roles: IProjectRole[];
  isLoading: boolean;
  disabled?: boolean;
};

export function ProjectRoleMultiSelect(props: Props) {
  const { workspaceSlug, projectId, memberId, selectedRoleIds, inheritedSources, roles, isLoading, disabled = false } =
    props;
  const { t } = useTranslation();

  const {
    project: { updateMemberCustomRoles },
  } = useMember();

  // roleId -> 继承该角色的团队名称列表
  const inheritedRoleTeams = useMemo(() => {
    const map = new Map<string, string[]>();
    (inheritedSources ?? []).forEach((source) => {
      if (source.type !== "group_role") return;
      const teamName = source.group?.name;
      if (!teamName) return;
      const teams = map.get(source.role.id) ?? [];
      if (!teams.includes(teamName)) teams.push(teamName);
      map.set(source.role.id, teams);
    });
    return map;
  }, [inheritedSources]);

  const options: ProjectRoleDropdownOption[] = useMemo(
    () =>
      roles.map((role: IProjectRole) => ({
        value: role.id,
        data: role,
        // 纯继承角色由团队授予，不能在此处直接增删
        disabled: inheritedRoleTeams.has(role.id) && !selectedRoleIds.includes(role.id),
      })),
    [roles, inheritedRoleTeams, selectedRoleIds]
  );

  const buttonLabel = useMemo(() => {
    if (isLoading) return <span className="text-placeholder">加载中...</span>;
    // 折叠态同时展示直接分配与团队继承的角色
    const allRoleIds = Array.from(new Set([...selectedRoleIds, ...inheritedRoleTeams.keys()]));
    const names = roles.filter((r) => allRoleIds.includes(r.id)).map((r) => r.name);
    if (names.length === 0) return <span className="text-placeholder">未直接分配</span>;
    if (names.length === 1) return <span>{names[0]}</span>;
    return <span>{names[0]} +{names.length - 1}</span>;
  }, [isLoading, selectedRoleIds, inheritedRoleTeams, roles]);

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
        const teams = inheritedRoleTeams.get(role.id);
        const isInherited = !!teams && teams.length > 0;
        return (
          <div
            className="flex w-full items-center justify-between gap-2 truncate text-13"
            title={isInherited ? `通过团队「${teams.join("、")}」继承` : undefined}
          >
            <span className={cn("flex items-center gap-1 truncate", isInherited && "text-accent-primary")}>
              <span className="truncate">{role.name}</span>
              {isInherited && <span className="truncate text-accent-secondary">· {teams.join("、")}</span>}
            </span>
            {(selected || isInherited) && <Check className="size-3 flex-shrink-0" />}
          </div>
        );
      }}
    />
  );
}
