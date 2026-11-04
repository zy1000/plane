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
import { useJobRoles } from "@/hooks/store/use-job-roles";
import { useMember } from "@/hooks/store/use-member";
import { isIssueSchemeScopeKey } from "@/services/project/issue-scheme-scope";
import {
  WORKFLOW_SPECIAL_APPROVER_OPTIONS,
  buildJobRoleToken,
  getJobRoleIdFromToken,
  getWorkflowApproverLabel,
  isJobRoleToken,
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

type TSourceTab = "role" | "member" | "dynamic";

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

const SOURCE_TABS: { key: TSourceTab; label: string; placeholder: string }[] = [
  { key: "role", label: "按角色", placeholder: "搜索角色" },
  { key: "member", label: "指定成员", placeholder: "搜索成员" },
  { key: "dynamic", label: "动态", placeholder: "搜索" },
];

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border transition-colors",
        checked ? "border-accent-primary bg-accent-primary" : "border-secondary bg-transparent"
      )}
    >
      {checked && <Check className="h-2.5 w-2.5 text-white" />}
    </span>
  );
}

/**
 * 工作流的发起人 / 负责人 / 审批人选择（效果图「审批人按角色」）。
 * 来源分三类：按角色（数据字典 job_role，运行时矩阵优先找人）、指定成员、动态（工作项负责人 / 创建人）。
 * 方案作用域（模板中心维护模式方案）没有项目：成员取工作区成员，角色不显示人数。
 */
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
  const [tab, setTab] = useState<TSourceTab>("role");
  const [referenceElement, setReferenceElement] = useState<HTMLButtonElement | null>(null);

  const isSchemeScope = isIssueSchemeScopeKey(projectId);
  const {
    getUserDetails,
    project: { getProjectMemberIds, getProjectMemberDetails, fetchProjectMembers },
    workspace: { getWorkspaceMemberIds, fetchWorkspaceMembers },
  } = useMember();
  const { jobRoles, jobRoleMap, isLoading: isJobRolesLoading } = useJobRoles(workspaceSlug);

  const memberIds = (isSchemeScope ? getWorkspaceMemberIds(workspaceSlug) : getProjectMemberIds(projectId, false)) ?? [];
  const isAllSelected = value.length === 0;
  const query = search.trim().toLowerCase();

  // 项目作用域：每个角色在本项目有几个人挂着（研发矩阵优先的那一层前端拿不到，只数项目成员）
  const holderCountByRole = useMemo(() => {
    if (isSchemeScope) return null;
    const counts = new Map<string, number>();
    memberIds.forEach((memberId) => {
      (getProjectMemberDetails(memberId, projectId)?.job_role_ids ?? []).forEach((roleId) =>
        counts.set(roleId, (counts.get(roleId) ?? 0) + 1)
      );
    });
    return counts;
  }, [getProjectMemberDetails, isSchemeScope, memberIds, projectId]);

  const filteredRoles = query ? jobRoles.filter((role) => role.label.toLowerCase().includes(query)) : jobRoles;
  const filteredSpecialOptions = WORKFLOW_SPECIAL_APPROVER_OPTIONS.filter((option) =>
    `${option.label} ${option.description}`.toLowerCase().includes(query)
  );
  const filteredMemberIds = query
    ? memberIds.filter((id) => {
        const user = getUserDetails(id);
        return (
          user?.display_name?.toLowerCase().includes(query) ||
          user?.email?.toLowerCase().includes(query) ||
          user?.employee_id?.toLowerCase().includes(query)
        );
      })
    : memberIds;

  const selectedPrincipals = useMemo<TSelectedPrincipal[]>(
    () =>
      value.map((principalId) => {
        const specialOption = WORKFLOW_SPECIAL_APPROVER_OPTIONS.find((option) => option.id === principalId);
        if (specialOption) return { id: principalId, type: "dynamic", label: specialOption.label };
        if (isJobRoleToken(principalId)) {
          const jobRoleId = getJobRoleIdFromToken(principalId);
          return {
            id: principalId,
            type: "role",
            label: (jobRoleId && jobRoleMap.get(jobRoleId)?.label) || "已删除的角色",
          };
        }
        // 旧令牌（role: / role_template:）后端已不认，显示出来让人去掉
        if (principalId.startsWith("role:") || principalId.startsWith("role_template:")) {
          return { id: principalId, type: "role", label: "旧角色（请移除）" };
        }
        const user = getUserDetails(principalId);
        return {
          id: principalId,
          type: "member",
          label: getWorkflowApproverLabel(principalId, getUserDetails),
          displayName: user?.display_name,
          avatarUrl: user?.avatar_url,
        };
      }),
    [getUserDetails, jobRoleMap, value]
  );

  const handleOpen = () => {
    if (disabled) return;
    setIsOpen(true);
    if (value.some((id) => !isJobRoleToken(id) && !id.startsWith("special:"))) setTab("member");
    else if (value.length > 0 && value.every((id) => id.startsWith("special:"))) setTab("dynamic");
    if (isSchemeScope) {
      if (!getWorkspaceMemberIds(workspaceSlug)?.length) void fetchWorkspaceMembers(workspaceSlug);
      return;
    }
    if (!getProjectMemberIds(projectId, false)) void fetchProjectMembers(workspaceSlug, projectId);
  };

  const handleClose = () => {
    setIsOpen(false);
    setSearch("");
  };

  const handleToggle = (principalId: string) => {
    const next = value.includes(principalId) ? value.filter((v) => v !== principalId) : [...value, principalId];
    onChange(next);
  };

  const rowClass = "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-layer-1";

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

      <DropdownPanel isOpen={isOpen} referenceElement={referenceElement} onClose={handleClose} minWidth={300}>
        <div>
          <div className="flex flex-col gap-2 border-b border-subtle p-2">
            <div className="inline-flex w-fit rounded-md border border-subtle p-0.5">
              {SOURCE_TABS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setTab(item.key);
                    setSearch("");
                  }}
                  className={cn(
                    "rounded px-3 py-1 text-xs transition-colors",
                    tab === item.key ? "bg-accent-primary font-medium text-on-color" : "text-secondary hover:text-primary"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={SOURCE_TABS.find((item) => item.key === tab)?.placeholder}
              className="w-full rounded-sm border border-subtle bg-surface-2 px-2 py-1.5 text-xs text-primary placeholder:text-tertiary outline-none focus:border-accent-primary/50"
            />
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            {!query && (
              <button type="button" onClick={() => onChange([])} className={cn(rowClass, "justify-between")}>
                <span className="flex items-center gap-2">
                  <CheckBox checked={isAllSelected} />
                  <span className="font-medium text-primary">{DEFAULT_LABEL_BY_DIMENSION[dimension]}</span>
                </span>
                <span className="text-xs text-tertiary">{DEFAULT_DESCRIPTION_BY_DIMENSION[dimension]}</span>
              </button>
            )}

            {tab === "role" &&
              (filteredRoles.length > 0 ? (
                filteredRoles.map((role) => {
                  const token = buildJobRoleToken(role.id);
                  const isSelected = value.includes(token);
                  const count = holderCountByRole?.get(role.id) ?? 0;
                  return (
                    <button key={role.id} type="button" onClick={() => handleToggle(token)} className={rowClass}>
                      <CheckBox checked={isSelected} />
                      <span className={cn("min-w-0 flex-1 truncate", isSelected ? "font-medium text-accent-primary" : "text-primary")}>
                        {role.label}
                      </span>
                      {holderCountByRole && (
                        <span className={cn("shrink-0 text-xs", count === 0 ? "text-placeholder" : "text-tertiary")}>
                          {count} 人
                        </span>
                      )}
                    </button>
                  );
                })
              ) : (
                <p className="px-2 py-2 text-center text-xs text-tertiary">
                  {isJobRolesLoading ? "正在加载角色..." : query ? "无匹配角色" : "工作区还没有角色，请在数据字典「角色」里添加"}
                </p>
              ))}

            {tab === "member" &&
              (filteredMemberIds.length > 0 ? (
                filteredMemberIds.map((memberId) => {
                  const user = getUserDetails(memberId);
                  if (!user) return null;
                  return (
                    <button key={memberId} type="button" onClick={() => handleToggle(memberId)} className={rowClass}>
                      <CheckBox checked={value.includes(memberId)} />
                      <Avatar name={user.display_name} src={user.avatar_url} size="sm" className="flex-shrink-0" />
                      <span className="truncate text-primary">{getWorkflowApproverLabel(memberId, getUserDetails)}</span>
                    </button>
                  );
                })
              ) : (
                <p className="px-2 py-2 text-center text-xs text-tertiary">无匹配成员</p>
              ))}

            {tab === "dynamic" &&
              filteredSpecialOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleToggle(option.id)}
                  className={cn(rowClass, "items-start")}
                >
                  <span className="mt-0.5">
                    <CheckBox checked={value.includes(option.id)} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-primary">{option.label}</span>
                    <span className="block text-xs text-secondary">{option.description}</span>
                  </span>
                </button>
              ))}
          </div>
        </div>
      </DropdownPanel>
    </div>
  );
};
