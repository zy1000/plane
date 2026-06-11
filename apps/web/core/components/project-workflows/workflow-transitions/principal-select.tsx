/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Avatar } from "@plane/ui";
import { cn } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import { useProjectRoles } from "@/hooks/store/use-project-roles";
import {
  WORKFLOW_SPECIAL_APPROVER_OPTIONS,
  buildRoleToken,
  getWorkflowApproverLabel,
} from "./approver-utils";

export type TPrincipalSelectDimension = "initiator" | "assignee" | "approver";

type TPrincipalSelectProps = {
  dimension: TPrincipalSelectDimension;
  workspaceSlug: string;
  projectId: string;
  value: string[];
  requiredCount: number;
  isNofM: boolean;
  showApprovalRule?: boolean;
  onChange: (principalIds: string[], count: number, useNofM: boolean) => void;
  disabled?: boolean;
};

const DEFAULT_LABEL_BY_DIMENSION: Record<TPrincipalSelectDimension, string> = {
  initiator: "全部成员",
  assignee: "不约束",
  approver: "All",
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
  requiredCount,
  isNofM,
  showApprovalRule = true,
  onChange,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

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
  const shouldShowApprovalRule = dimension === "approver" && showApprovalRule;

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

  const selectedSummary = (() => {
    if (isAllSelected) return DEFAULT_LABEL_BY_DIMENSION[dimension];
    const labels = value.map((id) => getWorkflowApproverLabel(id, getUserDetails, (roleId) => roleTokenNameMap[roleId]));
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return labels.join("、");
    return `${labels.length} 个对象`;
  })();

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

  const handleSelectAll = () => {
    onChange([], 1, false);
  };

  const handleToggle = (principalId: string) => {
    const next = value.includes(principalId) ? value.filter((v) => v !== principalId) : [...value, principalId];
    const nextCount = Math.min(requiredCount, Math.max(1, next.length));
    const nextUseNofM = shouldShowApprovalRule ? (next.length >= 2 ? isNofM : false) : false;
    onChange(next, nextCount, nextUseNofM);
  };

  useEffect(() => {
    if (!isOpen) return;

    const onMouseDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [isOpen]);

  const hasAnyResult =
    (!search && true) || filteredSpecialOptions.length > 0 || filteredRoleOptions.length > 0 || filteredMemberIds.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={isOpen ? () => setIsOpen(false) : handleOpen}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 text-sm transition-colors",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-accent-primary/50 hover:bg-surface-2",
          isOpen && "border-accent-primary/50"
        )}
      >
        <span className="flex-1 truncate text-left text-primary">{selectedSummary}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 flex-shrink-0 text-secondary transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-20 mt-1 w-full min-w-[260px] rounded-md border border-subtle bg-surface-1 shadow-lg">
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
                  <span className="truncate text-primary">{role.name}（角色）</span>
                </button>
              );
            })}

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

            {shouldShowApprovalRule && !isAllSelected && value.length >= 2 && (
              <div className="mt-2 border-t border-subtle px-2 pt-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onChange(value, requiredCount, !isNofM)}
                    className={cn(
                      "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border transition-colors",
                      isNofM ? "border-accent-primary bg-accent-primary" : "border-secondary bg-transparent"
                    )}
                  >
                    {isNofM && <Check className="h-2.5 w-2.5 text-white" />}
                  </button>
                  <span className="flex-1 text-xs text-secondary">最少需要审批人数</span>
                  {isNofM && (
                    <input
                      type="number"
                      min={1}
                      max={value.length}
                      value={requiredCount}
                      onChange={(e) => {
                        const next = parseInt(e.target.value, 10);
                        if (Number.isNaN(next)) return;
                        onChange(value, Math.min(Math.max(1, next), value.length), isNofM);
                      }}
                      className="w-12 rounded border border-subtle bg-surface-2 px-1.5 py-0.5 text-center text-sm font-medium text-primary outline-none focus:border-accent-primary/50"
                    />
                  )}
                </div>
              </div>
            )}

            {isRolesLoading && (
              <p className="px-2 py-2 text-xs text-tertiary">正在加载成员与角色...</p>
            )}

            {!hasAnyResult && (
              <p className="px-2 py-2 text-center text-xs text-tertiary">无匹配对象</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
