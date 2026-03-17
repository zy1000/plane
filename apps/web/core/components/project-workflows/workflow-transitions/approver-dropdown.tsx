/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { useState, useRef } from "react";
import { Check, ChevronDown, Minus, Plus, Users } from "lucide-react";
import { Avatar } from "@plane/ui";
import { cn } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";

type TApproverDropdownProps = {
  projectId: string;
  value: string[];
  onChange: (approverIds: string[], requiredCount: number) => void;
  requiredCount: number;
  disabled?: boolean;
};

export const ApproverDropdown: FC<TApproverDropdownProps> = ({
  projectId,
  value,
  onChange,
  requiredCount,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    getUserDetails,
    project: { getProjectMemberIds, fetchProjectMembers },
  } = useMember();

  const memberIds = getProjectMemberIds(projectId, false) ?? [];

  const handleDropdownOpen = () => {
    if (!getProjectMemberIds(projectId, false)) {
      fetchProjectMembers("", projectId);
    }
    setIsOpen(true);
  };

  const isAllSelected = value.length === 0;

  const filteredMemberIds = search
    ? memberIds.filter((id) => {
        const user = getUserDetails(id);
        return user?.display_name?.toLowerCase().includes(search.toLowerCase()) ||
          user?.email?.toLowerCase().includes(search.toLowerCase());
      })
    : memberIds;

  const handleSelectAll = () => {
    onChange([], 1);
  };

  const handleToggleMember = (memberId: string) => {
    const newIds = value.includes(memberId) ? value.filter((id) => id !== memberId) : [...value, memberId];
    const newRequired = Math.min(requiredCount, Math.max(1, newIds.length));
    onChange(newIds, newRequired);
  };

  const handleRequiredCountChange = (delta: number) => {
    const min = 1;
    const max = value.length;
    onChange(value, Math.min(max, Math.max(min, requiredCount + delta)));
  };

  const handleBlur = (e: React.FocusEvent) => {
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsOpen(false);
      setSearch("");
    }
  };

  const displayLabel = isAllSelected
    ? "All"
    : value.length === 1
      ? getUserDetails(value[0])?.display_name ?? "1 人"
      : `${value.length} 人`;

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <button
        type="button"
        disabled={disabled}
        onClick={isOpen ? () => { setIsOpen(false); setSearch(""); } : handleDropdownOpen}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border border-subtle bg-surface-1 px-3 text-sm transition-colors",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-accent-primary/50 hover:bg-surface-2",
          isOpen && "border-accent-primary/50"
        )}
      >
        <Users className="h-3.5 w-3.5 flex-shrink-0 text-secondary" />
        <span className="flex-1 truncate text-left text-primary">{displayLabel}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 flex-shrink-0 text-secondary transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-20 mt-1 w-full min-w-[220px] rounded-md border border-subtle bg-surface-1 shadow-lg">
          {/* search */}
          <div className="p-1.5">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索成员..."
              className="w-full rounded-sm border border-subtle bg-surface-2 px-2 py-1.5 text-xs text-primary placeholder:text-tertiary outline-none focus:border-accent-primary/50"
            />
          </div>

          <div className="max-h-52 overflow-y-auto p-1">
            {/* All option */}
            {!search && (
              <button
                type="button"
                onClick={handleSelectAll}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-layer-1",
                  isAllSelected && "bg-accent-subtle text-accent-primary"
                )}
              >
                <div className="flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 flex-shrink-0" />
                  <span>All</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-tertiary">默认</span>
                  {isAllSelected && <Check className="h-3.5 w-3.5 text-accent-primary" />}
                </div>
              </button>
            )}

            {/* member list */}
            {filteredMemberIds.map((memberId) => {
              const user = getUserDetails(memberId);
              if (!user) return null;
              const isSelected = value.includes(memberId);
              return (
                <button
                  key={memberId}
                  type="button"
                  onClick={() => handleToggleMember(memberId)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-layer-1",
                    isSelected && !isAllSelected && "bg-accent-subtle/50"
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar
                      name={user.display_name}
                      src={user.avatar_url}
                      size="sm"
                      className="flex-shrink-0"
                    />
                    <span className="truncate text-primary">{user.display_name}</span>
                  </div>
                  {isSelected && !isAllSelected && (
                    <Check className="h-3.5 w-3.5 flex-shrink-0 text-accent-primary" />
                  )}
                </button>
              );
            })}
          </div>

          {/* min required count - only when 2+ specific members selected */}
          {!isAllSelected && value.length >= 2 && (
            <div className="border-t border-subtle p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-secondary">最少需要审批人数</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleRequiredCountChange(-1)}
                    disabled={requiredCount <= 1}
                    className="flex h-5 w-5 items-center justify-center rounded border border-subtle text-secondary transition-colors hover:bg-layer-1 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-5 text-center text-sm font-medium text-primary">{requiredCount}</span>
                  <button
                    type="button"
                    onClick={() => handleRequiredCountChange(1)}
                    disabled={requiredCount >= value.length}
                    className="flex h-5 w-5 items-center justify-center rounded border border-subtle text-secondary transition-colors hover:bg-layer-1 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
