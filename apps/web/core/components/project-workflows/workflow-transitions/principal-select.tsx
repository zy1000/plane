/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useMemo, useState } from "react";
import { Check, ChevronDown, UserCog, Users, X } from "lucide-react";
import { Avatar } from "@plane/ui";
import { cn } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import { useProjectRoles } from "@/hooks/store/use-project-roles";
import {
  WORKFLOW_SPECIAL_APPROVER_OPTIONS,
  buildRoleToken,
  getRoleIdFromToken,
  getWorkflowApproverLabel,
  isRoleToken,
} from "./approver-utils";
import { DropdownPanel } from "./dropdown-panel";

export type TPrincipalSelectDimension = "initiator" | "assignee" | "approver";

type TPrincipalSelectProps = {
  dimension: TPrincipalSelectDimension;
  workspaceSlug: string;
  projectId: string;
  value: string[];
  onChange: (principalIds: string[]) => void;
  disabled?: boolean;
};

type TSelectedPrincipal = {
  id: string;
  type: "dynamic" | "role" | "member";
  label: string;
  displayName?: string | null;
  avatarUrl?: string | null;
};

const DEFAULT_LABEL_BY_DIMENSION: Record<TPrincipalSelectDimension, string> = {
  initiator: "全部成员",
  assignee: "不约束",
  approver: "无需审批",
};

const DEFAULT_DESCRIPTION_BY_DIMENSION: Record<TPrincipalSelectDimension, string> = {
  initiator: "未配置发起人时默认全员可发起",
  assignee: "未配置负责人规则时默认不限制",
  approver: "未配置审批人时默认为直接通过",
};

