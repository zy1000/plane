/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import type { TDataDictionaryItem, TProjectPermissionGroup } from "@plane/types";
import { Avatar, CustomMenu } from "@plane/ui";
import { cn, getFileURL, renderFormattedPayloadDate } from "@plane/utils";
import { JobRoleTags } from "@/components/workspace/settings/permission-groups";
import type { TProjectMemberRow } from "./use-project-members-table";

type Props = {
  rows: TProjectMemberRow[];
  isLoading: boolean;
  groups: TProjectPermissionGroup[];
  jobRoleMap: Map<string, TDataDictionaryItem>;
  isJobRoleColored: boolean;
  currentUserId: string | undefined;
  projectLeadId: string | null | undefined;
  canManage: boolean;
  onEdit: (row: TProjectMemberRow) => void;
  onRemove: (row: TProjectMemberRow) => void;
};

const CHIP = "inline-flex max-w-full items-center truncate rounded-md border px-2 py-0.5 text-12";

/** 项目成员表：成员 / 部门 / 角色 / 权限组 / 加入时间 / 操作 */
export const ProjectMembersTable = observer(function ProjectMembersTable(props: Props) {
  const { rows, isLoading, groups, jobRoleMap, isJobRoleColored, currentUserId, projectLeadId, canManage, onEdit, onRemove } =
    props;
  const groupMap = new Map(groups.map((group) => [group.id, group]));

  return (
    <div className="overflow-hidden rounded-lg border border-subtle">
      <table className="w-full table-fixed text-13">
        <thead className="bg-layer-1 text-left text-tertiary">
          <tr>
            <th className="w-[26%] px-4 py-2.5 font-medium">成员</th>
            <th className="w-[13%] px-4 py-2.5 font-medium">部门</th>
            <th className="w-[19%] px-4 py-2.5 font-medium">角色</th>
            <th className="w-[26%] px-4 py-2.5 font-medium">权限组</th>
            <th className="w-[11%] px-4 py-2.5 font-medium">加入时间</th>
            <th className="px-2 py-2.5" />
          </tr>
        </thead>
        <tbody className="divide-y divide-subtle">
          {isLoading
            ? [1, 2, 3, 4].map((index) => (
                <tr key={index}>
                  <td colSpan={6} className="px-4 py-3">
                    <div className="h-8 animate-pulse rounded bg-layer-1" />
                  </td>
                </tr>
              ))
            : rows.map((row) => {
                const isSelf = row.user.id === currentUserId;
                const isLead = row.user.id === projectLeadId;
                const directGroups = row.groupIds
                  .map((id) => groupMap.get(id))
                  .filter((group): group is TProjectPermissionGroup => Boolean(group));
                return (
                  <tr key={row.membershipId} className="align-middle">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={row.user.display_name} src={getFileURL(row.user.avatar_url ?? "")} size="md" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-primary">
                            {row.user.display_name}
                            {isLead && <span className="ml-1.5 text-11 font-normal text-tertiary">负责人</span>}
                          </p>
                          {row.user.email && <p className="truncate text-12 text-tertiary">{row.user.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="truncate px-4 py-2.5 text-secondary" title={row.department ?? undefined}>
                      {row.department ? row.department.split("/").pop() : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <JobRoleTags
                        jobRoleIds={row.jobRoleIds}
                        jobRoleMap={jobRoleMap}
                        isColored={isJobRoleColored}
                        max={3}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {directGroups.map((group) => (
                          <span key={group.id} className={cn(CHIP, "border-accent-subtle-1 bg-accent-subtle text-accent-primary")}>
                            {group.name}
                          </span>
                        ))}
                        {row.inheritedSources.map((source) => (
                          <span
                            key={`${source.group?.id}-${source.role.id}`}
                            title={`通过团队「${source.group?.name ?? ""}」继承`}
                            className={cn(CHIP, "border-dashed border-accent-subtle-1 text-accent-primary")}
                          >
                            {source.role.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-secondary tabular-nums">
                      {renderFormattedPayloadDate(row.joinedAt) ?? "—"}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <CustomMenu ellipsis placement="bottom-end" optionsClassName="p-1">
                        <CustomMenu.MenuItem disabled={!canManage} onClick={() => onEdit(row)}>
                          编辑角色与权限组
                        </CustomMenu.MenuItem>
                        {isSelf ? (
                          <CustomMenu.MenuItem disabled={isLead} onClick={() => onRemove(row)}>
                            <span className={isLead ? "text-placeholder" : "text-danger-primary"}>退出项目</span>
                          </CustomMenu.MenuItem>
                        ) : (
                          <CustomMenu.MenuItem disabled={!canManage || isLead} onClick={() => onRemove(row)}>
                            <span className={!canManage || isLead ? "text-placeholder" : "text-danger-primary"}>
                              移出项目
                            </span>
                          </CustomMenu.MenuItem>
                        )}
                      </CustomMenu>
                    </td>
                  </tr>
                );
              })}
          {!isLoading && rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-tertiary">
                没有匹配的成员
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});
