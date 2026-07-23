/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { Check, ChevronDown, ShieldCheck } from "lucide-react";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IProjectGroup, IProjectRole } from "@plane/types";
import { MultiSelectDropdown } from "@plane/ui";
import { cn } from "@plane/utils";
import type { TProjectGroupRoleMutationResult } from "@/hooks/store/use-project-groups";

type TProjectGroupRoleOption = {
  value: string;
  data: IProjectRole;
  disabled: boolean;
  className: () => string;
};

type Props = {
  group: IProjectGroup;
  roles: IProjectRole[];
  isRolesLoading: boolean;
  canEdit: boolean;
  className?: string;
  onAddRoles: (groupId: string, roleIds: string[]) => Promise<TProjectGroupRoleMutationResult>;
  onRemoveRole: (groupId: string, grantId: string) => Promise<void>;
  onPermissionsChanged: () => Promise<void>;
};

function RoleSummary({ group }: { group: IProjectGroup }) {
  if (group.grants.length === 0) return <span className="text-13 text-tertiary">未分配项目角色</span>;

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <ShieldCheck className="size-3.5 shrink-0 text-accent-primary" aria-hidden="true" />
      <span className="truncate text-13 font-medium text-primary">{group.grants[0].role_detail.name}</span>
      {group.grants.length > 1 && <span className="shrink-0 text-11 text-tertiary">+{group.grants.length - 1}</span>}
    </div>
  );
}

export function ProjectGroupRoleMultiSelect({
  group,
  roles,
  isRolesLoading,
  canEdit,
  className,
  onAddRoles,
  onRemoveRole,
  onPermissionsChanged,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedRoleIds = useMemo(() => group.grants.map((grant) => grant.role), [group.grants]);
  const selectedRoleIdSet = useMemo(() => new Set(selectedRoleIds), [selectedRoleIds]);

  const availableRoles = useMemo(() => {
    const rolesById = new Map(roles.map((role) => [role.id, role]));
    group.grants.forEach((grant) => {
      if (!rolesById.has(grant.role)) rolesById.set(grant.role, grant.role_detail);
    });
    return [...rolesById.values()];
  }, [group.grants, roles]);

  const options: TProjectGroupRoleOption[] = useMemo(
    () =>
      availableRoles.map((role) => {
        return {
          value: role.id,
          data: role,
          disabled: !canEdit,
          className: () => (!canEdit ? "cursor-not-allowed text-placeholder" : ""),
        };
      }),
    [availableRoles, canEdit]
  );

  const buttonLabel = useMemo(() => {
    if (isRolesLoading && canEdit) return <span className="text-placeholder">加载中...</span>;
    if (group.grants.length === 0) return <span className="text-placeholder">未分配项目角色</span>;
    if (group.grants.length === 1) return <span className="truncate">{group.grants[0].role_detail.name}</span>;
    return (
      <span className="truncate">
        {group.grants[0].role_detail.name} +{group.grants.length - 1}
      </span>
    );
  }, [canEdit, group.grants, isRolesLoading]);

  const handleChange = async (nextRoleIds: string[]) => {
    const addedRoleId = nextRoleIds.find((roleId) => !selectedRoleIdSet.has(roleId));
    const removedRoleId = selectedRoleIds.find((roleId) => !nextRoleIds.includes(roleId));
    if (!canEdit || (!addedRoleId && !removedRoleId)) return;

    setIsSubmitting(true);
    try {
      if (addedRoleId) {
        const result = await onAddRoles(group.id, [addedRoleId]);
        if (result.failures.length > 0) {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: "添加角色失败",
            message: result.failures[0].message,
          });
          return;
        }

        const roleName = availableRoles.find((role) => role.id === addedRoleId)?.name;
        await onPermissionsChanged().catch(() => undefined);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "角色已添加",
          message: roleName ? `已为团队分配「${roleName}」。` : "已为团队分配项目角色。",
        });
        return;
      }

      if (removedRoleId) {
        const grant = group.grants.find((item) => item.role === removedRoleId);
        if (!grant) return;
        await onRemoveRole(group.id, grant.id);
        await onPermissionsChanged().catch(() => undefined);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "角色已移除",
          message: `已从团队移除「${grant.role_detail.name}」。`,
        });
      }
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: removedRoleId ? "移除角色失败" : "添加角色失败",
        message: "更新团队角色时出现错误，请重试。",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canEdit) return <RoleSummary group={group} />;

  const isDropdownDisabled = isSubmitting || (isRolesLoading && canEdit);

  return (
    <div
      role="presentation"
      className={cn("min-w-0", className)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <MultiSelectDropdown
        value={selectedRoleIds}
        onChange={handleChange}
        options={options}
        disabled={isDropdownDisabled}
        disableSorting
        keyExtractor={(option) => option.data.id}
        queryArray={["name"]}
        inputPlaceholder="搜索角色..."
        buttonContent={() => (
          <div
            className={cn(
              "flex w-full items-center justify-between gap-1 rounded px-1 py-1 text-13",
              isDropdownDisabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-layer-1-hover"
            )}
          >
            {buttonLabel}
            <ChevronDown className="size-3 shrink-0 text-secondary" aria-hidden="true" />
          </div>
        )}
        buttonContainerClassName="w-full rounded"
        buttonClassName="flex w-full items-center justify-between gap-1 rounded border-none px-0 py-1 text-13"
        containerClassName="w-full rounded-md p-0"
        optionsContainerClassName="w-56"
        renderItem={({ value, selected, disabled }) => {
          const role = availableRoles.find((item) => item.id === value);
          if (!role) return null;
          return (
            <div
              className={cn(
                "flex w-full items-center justify-between gap-2 truncate text-13",
                disabled && "text-placeholder"
              )}
            >
              <span className="truncate">{role.name}</span>
              {selected && <Check className="size-3 shrink-0" aria-hidden="true" />}
            </div>
          );
        }}
      />
    </div>
  );
}
