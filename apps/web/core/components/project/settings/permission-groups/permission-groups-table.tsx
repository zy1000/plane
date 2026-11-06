/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { Link } from "react-router";
import type { TProjectInheritedGroup, TProjectPermissionGroup } from "@plane/types";
import { Avatar, AvatarGroup, Loader } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { formatKeyCount, getPermissionGroupDetailPath } from "@/components/workspace/settings/permission-groups";
import { useMember } from "@/hooks/store/use-member";
import { deleteActionLabel, isGroupEditable } from "./shared";

/** 列表分段 / 筛选：本项目自己的组、引用的模板、在本项目生效的工作区权限组 */
export type TProjectGroupSection = "project" | "template" | "workspace";
export type TProjectGroupFilter = "all" | TProjectGroupSection;

type Props = {
  workspaceSlug: string;
  groups: TProjectPermissionGroup[];
  inheritedGroups: TProjectInheritedGroup[];
  filter: TProjectGroupFilter;
  totalKeyCount: number;
  canManage: boolean;
  isLoading: boolean;
  /** 搜索 / 筛选后没有结果时的说法 */
  emptyText: string;
  onOpen: (group: TProjectPermissionGroup) => void;
  onEdit: (group: TProjectPermissionGroup) => void;
  onDelete: (group: TProjectPermissionGroup) => void;
};

const GRID = "grid grid-cols-[minmax(200px,1fr)_120px_300px_120px] items-center gap-x-5 px-6";
const OP_BUTTON = "text-14 hover:underline disabled:cursor-not-allowed disabled:text-placeholder disabled:no-underline";
/** 成员不超过这么多人时直接写名字，多了写人数 */
const MAX_NAMES = 2;

const SECTION_META: Record<TProjectGroupSection, { label: string; dot: string; hint?: string }> = {
  project: { label: "本项目", dot: "bg-success-primary" },
  template: { label: "模板", dot: "bg-accent-primary", hint: "由工作区统一维护，本项目仅分配成员" },
  workspace: { label: "工作区权限组", dot: "bg-current text-placeholder", hint: "对可访问本项目的组内成员生效" },
};

/** 模板：绑了人的在前，再按权限数从多到少 */
const sortTemplates = (rows: TProjectPermissionGroup[]) =>
  [...rows].sort(
    (a, b) => Number(b.member_count > 0) - Number(a.member_count > 0) || b.permission_count - a.permission_count
  );

/** 成员格：头像叠放 + 名字（人少时）或人数；没人时「未分配」 */
const MemberCell = observer(function MemberCell(props: {
  userIds: string[];
  count: number;
  names?: string[];
  outsiderCount?: number;
}) {
  const { userIds, count, names, outsiderCount = 0 } = props;
  const { getUserDetails } = useMember();
  if (count <= 0) return <span className="text-tertiary">未分配</span>;
  const shownNames =
    names ?? userIds.map((userId) => getUserDetails(userId)?.display_name).filter((name): name is string => !!name);
  const text = count <= MAX_NAMES && shownNames.length === count ? shownNames.join("、") : `${count} 人`;
  return (
    <span className="flex min-w-0 items-center gap-2.5 whitespace-nowrap">
      {userIds.length > 0 && (
        <AvatarGroup max={3} size="md" showTooltip={false}>
          {userIds.slice(0, 3).map((userId) => {
            const user = getUserDetails(userId);
            return (
              <Avatar key={userId} name={user?.display_name ?? user?.first_name} src={getFileURL(user?.avatar_url ?? "")} />
            );
          })}
        </AvatarGroup>
      )}
      <span className="truncate text-secondary">{text}</span>
      {outsiderCount > 0 && (
        <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-warning-subtle px-1.5 text-12 font-medium text-warning-primary">
          {outsiderCount === count && count === 1 ? "非成员" : `非成员 ${outsiderCount}`}
        </span>
      )}
    </span>
  );
});

function SectionRow({ section, count }: { section: TProjectGroupSection; count: number }) {
  const meta = SECTION_META[section];
  return (
    <div className="flex h-[38px] items-center justify-between gap-3 border-t border-subtle bg-layer-1 px-6">
      <span className="flex items-center gap-2 text-13 font-semibold text-secondary">
        <span className={cn("size-[7px] rounded-full", meta.dot)} />
        {meta.label}
        <span className="font-normal text-tertiary tabular-nums">{count}</span>
      </span>
      {meta.hint && <span className="truncate text-12 text-tertiary">{meta.hint}</span>}
    </div>
  );
}

