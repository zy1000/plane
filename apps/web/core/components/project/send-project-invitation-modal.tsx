/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Avatar, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { ModalFieldError, ModalFieldLabel } from "@/components/common/form-modal";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { OptionMultiSelect } from "@/components/permission-groups";
import type { TChipOption } from "@/components/permission-groups";
import { errorMessage } from "@/components/project/settings/permission-groups/shared";
import { buildGroupOptions, buildJobRoleOptions } from "@/components/project/settings/members/helpers";
import { useJobRoles } from "@/hooks/store/use-job-roles";
import { useMember } from "@/hooks/store/use-member";
import { useProjectGroups } from "@/hooks/store/use-project-groups";
import { useProjectRoles } from "@/hooks/store/use-project-roles";
import { TeamMemberPicker } from "./team-member-picker";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  projectId: string;
  workspaceSlug: string;
};

/** 选中成员的标签（可去掉）；放在成员下拉的按钮里 */
const SelectedMemberChips = observer(function SelectedMemberChips({
  memberIds,
  onRemove,
}: {
  memberIds: string[];
  onRemove: (memberId: string) => void;
}) {
  const { getUserDetails } = useMember();
  return (
    <span className="flex min-h-10 w-full items-center gap-2 rounded-lg border border-subtle bg-surface-1 px-2 py-1.5 text-left hover:border-strong">
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {memberIds.length === 0 && <span className="px-1 text-13 text-placeholder">搜索姓名、工号</span>}
        {memberIds.map((memberId) => {
          const user = getUserDetails(memberId);
          return (
            <span
              key={memberId}
              className="inline-flex items-center gap-1 rounded-md border border-subtle bg-layer-1 py-0.5 pr-1.5 pl-1 text-13 text-primary"
            >
              <Avatar name={user?.display_name} src={getFileURL(user?.avatar_url ?? "")} size="sm" />
              {user?.display_name ?? "未知成员"}
              <span
                role="button"
                tabIndex={0}
                aria-label={`移除 ${user?.display_name ?? ""}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(memberId);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  event.stopPropagation();
                  onRemove(memberId);
                }}
                className="text-placeholder hover:text-primary"
              >
                <X className="size-3" />
              </span>
            </span>
          );
        })}
      </span>
      <ChevronDown className="size-4 shrink-0 text-tertiary" />
    </span>
  );
});

/** 「角色」里的一行：一个人在本项目的角色，默认带出他的工作区角色，可逐人调整 */
const MemberJobRoleRow = observer(function MemberJobRoleRow(props: {
  memberId: string;
  options: TChipOption[];
  value: string[];
  onChange: (value: string[]) => void;
  portalContainerRef: React.RefObject<HTMLElement>;
}) {
  const { memberId, options, value, onChange, portalContainerRef } = props;
  const { getUserDetails } = useMember();
  const user = getUserDetails(memberId);
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-3 px-3 py-1.5">
      <span className="flex min-w-0 items-center gap-2 text-13 text-primary">
        <Avatar name={user?.display_name} src={getFileURL(user?.avatar_url ?? "")} size="sm" />
        <span className="truncate">{user?.display_name ?? "未知成员"}</span>
      </span>
      <OptionMultiSelect
        options={options}
        value={value}
        onChange={onChange}
        placeholder="未设置"
        searchPlaceholder="搜索角色"
        portalContainerRef={portalContainerRef}
        className="min-h-9 border-transparent bg-transparent hover:border-subtle"
      />
    </div>
  );
});

/**
 * 添加项目成员（效果图「添加成员」弹窗）：一次选多个人，权限组统一给，角色逐人设置。
 * 「项目成员」权限组每人都有，固定显示；每个人的角色默认带出他在工作区的角色，显示出来可以改，
 * 留空就是不设——提交时总是带上 job_role_ids（空数组 = 不设），不走后端「没传就带工作区角色」的兜底。
 */
export const SendProjectInvitationModal = observer(function SendProjectInvitationModal({
  isOpen,
  onClose,
  onSuccess,
  projectId,
  workspaceSlug,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"form" | "team-picker">("form");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  /** 只记手动改过的人；没改过的显示他的工作区角色 */
  const [jobRoleOverrides, setJobRoleOverrides] = useState<Record<string, string[]>>({});
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [memberError, setMemberError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    project: { getProjectMemberDetails, bulkAddMembersToProject },
    workspace: { workspaceMemberIds, getWorkspaceMemberDetails },
  } = useMember();
  const { roles: groups, fetchRoles } = useProjectRoles(workspaceSlug, projectId);
  const { jobRoles } = useJobRoles(workspaceSlug);
  const {
    groups: teams,
    isLoading: isTeamsLoading,
    error: teamsError,
    fetchGroups: fetchTeams,
    getGroupMembers,
    loadGroupMembers,
  } = useProjectGroups(workspaceSlug, projectId);

  // 候选：工作区里还不是本项目成员、且没停用的人
  const candidateIds = useMemo(
    () =>
      (workspaceMemberIds ?? []).filter(
        (userId) =>
          getWorkspaceMemberDetails(userId)?.is_active !== false && !getProjectMemberDetails(userId, projectId)?.id
      ),
    [getProjectMemberDetails, getWorkspaceMemberDetails, projectId, workspaceMemberIds]
  );

  const jobRoleOptions = useMemo(() => buildJobRoleOptions(jobRoles), [jobRoles]);
  const getJobRoleIds = (memberId: string) => {
    if (jobRoleOverrides[memberId]) return jobRoleOverrides[memberId];
    const available = new Set(jobRoles.map((role) => role.id));
    return (getWorkspaceMemberDetails(memberId)?.job_role_ids ?? []).filter((id) => available.has(id));
  };

  useEffect(() => {
    if (!isOpen) return;
    void fetchRoles();
    void fetchTeams();
  }, [fetchRoles, fetchTeams, isOpen]);

  const reset = () => {
    setMemberIds([]);
    setJobRoleOverrides({});
    setGroupIds([]);
    setMemberError(undefined);
    setView("form");
  };

  const handleClose = () => {
    onClose();
    setTimeout(reset, 300);
  };

  const handleSubmit = async () => {
    if (memberIds.length === 0) {
      setMemberError("请选择成员");
      return;
    }
    setIsSubmitting(true);
    try {
      await bulkAddMembersToProject(workspaceSlug, projectId, {
        members: memberIds.map((memberId) => ({
          member_id: memberId,
          role_ids: groupIds,
          job_role_ids: getJobRoleIds(memberId),
        })),
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: `已添加 ${memberIds.length} 人` });
      onSuccess?.();
      handleClose();
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "添加失败", message: errorMessage(error, "请稍后重试") });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore
      isOpen={isOpen}
      handleClose={handleClose}
      position={EModalPosition.TOP}
      width={view === "team-picker" ? EModalWidth.XXXXL : EModalWidth.XXL}
    >
      {view === "team-picker" ? (
        <TeamMemberPicker
          groups={teams}
          isGroupsLoading={isTeamsLoading}
          groupsError={teamsError}
          excludedMemberIds={new Set(memberIds)}
          getGroupMembers={getGroupMembers}
          loadGroupMembers={loadGroupMembers}
          onBack={() => setView("form")}
          onConfirm={(ids) => {
            const allowed = new Set(candidateIds);
            setMemberIds((current) => Array.from(new Set([...current, ...ids.filter((id) => allowed.has(id))])));
            setMemberError(undefined);
            setView("form");
          }}
        />
      ) : (
        <div ref={containerRef} className="flex flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-subtle px-6 py-4">
            <h3 className="text-16 font-medium text-primary">添加成员</h3>
            <button
              type="button"
              className="text-13 text-accent-primary hover:underline"
              onClick={() => setView("team-picker")}
            >
              从团队导入
            </button>
          </div>
          <div className="flex flex-col gap-5 px-6 py-5">
            <div>
              <ModalFieldLabel required>成员</ModalFieldLabel>
              <MemberDropdown
                multiple
                value={memberIds}
                onChange={(ids) => {
                  setMemberIds(ids);
                  setMemberError(undefined);
                }}
                memberIds={candidateIds}
                buttonVariant="transparent-without-text"
                buttonContainerClassName="w-full"
                className="w-full"
                placement="bottom-start"
                optionsClassName="w-[30rem]"
                button={
                  <SelectedMemberChips
                    memberIds={memberIds}
                    onRemove={(memberId) => setMemberIds((current) => current.filter((id) => id !== memberId))}
                  />
                }
              />
              <ModalFieldError message={memberError} />
            </div>
            <div>
              <ModalFieldLabel note="默认带出工作区角色，可按本项目调整">角色</ModalFieldLabel>
              {memberIds.length === 0 ? (
                <div className="flex min-h-10 items-center rounded-lg border border-dashed border-subtle px-3 text-13 text-placeholder">
                  选择成员后设置各自在本项目的角色
                </div>
              ) : (
                <div className="max-h-64 divide-y divide-subtle overflow-y-auto rounded-lg border border-subtle">
                  {memberIds.map((memberId) => (
                    <MemberJobRoleRow
                      key={memberId}
                      memberId={memberId}
                      options={jobRoleOptions}
                      value={getJobRoleIds(memberId)}
                      onChange={(value) => setJobRoleOverrides((current) => ({ ...current, [memberId]: value }))}
                      portalContainerRef={containerRef}
                    />
                  ))}
                </div>
              )}
            </div>
            <div>
              <ModalFieldLabel>权限组</ModalFieldLabel>
              <OptionMultiSelect
                options={buildGroupOptions(groups)}
                value={groupIds}
                onChange={setGroupIds}
                tone="accent"
                placeholder="选择权限组"
                searchPlaceholder="搜索权限组"
                portalContainerRef={containerRef}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-subtle px-6 py-4">
            <Button variant="secondary" size="lg" onClick={handleClose} disabled={isSubmitting}>
              取消
            </Button>
            <Button
              variant="primary"
              size="lg"
              loading={isSubmitting}
              className={cn(memberIds.length === 0 && "opacity-90")}
              onClick={() => void handleSubmit()}
            >
              {memberIds.length > 0 ? `添加 ${memberIds.length} 人` : "添加"}
            </Button>
          </div>
        </div>
      )}
    </ModalCore>
  );
});
