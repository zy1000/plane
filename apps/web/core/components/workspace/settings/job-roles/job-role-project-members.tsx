/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import { Button } from "@plane/propel/button";
import { Avatar, AvatarGroup, Loader } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { getMemberDisplayName } from "@/components/workspace/settings/permission-groups/member-identity-cell";
import { PermissionGroupPager, PermissionGroupSearch } from "@/components/workspace/settings/permission-groups/ui";
import { useMember } from "@/hooks/store/use-member";
import { useJobRoleProjectMembers } from "@/hooks/store/use-workspace-job-roles";

const GRID = "grid grid-cols-[minmax(220px,1.4fr)_minmax(240px,1.8fr)_80px_64px] items-center gap-x-4 px-5";
const PAGE_SIZE = 20;

/** 角色详情「项目成员」页签：各项目里挂了这个角色的成员（在项目设置 › 成员里维护） */
export const JobRoleProjectMembers = observer(function JobRoleProjectMembers(props: {
  workspaceSlug: string;
  roleId: string;
}) {
  const { workspaceSlug, roleId } = props;
  const { getUserDetails } = useMember();
  const { data, isLoading, error, reload } = useJobRoleProjectMembers(workspaceSlug, roleId, true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  const keyword = query.trim().toLowerCase();
  const rows = data
    .map((entry) => ({ ...entry, names: entry.member_ids.map((userId) => getMemberDisplayName(getUserDetails(userId))) }))
    .filter((entry) => {
      if (!keyword) return true;
      const { name, code, identifier } = entry.project;
      return `${name} ${code} ${identifier} ${entry.names.join(" ")}`.toLowerCase().includes(keyword);
    });
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-3">
      <PermissionGroupSearch
        value={query}
        onChange={(value) => {
          setQuery(value);
          setPage(1);
        }}
        placeholder="搜索项目、成员"
        className="w-72"
      />
      <div className="overflow-x-auto rounded-xl border border-subtle bg-surface-1">
        <div className="min-w-[760px]">
          <div className={cn(GRID, "h-11 border-b border-subtle bg-layer-1 text-13 font-medium text-tertiary")}>
            <span>项目</span>
            <span>成员</span>
            <span>人数</span>
            <span className="flex justify-end">操作</span>
          </div>
          {isLoading && data.length === 0 ? (
            <Loader className="flex flex-col gap-2 p-4">
              {[0, 1, 2].map((index) => (
                <Loader.Item key={index} height="40px" />
              ))}
            </Loader>
          ) : error ? (
            <div className="py-10 text-center">
              <p className="text-13 text-secondary">{error}</p>
              <Button className="mt-3" variant="secondary" size="lg" onClick={() => void reload()}>
                重试
              </Button>
            </div>
          ) : pageRows.length === 0 ? (
            <p className="py-14 text-center text-14 text-placeholder">{keyword ? "没有匹配的项目" : "暂无项目成员"}</p>
          ) : (
            pageRows.map((entry) => (
              <div
                key={entry.project.id}
                className={cn(GRID, "min-h-[60px] border-b border-subtle py-2 text-14 last:border-b-0")}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-primary" title={entry.project.name}>
                    {entry.project.name}
                  </span>
                  <span className="truncate text-13 text-tertiary">{entry.project.code || entry.project.identifier}</span>
                </span>
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="shrink-0">
                    <AvatarGroup max={3} size="md" showTooltip={false}>
                      {entry.member_ids.map((userId) => {
                        const user = getUserDetails(userId);
                        return (
                          <Avatar
                            key={userId}
                            name={user?.display_name ?? user?.first_name}
                            src={getFileURL(user?.avatar_url ?? "")}
                          />
                        );
                      })}
                    </AvatarGroup>
                  </span>
                  <span className="truncate text-secondary" title={entry.names.join("、")}>
                    {entry.names.join("、")}
                  </span>
                </span>
                <span className="text-primary tabular-nums">{entry.member_ids.length} 人</span>
                <span className="flex justify-end">
                  <Link
                    to={`/${workspaceSlug}/settings/projects/${entry.project.id}/members`}
                    className="text-14 text-accent-primary hover:underline"
                  >
                    查看
                  </Link>
                </span>
              </div>
            ))
          )}
        </div>
      </div>
      <PermissionGroupPager total={rows.length} page={currentPage} pageCount={pageCount} onPageChange={setPage} unit="个项目" />
    </div>
  );
});
