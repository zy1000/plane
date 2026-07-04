/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import { cn } from "@plane/utils";
import { FilterHeader, FilterOption, FiltersDropdown } from "@/components/issues/issue-layouts/filters";

export type TReviewDisplayPropertyKey =
  | "name"
  | "case_count"
  | "state"
  | "pass_rate"
  | "mode"
  | "assignees"
  | "module_name"
  | "period"
  | "created_at";

export type TReviewDisplayProperties = Record<TReviewDisplayPropertyKey, boolean>;

export type TReviewOrderBy = "name" | "-created_at" | "started_at" | "ended_at" | "state" | "mode";

type Props = {
  disabled?: boolean;
  displayProperties: TReviewDisplayProperties;
  ordering?: string;
  onDisplayPropertiesChange: (updatedDisplayProperties: Partial<TReviewDisplayProperties>) => void;
  onOrderByChange: (orderBy: TReviewOrderBy) => void;
};

type TDisplayPropertyOption = {
  key: TReviewDisplayPropertyKey;
  label: string;
};

type TOrderByOption = {
  key: TReviewOrderBy;
  label: string;
};

export const DEFAULT_REVIEW_DISPLAY_PROPERTIES: TReviewDisplayProperties = {
  name: true,
  case_count: true,
  state: true,
  pass_rate: true,
  mode: true,
  assignees: true,
  module_name: true,
  period: true,
  created_at: true,
};

const DISPLAY_PROPERTY_OPTIONS: TDisplayPropertyOption[] = [
  { key: "name", label: "评审名称" },
  { key: "case_count", label: "用例数" },
  { key: "state", label: "状态" },
  { key: "pass_rate", label: "通过率" },
  { key: "mode", label: "评审模式" },
  { key: "assignees", label: "评审人" },
  { key: "module_name", label: "所属模块" },
  { key: "period", label: "评审周期" },
  { key: "created_at", label: "创建时间" },
];

const ORDER_BY_OPTIONS: TOrderByOption[] = [
  { key: "-created_at", label: "最近创建" },
  { key: "name", label: "评审名称" },
  { key: "started_at", label: "开始时间" },
  { key: "ended_at", label: "结束时间" },
  { key: "state", label: "状态" },
  { key: "mode", label: "评审模式" },
];

export const ReviewsDisplayFilters = ({
  disabled = false,
  displayProperties,
  ordering,
  onDisplayPropertiesChange,
  onOrderByChange,
}: Props) => {
  const [displayPropertiesExpanded, setDisplayPropertiesExpanded] = useState(true);
  const [orderByExpanded, setOrderByExpanded] = useState(true);

  const activeOrderBy: TReviewOrderBy = (ordering as TReviewOrderBy) || "-created_at";

  return (
    <FiltersDropdown
      title="显示"
      placement="bottom-end"
      disabled={disabled}
      menuButton={
        <div
          className={cn(
            "inline-flex h-8 items-center justify-center rounded-md border border-strong bg-layer-2 px-2 text-body-sm-medium text-secondary shadow-raised-100",
            disabled && "opacity-50"
          )}
        >
          显示
        </div>
      }
    >
      <div className="vertical-scrollbar relative scrollbar-sm h-full w-full divide-y divide-subtle-1 overflow-hidden overflow-y-auto px-2.5">
        <div className="py-2">
          <FilterHeader
            title="显示属性"
            isPreviewEnabled={displayPropertiesExpanded}
            handleIsPreviewEnabled={() => setDisplayPropertiesExpanded((prev) => !prev)}
          />
          {displayPropertiesExpanded && (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {DISPLAY_PROPERTY_OPTIONS.map((property) => {
                const isActive = displayProperties?.[property.key] ?? true;
                return (
                  <button
                    key={property.key}
                    type="button"
                    className={`rounded-sm border px-2 py-0.5 text-11 transition-all ${
                      isActive
                        ? "border-accent-strong bg-accent-primary text-on-color"
                        : "border-subtle hover:bg-layer-1"
                    }`}
                    onClick={() =>
                      onDisplayPropertiesChange({
                        [property.key]: !isActive,
                      })
                    }
                  >
                    {property.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="py-2">
          <FilterHeader
            title="排序方式"
            isPreviewEnabled={orderByExpanded}
            handleIsPreviewEnabled={() => setOrderByExpanded((prev) => !prev)}
          />
          {orderByExpanded && (
            <div>
              {ORDER_BY_OPTIONS.map((orderBy) => (
                <FilterOption
                  key={orderBy.key}
                  isChecked={activeOrderBy === orderBy.key}
                  title={orderBy.label}
                  multiple={false}
                  onClick={() => onOrderByChange(orderBy.key)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </FiltersDropdown>
  );
};
