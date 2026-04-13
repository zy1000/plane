/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import * as React from "react";
import { useState } from "react";
import { Tooltip } from "@plane/propel/tooltip";
import type { ICustomSearchSelectOption } from "@plane/types";
import { CustomSearchSelect } from "../dropdowns";
import { cn } from "../utils";
import { Breadcrumbs } from "./breadcrumbs";

type TBreadcrumbNavigationSearchDropdownProps = {
  icon?: React.ReactNode;
  title?: string;
  selectedItem: string;
  navigationItems: ICustomSearchSelectOption[];
  onChange?: (value: string) => void;
  navigationDisabled?: boolean;
  isLast?: boolean;
  handleOnClick?: () => void;
  disableRootHover?: boolean;
  shouldTruncate?: boolean;
};

export function BreadcrumbNavigationSearchDropdown(props: TBreadcrumbNavigationSearchDropdownProps) {
  const {
    icon,
    title,
    selectedItem,
    navigationItems,
    onChange,
    navigationDisabled = false,
    isLast = false,
    handleOnClick,
    shouldTruncate = false,
  } = props;
  // state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  return (
    <CustomSearchSelect
      onOpen={() => {
        setIsDropdownOpen(true);
      }}
      onClose={() => {
        setIsDropdownOpen(false);
      }}
      options={navigationItems}
      value={selectedItem}
      onChange={(value: string) => {
        if (value !== selectedItem) {
          onChange?.(value);
        }
      }}
      customButton={
        <>
          <Tooltip tooltipContent={title} position="bottom">
            <div
              onClick={(e) => {
                if (!isLast) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleOnClick?.();
                }
              }}
              className={cn(
                "flex h-full min-h-0 cursor-pointer items-center gap-2 rounded-sm rounded-r-none px-1.5 py-1 text-13 font-medium",
                {
                  "text-primary": isLast,
                  "text-tertiary hover:bg-layer-1 hover:text-primary": !isLast,
                }
              )}
            >
              {shouldTruncate && (
                <div
                  className={cn("flex items-center @4xl:hidden", {
                    "text-primary": isLast,
                    "text-tertiary": !isLast,
                  })}
                >
                  ...
                </div>
              )}
              <div
                className={cn("flex items-center gap-2", {
                  "hidden @4xl:flex": shouldTruncate,
                })}
              >
                {icon && (
                  <div className="flex size-4 flex-shrink-0 items-center justify-center overflow-hidden !text-16">
                    {icon}
                  </div>
                )}
                <Breadcrumbs.Label>{title}</Breadcrumbs.Label>
              </div>
            </div>
          </Tooltip>
          <Breadcrumbs.Separator
            className={cn("rounded-r-sm", {
              "bg-layer-1": isDropdownOpen && !isLast,
              "hover:bg-layer-1": !isLast,
            })}
            containerClassName="p-0"
            iconClassName={cn("group-hover:rotate-90 hover:text-primary", {
              "text-primary": isDropdownOpen,
              "rotate-90": isDropdownOpen || isLast,
            })}
            showDivider={!isLast}
          />
        </>
      }
      disabled={navigationDisabled}
      className="h-full rounded-sm"
      customButtonClassName={cn(
        "group flex h-full cursor-pointer items-center gap-0.5 rounded-sm text-13 font-medium outline-none hover:bg-surface-2",
        {
          "bg-surface-2": isDropdownOpen,
        }
      )}
    />
  );
}
