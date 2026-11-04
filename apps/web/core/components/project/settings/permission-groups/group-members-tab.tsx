/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import { Loader } from "@plane/ui";
import {
  MemberIdentityCell,
  PermissionGroupSearch,
  getMemberDisplayName,
} from "@/components/workspace/settings/permission-groups";
import { useMember } from "@/hooks/store/use-member";

type Props = {
  memberIds: string[] | null;
  /** 项目成员设置页地址：给成员加减权限组在那里做 */
  membersPath: string;
};

const GRID = "grid grid-cols-[minmax(220px,1.6fr)_120px_minmax(140px,1fr)] items-center gap-x-4 px-5";

/** 项目权限组详情的「成员」页签：只读列表，加减人在项目「成员」页 */
export const PermissionGroupMembersTab = observer(function PermissionGroupMembersTab(props: Props) {
  const { memberIds, membersPath } = props;
  const { getUserDetails } = useMember();
  const [query, setQuery] = useState("");

  const keyword = query.trim().toLowerCase();
  const rows = (memberIds ?? [])
    .map((userId) => ({ userId, user: getUserDetails(userId) }))
    .filter(({ user }) => {
      if (!keyword) return true;
      const employeeId = (user as { employee_id?: string | null } | undefined)?.employee_id ?? "";
      return `${getMemberDisplayName(user)} ${user?.email ?? ""} ${employeeId}`.toLowerCase().includes(keyword);
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PermissionGroupSearch value={query} onChange={setQuery} placeholder="搜索姓名、邮箱、工号" className="w-72" />
        <Link to={membersPath} className="text-14 font-medium text-accent-primary hover:underline">
          到成员页调整
        </Link>
      </div>

      <div className="overflow-x-auto rounded-xl border border-subtle bg-surface-1">
        <div className="min-w-[560px]">
          <div className={`${GRID} h-11 border-b border-subtle bg-layer-1 text-13 font-medium text-tertiary`}>
            <span>成员</span>
            <span>工号</span>
            <span>部门</span>
          </div>
          {memberIds === null ? (
            <Loader className="flex flex-col gap-2 p-4">
              {[0, 1, 2].map((index) => (
                <Loader.Item key={index} height="40px" />
              ))}
            </Loader>
          ) : rows.length === 0 ? (
            <p className="py-14 text-center text-14 text-placeholder">{keyword ? "没有匹配的成员" : "还没有成员"}</p>
          ) : (
            rows.map(({ userId, user }) => {
              const extra = user as { employee_id?: string | null; department?: string | null } | undefined;
              return (
                <div key={userId} className={`${GRID} min-h-16 border-b border-subtle py-2 text-14 last:border-b-0`}>
                  <MemberIdentityCell user={user} size="lg" />
                  <span className="truncate text-secondary tabular-nums">{extra?.employee_id || "—"}</span>
                  <span className="truncate text-secondary" title={extra?.department ?? ""}>
                    {extra?.department || "—"}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
});
