/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@plane/propel/button";
import { ChevronDownIcon } from "@plane/propel/icons";
// plane ui
import { CustomMenu } from "@plane/ui";
// components
import { FilterHeader, FilterOption } from "@/components/issues/issue-layouts/filters";

export interface IMemberFilterOption {
  value: string;
  label: string;
}

type Props = {
  appliedFilters: string[] | null;
  handleUpdate: (value: string) => void;
  memberType: "project" | "workspace";
  /** 筛选项；不给时工作区只有「已停用」（整数角色已退役，不再按管理员 / 成员 / 访客筛） */
  options?: IMemberFilterOption[];
  /** 分组标题，默认「状态」 */
  title?: string;
};

const DEFAULT_OPTIONS: Record<Props["memberType"], IMemberFilterOption[]> = {
  project: [],
  workspace: [{ value: "suspended", label: "已停用" }],
};

const MemberFilterGroup = observer(function MemberFilterGroup({
  appliedFilters,
  handleUpdate,
  options,
  title,
}: {
  appliedFilters: string[] | null;
  handleUpdate: (value: string) => void;
  options: IMemberFilterOption[];
  title: string;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const appliedFiltersCount = appliedFilters?.length ?? 0;

  return (
    <div className="space-y-2">
      <FilterHeader
        title={`${title}${appliedFiltersCount > 0 ? ` (${appliedFiltersCount})` : ""}`}
        isPreviewEnabled={isExpanded}
        handleIsPreviewEnabled={() => setIsExpanded(!isExpanded)}
      />
      {isExpanded && (
        <div className="space-y-1">
          {options.map((option) => (
            <FilterOption
              key={`member-filter-${option.value}`}
              isChecked={appliedFilters?.includes(option.value) ?? false}
              title={option.label}
              onClick={() => handleUpdate(option.value)}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export const MemberListFilters = observer(function MemberListFilters(props: Props) {
  const { appliedFilters, handleUpdate, memberType, options, title = "状态" } = props;
  return (
    <div className="space-y-4">
      <MemberFilterGroup
        appliedFilters={appliedFilters}
        handleUpdate={handleUpdate}
        options={options ?? DEFAULT_OPTIONS[memberType]}
        title={title}
      />
    </div>
  );
});

// Dropdown component for member list filters
export const MemberListFiltersDropdown = observer(function MemberListFiltersDropdown(props: Props) {
  const appliedFiltersCount = props.appliedFilters?.length ?? 0;

  return (
    <CustomMenu
      customButton={
        <div className="relative">
          <Button variant="secondary" size="lg" className="flex items-center gap-2">
            <span>筛选</span>
            <ChevronDownIcon className="h-3 w-3" />
          </Button>
          {appliedFiltersCount > 0 && (
            <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-accent-primary" />
          )}
        </div>
      }
      placement="bottom-start"
    >
      <MemberListFilters {...props} />
    </CustomMenu>
  );
});