export const PrincipalSelect: FC<TPrincipalSelectProps> = ({
  dimension,
  workspaceSlug,
  projectId,
  value,
  onChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);

  const {
    getUserDetails,
    project: { getProjectMemberIds, fetchProjectMembers },
  } = useMember();
  const {
    roles,
    fetchRoles,
    isLoading: isRolesLoading,
  } = useProjectRoles(workspaceSlug, projectId);

  const memberIds = getProjectMemberIds(projectId, false) ?? [];
  const isAllSelected = value.length === 0;

  const roleTokenNameMap = useMemo(
    () =>
      roles.reduce<Record<string, string>>((acc, role) => {
        acc[role.id] = role.name;
        return acc;
      }, {}),
    [roles]
  );

  const filteredSpecialOptions = WORKFLOW_SPECIAL_APPROVER_OPTIONS.filter((option) =>
    `${option.label} ${option.description}`.toLowerCase().includes(search.toLowerCase())
  );
  const filteredRoleOptions = search
    ? roles.filter((role) => role.name.toLowerCase().includes(search.toLowerCase()))
    : roles;
  const filteredMemberIds = search
    ? memberIds.filter((id) => {
        const user = getUserDetails(id);
        return (
          user?.display_name?.toLowerCase().includes(search.toLowerCase()) ||
          user?.email?.toLowerCase().includes(search.toLowerCase())
        );
      })
    : memberIds;

  const selectedPrincipals = useMemo<TSelectedPrincipal[]>(
    () =>
      value.map((principalId) => {
        const specialOption = WORKFLOW_SPECIAL_APPROVER_OPTIONS.find((option) => option.id === principalId);
        if (specialOption) {
          return {
            id: principalId,
            type: "dynamic",
            label: specialOption.label,
          };
        }

        if (isRoleToken(principalId)) {
          const roleId = getRoleIdFromToken(principalId);
          return {
            id: principalId,
            type: "role",
            label: roleId ? (roleTokenNameMap[roleId] ?? "项目角色") : "项目角色",
          };
        }

        const user = getUserDetails(principalId);
        return {
          id: principalId,
          type: "member",
          label: getWorkflowApproverLabel(principalId, getUserDetails, (roleId) => roleTokenNameMap[roleId]),
          displayName: user?.display_name,
          avatarUrl: user?.avatar_url,
        };
      }),
    [getUserDetails, roleTokenNameMap, value]
  );

  const handleOpen = async () => {
    if (disabled) return;
    setIsOpen(true);
    if (!getProjectMemberIds(projectId, false)) {
      void fetchProjectMembers(workspaceSlug, projectId);
    }
    if (roles.length === 0) {
      void fetchRoles();
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setSearch("");
  };

  const handleSelectAll = () => {
    onChange([]);
  };

  const handleToggle = (principalId: string) => {
    const next = value.includes(principalId) ? value.filter((v) => v !== principalId) : [...value, principalId];
    onChange(next);
  };

  const hasAnyResult =
    !search || filteredSpecialOptions.length > 0 || filteredRoleOptions.length > 0 || filteredMemberIds.length > 0;

  return (
    <div className="relative">
      <button
        ref={setReferenceElement}
        type="button"
        disabled={disabled}
        onClick={isOpen ? handleClose : handleOpen}
        className={cn(
          "flex min-h-9 w-full items-center gap-2 rounded-md border border-subtle bg-surface-1 px-2 py-1 text-sm transition-colors",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-accent-primary/50 hover:bg-surface-2",
          isOpen && "border-accent-primary/50"
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {isAllSelected ? (
            <span className="truncate text-left text-primary">{DEFAULT_LABEL_BY_DIMENSION[dimension]}</span>
          ) : (
            selectedPrincipals.map((principal) => (
              <span
                key={principal.id}
                className="inline-flex max-w-full items-center gap-1 rounded-sm border border-subtle bg-surface-2 px-1.5 py-0.5 text-xs text-primary"
              >
                {principal.type === "member" ? (
                  <Avatar
                    name={principal.displayName ?? principal.label}
                    src={principal.avatarUrl ?? undefined}
                    size="sm"
                    className="flex-shrink-0"
                  />
                ) : principal.type === "role" ? (
                  <Users className="h-3 w-3 flex-shrink-0 text-secondary" />
                ) : (
                  <UserCog className="h-3 w-3 flex-shrink-0 text-secondary" />
                )}
                <span className="max-w-40 truncate">{principal.label}</span>
                <span
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (disabled) return;
                    handleToggle(principal.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    if (disabled) return;
                    handleToggle(principal.id);
                  }}
                  className={cn(
                    "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded text-secondary transition-colors",
                    disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-layer-1 hover:text-primary"
                  )}
                  aria-label={`移除 ${principal.label}`}
                >
                  <X className="h-3 w-3" />
                </span>
              </span>
            ))
          )}
        </div>
        <ChevronDown className={cn("h-3.5 w-3.5 flex-shrink-0 text-secondary transition-transform", isOpen && "rotate-180")} />
      </button>

      <DropdownPanel isOpen={isOpen} referenceElement={referenceElement} onClose={handleClose} minWidth={260}>
        <div>
          <div className="border-b border-subtle p-2">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members"
              className="w-full rounded-sm border border-subtle bg-surface-2 px-2 py-1.5 text-xs text-primary placeholder:text-tertiary outline-none focus:border-accent-primary/50"
            />
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            {!search && (
              <button
                type="button"
                onClick={handleSelectAll}
                className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-layer-1"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border transition-colors",
                      isAllSelected ? "border-accent-primary bg-accent-primary" : "border-secondary bg-transparent"
                    )}
                  >
                    {isAllSelected && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <span className="font-medium text-primary">{DEFAULT_LABEL_BY_DIMENSION[dimension]}</span>
                </div>
                <span className="text-xs text-tertiary">{DEFAULT_DESCRIPTION_BY_DIMENSION[dimension]}</span>
              </button>
            )}

            {filteredSpecialOptions.length > 0 && (
              <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-tertiary">动态人员</p>
            )}
            {filteredSpecialOptions.map((option) => {
              const isSelected = value.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleToggle(option.id)}
                  className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-layer-1"
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border transition-colors",
                      isSelected ? "border-accent-primary bg-accent-primary" : "border-secondary bg-transparent"
                    )}
                  >
                    {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-primary">{option.label}</p>
                    <p className="text-xs text-secondary">{option.description}</p>
                  </div>
                </button>
              );
            })}

            {filteredRoleOptions.length > 0 && (
              <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-tertiary">角色</p>
            )}
            {filteredRoleOptions.map((role) => {
              const token = buildRoleToken(role.id);
              const isSelected = value.includes(token);
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => handleToggle(token)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-layer-1"
                >
                  <div
                    className={cn(
                      "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border transition-colors",
                      isSelected ? "border-accent-primary bg-accent-primary" : "border-secondary bg-transparent"
                    )}
                  >
                    {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <span className="truncate text-primary">{role.name}</span>
                </button>
              );
            })}

            {filteredMemberIds.length > 0 && (
              <p className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-tertiary">成员</p>
            )}
            {filteredMemberIds.map((memberId) => {
              const user = getUserDetails(memberId);
              if (!user) return null;
              const isSelected = value.includes(memberId);
              return (
                <button
                  key={memberId}
                  type="button"
                  onClick={() => handleToggle(memberId)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-layer-1"
                >
                  <div
                    className={cn(
                      "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border transition-colors",
                      isSelected ? "border-accent-primary bg-accent-primary" : "border-secondary bg-transparent"
                    )}
                  >
                    {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <Avatar name={user.display_name} src={user.avatar_url} size="sm" className="flex-shrink-0" />
                  <span className="truncate text-primary">{getWorkflowApproverLabel(memberId, getUserDetails)}</span>
                </button>
              );
            })}

            {isRolesLoading && (
              <p className="px-2 py-2 text-xs text-tertiary">正在加载成员与角色...</p>
            )}

            {!hasAnyResult && (
              <p className="px-2 py-2 text-center text-xs text-tertiary">无匹配对象</p>
            )}
          </div>
        </div>
      </DropdownPanel>
    </div>
  );
};
