/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Check, Search } from "lucide-react";
import { Popover } from "@plane/propel/popover";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TJobRoleOption } from "@plane/types";
import { Avatar } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";
import { errorMessage } from "../permission-groups/shared";

type Props = {
  projectId: string;
  jobRole: TJobRoleOption;
  jobRoleMap: Map<string, TJobRoleOption>;
  memberIds: string[];
  editable: boolean;
  onChange: (memberIds: string[]) => Promise<void>;
};

const MemberLine = observer(function MemberLine({ userId }: { userId: string }) {
  const { getUserDetails } = useMember();
  const user = getUserDetails(userId);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <Avatar name={user?.display_name} src={getFileURL(user?.avatar_url ?? "")} size="md" />
      <span className="truncate text-13 text-primary">{user?.display_name ?? "未知成员"}</span>
    </span>
  );
});

/**
 * 研发矩阵的一格：点开从项目成员里选人（可多选，点一下就存）。
 * 挂着这个角色的成员排在「角色匹配」里，其余在「其他项目成员」。
 */
export const ProductTeamMatrixCell = observer(function ProductTeamMatrixCell(props: Props) {
  const { projectId, jobRole, jobRoleMap, memberIds, editable, onChange } = props;
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const {
    getUserDetails,
    project: { getProjectMemberIds, getProjectMemberDetails },
  } = useMember();

  const projectMemberIds = getProjectMemberIds(projectId, true);
  const { matched, others } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const result: { matched: { id: string; roles: string }[]; others: { id: string; roles: string }[] } = {
      matched: [],
      others: [],
    };
    (projectMemberIds ?? []).forEach((userId) => {
      const user = getUserDetails(userId);
      if (!user) return;
      if (q) {
        const haystack = [user.display_name, user.email, user.employee_id].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return;
      }
      const jobRoleIds = getProjectMemberDetails(userId, projectId)?.job_role_ids ?? [];
      const roles = jobRoleIds.map((id) => jobRoleMap.get(id)?.label).filter(Boolean).join("、");
      (jobRoleIds.includes(jobRole.id) ? result.matched : result.others).push({ id: userId, roles });
    });
    return result;
  }, [getProjectMemberDetails, getUserDetails, jobRole.id, jobRoleMap, projectId, projectMemberIds, query]);

  const toggle = async (userId: string) => {
    const next = memberIds.includes(userId) ? memberIds.filter((id) => id !== userId) : [...memberIds, userId];
    try {
      await onChange(next);
    } catch (error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "保存失败", message: errorMessage(error, "请稍后重试") });
    }
  };

  const content =
    memberIds.length === 0 ? (
      <span className="text-placeholder">—</span>
    ) : (
      <span className="flex flex-col gap-1.5">
        {memberIds.map((userId) => (
          <MemberLine key={userId} userId={userId} />
        ))}
      </span>
    );

  if (!editable) return <div className="px-3 py-2.5">{content}</div>;

  const renderSection = (title: string, items: { id: string; roles: string }[]) =>
    items.length > 0 && (
      <div className="py-1">
        <p className="px-3 pt-1 pb-1 text-11 text-tertiary">{title}</p>
        {items.map((item) => {
          const selected = memberIds.includes(item.id);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => void toggle(item.id)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-layer-1-hover",
                selected && "bg-accent-subtle"
              )}
            >
              <span className="min-w-0 flex-1">
                <MemberLine userId={item.id} />
                {item.roles && <span className="block truncate pl-7 text-11 text-tertiary">{item.roles}</span>}
              </span>
              <Check className={cn("size-3.5 shrink-0 text-accent-primary", !selected && "invisible")} />
            </button>
          );
        })}
      </div>
    );

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setQuery("");
      }}
    >
      <Popover.Button
        className={cn(
          "block h-full w-full rounded-md border px-3 py-2.5 text-left transition-colors",
          isOpen ? "border-accent-strong" : "border-transparent hover:border-subtle hover:bg-layer-1-hover"
        )}
      >
        {content}
      </Popover.Button>
      <Popover.Panel
        placement="bottom-start"
        sideOffset={4}
        positionerClassName="z-30"
        className="w-68 rounded-lg border border-subtle bg-surface-1 shadow-overlay-200"
      >
        <div className="border-b border-subtle p-2">
          <div className="flex items-center gap-1.5 rounded-md border border-subtle px-2.5 py-1.5">
            <Search className="size-3.5 shrink-0 text-placeholder" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索项目成员"
              className="min-w-0 flex-1 border-none bg-transparent text-13 outline-none placeholder:text-placeholder"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {renderSection("角色匹配", matched)}
          {renderSection(matched.length ? "其他项目成员" : "项目成员", others)}
          {matched.length === 0 && others.length === 0 && (
            <p className="px-3 py-4 text-center text-13 text-tertiary">没有匹配的项目成员</p>
          )}
        </div>
      </Popover.Panel>
    </Popover>
  );
});
