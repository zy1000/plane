/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { ChevronLeft, ChevronRight, CircleDashed } from "lucide-react";
import { ISSUE_GROUP_BY_OPTIONS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { IGroupByColumn, TGroupedIssues, TIssueGroupByOptions } from "@plane/types";
import { Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";
import { useIssuesStore } from "@/hooks/use-issue-layout-store";

/** 与「分组方式」筛选中的选项一致，用于侧栏标题「分组方式: {维度}」 */
const getGroupByDimensionTranslationKey = (groupBy: TIssueGroupByOptions | null): string | undefined => {
  if (groupBy == null) return undefined;
  const fromList = ISSUE_GROUP_BY_OPTIONS.find((o) => o.key === groupBy)?.titleTranslationKey;
  if (fromList) return fromList;
  if (groupBy === "target_date") return "common.order_by.due_date";
  return undefined;
};

interface GroupSidebarProps {
  groups: IGroupByColumn[];
  groupedIssueIds: TGroupedIssues;
  groupBy: TIssueGroupByOptions | null;
  selectedGroupId: string;
  onSelectGroup: (groupId: string) => void;
  showEmptyGroup?: boolean;
}

export const GroupSidebar = observer(function GroupSidebar(props: GroupSidebarProps) {
  const { groups, groupBy, selectedGroupId, onSelectGroup, showEmptyGroup } = props;
  const {
    issues: { getGroupIssueCount },
  } = useIssuesStore();
  const { t } = useTranslation();

  const [isCollapsed, setIsCollapsed] = useState(false);

  const sidebarHeading = useMemo(() => {
    const dimensionKey = getGroupByDimensionTranslationKey(groupBy);
    const groupByLabel = t("common.group_by");
    if (!dimensionKey) return groupByLabel;
    return `${groupByLabel}: ${t(dimensionKey)}`;
  }, [groupBy, t]);

  return (
    <div
      className={cn(
        "flex h-full flex-shrink-0 flex-col border-r border-subtle bg-surface-1 transition-[width] duration-300 ease-in-out",
        isCollapsed ? "w-11" : "w-[240px]"
      )}
    >
      <div className="flex h-9 min-h-9 flex-shrink-0 items-center border-b border-subtle px-1.5">
        {!isCollapsed && (
          <span className="min-w-0 flex-1 truncate px-1 text-xs font-medium tracking-wider text-tertiary">
            {sidebarHeading}
          </span>
        )}
        <button
          type="button"
          className={cn(
            "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-tertiary outline-none transition-colors duration-150 hover:bg-layer-transparent-hover hover:text-primary",
            isCollapsed && "mx-auto"
          )}
          aria-expanded={!isCollapsed}
          aria-label={isCollapsed ? "展开分组侧栏" : "收起分组侧栏"}
          onClick={() => setIsCollapsed((v) => !v)}
        >
          {isCollapsed ? (
            <ChevronRight className="size-4" strokeWidth={2} />
          ) : (
            <ChevronLeft className="size-4" strokeWidth={2} />
          )}
        </button>
      </div>
      <div
        className={cn(
          "vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto",
          isCollapsed ? "px-1 py-1" : "p-1.5"
        )}
      >
        <div className="flex flex-col gap-0.5">
          {groups.map((group) => {
            const count = getGroupIssueCount(group.id, undefined, false) ?? 0;
            if (!showEmptyGroup && count <= 0) return null;
            const isActive = selectedGroupId === group.id;
            const icon = group.icon ?? <CircleDashed className="size-4" strokeWidth={2} />;

            const rowButton = (
              <button
                type="button"
                className={cn(
                  "group flex w-full cursor-pointer items-center outline-none transition-all duration-150",
                  isCollapsed
                    ? cn(
                        "justify-center rounded-md p-1.5",
                        isActive
                          ? "bg-layer-transparent-active text-primary"
                          : "text-secondary hover:bg-layer-transparent-hover hover:text-primary active:bg-layer-transparent-active"
                      )
                    : cn(
                        "gap-2 rounded-md px-2.5 py-1.5 text-left",
                        isActive
                          ? "bg-layer-transparent-active text-primary"
                          : "text-secondary hover:bg-layer-transparent-hover hover:text-primary active:bg-layer-transparent-active"
                      )
                )}
                aria-label={`${group.name}，${count} 项`}
                aria-current={isActive ? "true" : undefined}
                onClick={() => onSelectGroup(group.id)}
              >
                <div className="grid flex-shrink-0 place-items-center">{icon}</div>
                {!isCollapsed && (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{group.name}</span>
                    <span className="flex-shrink-0 min-w-[24px] text-center text-xs font-medium tabular-nums text-primary">
                      {count}
                    </span>
                  </>
                )}
              </button>
            );

            if (isCollapsed) {
              return (
                <Tooltip
                  key={group.id}
                  tooltipContent={
                    <span className="tabular-nums">
                      {group.name}
                      <span className="text-tertiary"> · </span>
                      {count}
                    </span>
                  }
                  position="right"
                >
                  {rowButton}
                </Tooltip>
              );
            }

            return <Fragment key={group.id}>{rowButton}</Fragment>;
          })}
        </div>
      </div>
    </div>
  );
});