function Row(props: { name: ReactNode; description?: string; count: ReactNode; members: ReactNode; ops: ReactNode }) {
  const { name, description, count, members, ops } = props;
  return (
    <div className={cn(GRID, "min-h-[60px] border-t border-subtle text-14 hover:bg-layer-1-hover")}>
      <div className="flex min-w-0 flex-col gap-0.5 py-2.5">
        {name}
        {description && (
          <span className="truncate text-13 text-tertiary" title={description}>
            {description}
          </span>
        )}
      </div>
      {count}
      <div className="min-w-0">{members}</div>
      <span className="flex items-center justify-end gap-4">{ops}</span>
    </div>
  );
}

/**
 * 项目设置 › 权限组列表：一张表分三段（本项目 → 模板 → 工作区权限组），行内不再挂来源标签，操作列常显。
 * 工作区权限组段列的是在本项目生效的人（含可访问本项目的非项目成员），橙色标出非成员人数。
 */
export function ProjectPermissionGroupsTable(props: Props) {
  const {
    workspaceSlug,
    groups,
    inheritedGroups,
    filter,
    totalKeyCount,
    canManage,
    isLoading,
    emptyText,
    onOpen,
    onEdit,
    onDelete,
  } = props;

  const projectRows = groups.filter((group) => group.source === "project");
  const templateRows = sortTemplates(groups.filter((group) => group.source === "template"));
  const sections: { key: TProjectGroupSection; count: number; rows: ReactNode[] }[] = [];

  const countCell = (count: number) => {
    const text = formatKeyCount(count, totalKeyCount);
    return (
      <span className={cn("tabular-nums", text === "—" ? "text-placeholder" : "text-primary", text === "全部" && "font-medium")}>
        {text}
      </span>
    );
  };

  const groupRow = (group: TProjectPermissionGroup) => (
    <Row
      key={group.id}
      name={
        <button
          type="button"
          onClick={() => onOpen(group)}
          className="truncate text-left font-medium text-primary hover:text-accent-primary hover:underline"
        >
          {group.name}
        </button>
      }
      description={group.description}
      count={countCell(group.permission_count)}
      members={<MemberCell userIds={group.member_preview_ids ?? []} count={group.member_count} />}
      ops={
        <>
          {group.source === "project" && (
            <button
              type="button"
              className={`${OP_BUTTON} text-accent-primary`}
              disabled={!(canManage && isGroupEditable(group))}
              onClick={() => onEdit(group)}
            >
              编辑
            </button>
          )}
          {/* 本项目组是真删；模板组是「删除引用」（本项目不再引用它），都只要管理权限 */}
          <button
            type="button"
            className={`${OP_BUTTON} text-secondary hover:text-danger-primary`}
            disabled={!canManage}
            onClick={() => onDelete(group)}
          >
            {deleteActionLabel(group)}
          </button>
        </>
      }
    />
  );

  if (filter === "all" || filter === "project") {
    sections.push({ key: "project", count: projectRows.length, rows: projectRows.map(groupRow) });
  }
  if (filter === "all" || filter === "template") {
    sections.push({ key: "template", count: templateRows.length, rows: templateRows.map(groupRow) });
  }
  if (filter === "all" || filter === "workspace") {
    sections.push({
      key: "workspace",
      count: inheritedGroups.length,
      rows: inheritedGroups.map((group) => {
        const detailPath = getPermissionGroupDetailPath(workspaceSlug, group.id);
        return (
          <Row
            key={group.id}
            name={
              <Link to={detailPath} className="truncate font-medium text-primary hover:text-accent-primary hover:underline">
                {group.name}
              </Link>
            }
            count={countCell(group.project_permission_count)}
            members={
              <MemberCell
                userIds={group.members.map((member) => member.id)}
                count={group.members.length}
                names={group.members.map((member) => member.display_name)}
                outsiderCount={group.members.filter((member) => !member.is_member).length}
              />
            }
            ops={
              <Link to={detailPath} className={`${OP_BUTTON} text-accent-primary`}>
                查看
              </Link>
            }
          />
        );
      }),
    });
  }

  const visibleSections = sections.filter((section) => section.rows.length > 0);
  // 只看一类时不用再画分段行
  const showSectionRows = filter === "all";

  return (
    <div className="overflow-x-auto rounded-xl border border-subtle bg-surface-1">
      <div className="min-w-[760px]">
        <div className={cn(GRID, "h-11 text-13 font-medium text-tertiary")}>
          <span>权限组</span>
          <span>项目权限</span>
          <span>成员</span>
          <span className="flex justify-end">操作</span>
        </div>

        {isLoading && groups.length === 0 ? (
          <Loader className="flex flex-col gap-2 border-t border-subtle p-4">
            {[0, 1, 2, 3].map((index) => (
              <Loader.Item key={index} height="44px" />
            ))}
          </Loader>
        ) : visibleSections.length === 0 ? (
          <p className="border-t border-subtle py-14 text-center text-14 text-placeholder">{emptyText}</p>
        ) : (
          visibleSections.map((section) => (
            <div key={section.key}>
              {showSectionRows && <SectionRow section={section.key} count={section.count} />}
              {section.rows}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
