/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment } from "react";
import type { ReactNode } from "react";
import { observer } from "mobx-react";
import { CircleDashed } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@plane/ui";
import { cn } from "@plane/utils";

export type TCycleSidebarGroup = {
  id: string;
  name: string;
  count: number;
  icon?: ReactNode;
};

type Props = {
  groups: TCycleSidebarGroup[];
  selectedGroupId: string;
  groupBy: "state" | "owned_by" | "release" | "none";
  onSelectGroup: (groupId: string) => void;
};

export const CycleGroupSidebar = observer(function CycleGroupSidebar(props: Props) {
  const { groups, selectedGroupId, onSelectGroup, groupBy } = props;
  const { t } = useTranslation();
  const groupByLabel =
    groupBy === "state"
      ? t("state")
      : groupBy === "owned_by"
        ? t("common.assignee")
        : groupBy === "release"
          ? t("release.label", { count: 1 })
          : t("none");

  return (
    <div className="flex h-full w-[240px] flex-shrink-0 flex-col border-r border-subtle bg-surface-1">
      <div className="flex h-9 min-h-9 items-center border-b border-subtle px-2.5">
        <span className="min-w-0 truncate text-xs font-medium tracking-wider text-tertiary">
          {t("common.group_by")} : {groupByLabel}
        </span>
      </div>
      <div className="vertical-scrollbar scrollbar-sm flex-1 overflow-y-auto p-1.5">
        <div className="flex flex-col gap-0.5">
          {groups.map((group) => {
            const isActive = selectedGroupId === group.id;
            const icon = group.icon ?? <CircleDashed className="size-4" strokeWidth={2} />;

            const rowButton = (
              <button
                type="button"
                className={cn(
                  "group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-all duration-150",
                  isActive
                    ? "bg-layer-transparent-active text-primary"
                    : "text-secondary hover:bg-layer-transparent-hover hover:text-primary active:bg-layer-transparent-active"
                )}
                aria-label={`${group.name}，${group.count} 项`}
                aria-current={isActive ? "true" : undefined}
                onClick={() => onSelectGroup(group.id)}
              >
                <div className="grid flex-shrink-0 place-items-center">{icon}</div>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{group.name}</span>
                <span className="min-w-[24px] flex-shrink-0 text-center text-xs font-medium tabular-nums text-primary">
                  {group.count}
                </span>
              </button>
            );

            return (
              <Fragment key={group.id}>
                <Tooltip tooltipContent={group.name} position="right">
                  {rowButton}
                </Tooltip>
              </Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
});
