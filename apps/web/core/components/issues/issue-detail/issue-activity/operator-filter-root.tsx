/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { ListFilter } from "lucide-react";
import { CheckIcon } from "@plane/propel/icons";
import { getIconButtonStyling } from "@plane/propel/icon-button";
import { Avatar, PopoverMenu } from "@plane/ui";
import { cn, getFileURL } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";

type TActivityOperatorFilterRoot = {
  operatorIds: string[];
  selectedOperatorIds: string[];
  onChange: (operatorIds: string[]) => void;
};

type TOperatorFilterOption =
  | { key: "all"; type: "all"; label: string }
  | { key: string; type: "user"; userId: string; label: string; avatarUrl?: string }
  | { key: "empty"; type: "empty"; label: string };

export const ActivityOperatorFilterRoot = observer(function ActivityOperatorFilterRoot(
  props: TActivityOperatorFilterRoot
) {
  const { operatorIds, selectedOperatorIds, onChange } = props;
  const { getUserDetails } = useMember();

  const hasActiveFilter = selectedOperatorIds.length > 0;
  const selectedSet = new Set(selectedOperatorIds);
  const userOptions: TOperatorFilterOption[] = operatorIds.map((userId) => {
    const user = getUserDetails(userId);
    return {
      key: userId,
      type: "user",
      userId,
      label: user?.display_name || user?.email || userId,
      avatarUrl: user?.avatar_url,
    };
  });
  const options: TOperatorFilterOption[] =
    userOptions.length > 0
      ? [{ key: "all", type: "all", label: "全部操作人员" }, ...userOptions]
      : [{ key: "empty", type: "empty", label: "暂无可筛选操作人员" }];

  const toggleOperator = (userId: string) => {
    if (selectedSet.has(userId)) {
      onChange(selectedOperatorIds.filter((id) => id !== userId));
      return;
    }
    onChange([...selectedOperatorIds, userId]);
  };

  return (
    <PopoverMenu
      buttonClassName="outline-none"
      button={
        <div className="relative" title="按操作人员筛选">
          <span className={getIconButtonStyling("tertiary", "base")}>
            <ListFilter className="size-4" />
          </span>
          {hasActiveFilter && <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent-primary" />}
        </div>
      }
      panelClassName="w-56 p-2 rounded-md border border-subtle bg-surface-1"
      data={options}
      keyExtractor={(item) => item.key}
      render={(item) => {
        if (item.type === "empty") {
          return <div className="px-2 py-1.5 text-body-xs-regular text-placeholder">{item.label}</div>;
        }

        const isSelected = item.type === "all" ? !hasActiveFilter : selectedSet.has(item.userId);
        const handleClick = () => {
          if (item.type === "all") onChange([]);
          else toggleOperator(item.userId);
        };

        return (
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 rounded-xs p-1 px-2 text-13 transition-all hover:bg-layer-1"
            onClick={handleClick}
          >
            <div
              className={cn(
                "flex h-3 w-3 flex-shrink-0 items-center justify-center rounded-xs bg-surface-2 transition-all",
                isSelected ? "bg-accent-primary text-on-color" : "bg-surface-2"
              )}
            >
              {isSelected && <CheckIcon className="h-2.5 w-2.5" />}
            </div>
            {item.type === "user" && (
              <Avatar src={getFileURL(item.avatarUrl ?? "")} name={item.label} size="sm" showTooltip={false} />
            )}
            <span className={cn("min-w-0 flex-1 truncate text-left", isSelected ? "text-primary" : "text-secondary")}>
              {item.label}
            </span>
          </button>
        );
      }}
    />
  );
});
