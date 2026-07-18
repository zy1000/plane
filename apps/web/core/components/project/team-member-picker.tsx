/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Search, UsersRound, X } from "lucide-react";
import type { IProjectGroup, IProjectGroupMember } from "@plane/types";
import { Button } from "@plane/propel/button";
import { Avatar, Checkbox } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";

type TMemberState = {
  data: IProjectGroupMember[];
  isLoading: boolean;
  loaded: boolean;
  error: string | null;
};

type Props = {
  groups: IProjectGroup[];
  isGroupsLoading: boolean;
  groupsError: string | null;
  excludedMemberIds: Set<string>;
  getGroupMembers: (groupId: string) => TMemberState;
  loadGroupMembers: (groupId: string, force?: boolean) => Promise<void>;
  onBack: () => void;
  onConfirm: (memberIds: string[]) => void;
};

export function TeamMemberPicker({
  groups,
  isGroupsLoading,
  groupsError,
  excludedMemberIds,
  getGroupMembers,
  loadGroupMembers,
  onBack,
  onConfirm,
}: Props) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!selectedGroupId && groups.length > 0) setSelectedGroupId(groups[0].id);
  }, [groups, selectedGroupId]);

  useEffect(() => {
    if (selectedGroupId) void loadGroupMembers(selectedGroupId);
  }, [loadGroupMembers, selectedGroupId]);

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null;
  const memberState = selectedGroupId ? getGroupMembers(selectedGroupId) : null;
  const visibleMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const members = memberState?.data ?? [];
    if (!normalizedQuery) return members;
    return members.filter(
      (item) =>
        item.member.display_name.toLocaleLowerCase().includes(normalizedQuery) ||
        (item.member.email ?? "").toLocaleLowerCase().includes(normalizedQuery)
    );
  }, [memberState?.data, query]);
  const selectableMembers = visibleMembers.filter(
    (item) => !item.is_project_member && !excludedMemberIds.has(item.member.id)
  );
  const allVisibleSelected =
    selectableMembers.length > 0 && selectableMembers.every((item) => selectedMemberIds.has(item.member.id));

  const toggleMember = (memberId: string) => {
    setSelectedMemberIds((current) => {
      const next = new Set(current);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedMemberIds((current) => {
      const next = new Set(current);
      selectableMembers.forEach((item) => {
        if (allVisibleSelected) next.delete(item.member.id);
        else next.add(item.member.id);
      });
      return next;
    });
  };

  return (
    <div className="flex min-h-[34rem] flex-col">
      <div className="flex items-start gap-3 border-b border-subtle px-5 py-4">
        <button
          type="button"
          onClick={onBack}
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md text-secondary hover:bg-layer-1-hover hover:text-primary"
          aria-label="返回邀请表单"
        >
          <ArrowLeft className="size-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-16 font-medium text-primary">从团队导入成员</h3>
        </div>
        <span className="mt-1 rounded-full bg-accent-subtle px-2.5 py-1 text-11 font-medium text-accent-primary">
          已选 {selectedMemberIds.size}
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[14rem_minmax(0,1fr)]">
        <aside className="vertical-scrollbar scrollbar-sm overflow-y-auto border-r border-subtle bg-surface-2 p-2">
          <p className="px-2 pt-1 pb-2 text-11 font-medium tracking-wide text-tertiary uppercase">工作区团队</p>
          {isGroupsLoading && groups.length === 0 ? (
            <div className="space-y-1.5">
              {[1, 2, 3, 4].map((item) => (
                <div key={item} className="h-12 animate-pulse rounded-md bg-layer-transparent-hover" />
              ))}
            </div>
          ) : groupsError && groups.length === 0 ? (
            <p className="px-2 py-4 text-13 leading-5 text-danger-primary">{groupsError}</p>
          ) : groups.length === 0 ? (
            <div className="px-2 py-8 text-center">
              <UsersRound className="mx-auto size-5 text-placeholder" />
              <p className="mt-2 text-13 text-secondary">工作区暂无团队</p>
            </div>
          ) : (
            <ul className="space-y-1">
              {groups.map((group) => (
                <li key={group.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGroupId(group.id);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left",
                      selectedGroupId === group.id
                        ? "bg-accent-subtle text-primary"
                        : "text-secondary hover:bg-layer-1-hover hover:text-primary"
                    )}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-subtle bg-surface-1">
                      <UsersRound className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-13 font-medium">{group.name}</span>
                      <span className="block truncate text-11 text-tertiary">
                        {group.member_count} 位成员
                        {group.grants.length > 0 ? ` · ${group.grants.length} 个项目角色` : ""}
                      </span>
                    </span>
                    {group.id === selectedGroupId && <Check className="size-3.5 shrink-0 text-accent-primary" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="flex min-w-0 flex-col">
          <div className="border-b border-subtle px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-13 font-medium text-primary">{selectedGroup?.name ?? "选择团队"}</p>
                {selectedGroup && selectedGroup.grants.length > 0 && (
                  <p className="mt-0.5 truncate text-11 text-tertiary">
                    项目角色：{selectedGroup.grants.map((grant) => grant.role_detail.name).join("、")}
                  </p>
                )}
              </div>
              <div className="focus-within:border-accent-primary/40 flex h-8 w-56 items-center gap-2 rounded-md border border-subtle bg-surface-2 px-2.5">
                <Search className="size-3.5 shrink-0 text-placeholder" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索团队成员"
                  className="min-w-0 flex-1 border-0 bg-transparent text-13 text-primary outline-none placeholder:text-placeholder"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} className="text-placeholder hover:text-primary">
                    <X className="size-3" />
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="vertical-scrollbar scrollbar-sm min-h-0 flex-1 overflow-y-auto px-4">
            {memberState?.isLoading && !memberState.loaded ? (
              <div className="divide-y divide-subtle">
                {[1, 2, 3, 4, 5].map((item) => (
                  <div key={item} className="h-14 animate-pulse bg-layer-transparent-hover" />
                ))}
              </div>
            ) : memberState?.error ? (
              <div className="flex min-h-72 flex-col items-center justify-center text-center">
                <p className="text-13 font-medium text-primary">团队成员加载失败</p>
                <p className="mt-1 text-13 text-secondary">{memberState.error}</p>
                {selectedGroupId && (
                  <Button
                    variant="secondary"
                    className="mt-4"
                    onClick={() => void loadGroupMembers(selectedGroupId, true)}
                  >
                    重新加载
                  </Button>
                )}
              </div>
            ) : !selectedGroup ? (
              <div className="flex min-h-72 items-center justify-center text-13 text-secondary">请先选择左侧团队</div>
            ) : visibleMembers.length === 0 ? (
              <div className="flex min-h-72 flex-col items-center justify-center text-center">
                <UsersRound className="size-6 text-placeholder" />
                <p className="mt-2 text-13 text-secondary">{query ? "没有匹配的团队成员" : "该团队暂无成员"}</p>
              </div>
            ) : (
              <>
                <label className="sticky top-0 z-[1] flex cursor-pointer items-center gap-3 border-b border-subtle bg-surface-1 py-2.5">
                  <Checkbox
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    disabled={selectableMembers.length === 0}
                  />
                  <span className="text-13 font-medium text-secondary">全选当前列表</span>
                  <span className="ml-auto text-11 text-tertiary">可选择 {selectableMembers.length} 人</span>
                </label>
                <ul className="divide-y divide-subtle">
                  {visibleMembers.map((item) => {
                    const disabled = item.is_project_member || excludedMemberIds.has(item.member.id);
                    const selected = selectedMemberIds.has(item.member.id);
                    return (
                      <li key={item.id}>
                        <label
                          className={cn(
                            "flex items-center gap-3 py-3",
                            disabled ? "cursor-not-allowed opacity-55" : "cursor-pointer"
                          )}
                        >
                          <Checkbox
                            checked={selected}
                            onChange={() => toggleMember(item.member.id)}
                            disabled={disabled}
                          />
                          <Avatar
                            name={item.member.display_name}
                            src={getFileURL(item.member.avatar_url ?? "")}
                            size={28}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-13 font-medium text-primary">
                              {item.member.display_name}
                            </span>
                            <span className="block truncate text-11 text-tertiary">{item.member.email}</span>
                          </span>
                          {disabled && (
                            <span className="shrink-0 rounded-full bg-layer-1 px-2 py-0.5 text-11 text-tertiary">
                              {item.is_project_member ? "已在项目内" : "已在邀请列表"}
                            </span>
                          )}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-subtle px-5 py-4">
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onBack}>
            返回
          </Button>
          <Button
            variant="primary"
            onClick={() => onConfirm([...selectedMemberIds])}
            disabled={selectedMemberIds.size === 0}
          >
            添加 {selectedMemberIds.size > 0 ? selectedMemberIds.size : ""} 位成员
          </Button>
        </div>
      </div>
    </div>
  );
}
