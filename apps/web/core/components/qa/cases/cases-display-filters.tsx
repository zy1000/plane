/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import { cn } from "@plane/utils";
import { FilterHeader, FilterOption, FiltersDropdown } from "@/components/issues/issue-layouts/filters";

export type TCaseDisplayPropertyKey =
  | "code"
  | "name"
  | "review"
  | "last_execution_result"
  | "type"
  | "priority"
  | "module"
  | "assignee"
  | "labels"
  | "updated_at";

export type TCaseDisplayProperties = Record<TCaseDisplayPropertyKey, boolean>;

export type TCaseOrderBy = "code" | "-created_at" | "-updated_at" | "-priority";

type Props = {
  disabled?: boolean;
  displayProperties: TCaseDisplayProperties;
  ordering?: string;
  onDisplayPropertiesChange: (updatedDisplayProperties: Partial<TCaseDisplayProperties>) => void;
  onOrderByChange: (orderBy: TCaseOrderBy) => void;
};

type TDisplayPropertyOption = {
  key: TCaseDisplayPropertyKey;
  label: string;
};

type TOrderByOption = {
  key: TCaseOrderBy;
  label: string;
};

export const DEFAULT_CASE_DISPLAY_PROPERTIES: TCaseDisplayProperties = {
  code: true,
  name: true,
  review: true,
  last_execution_result: true,
  type: true,
  priority: true,
  module: true,
  assignee: true,
  labels: false,
  updated_at: true,
};

const DISPLAY_PROPERTY_OPTIONS: TDisplayPropertyOption[] = [
  { key: "code", label: "用例编号" },
  { key: "name", label: "名称" },
  { key: "review", label: "评审结果" },
  { key: "last_execution_result", label: "最近执行结果" },
  { key: "type", label: "类型" },
  { key: "priority", label: "优先级" },
  { key: "module", label: "模块" },
  { key: "assignee", label: "维护人" },
  { key: "labels", label: "标签" },
  { key: "updated_at", label: "更新时间" },
];

const ORDER_BY_OPTIONS: TOrderByOption[] = [
  { key: "code", label: "用例编号" },
  { key: "-created_at", label: "最近创建" },
  { key: "-updated_at", label: "最近更新" },
  { key: "-priority", label: "优先级" },
];

export const CasesDisplayFilters = ({
  disabled = false,
  displayProperties,
  ordering,
  onDisplayPropertiesChange,
  onOrderByChange,
}: Props) => {
  const [displayPropertiesExpanded, setDisplayPropertiesExpanded] = useState(true);
  const [orderByExpanded, setOrderByExpanded] = useState(true);

  const activeOrderBy: TCaseOrderBy = (ordering as TCaseOrderBy) || "-created_at";

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
