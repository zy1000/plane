/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useState } from "react";
import { cn } from "@plane/utils";
import { FilterHeader, FilterOption, FiltersDropdown } from "@/components/issues/issue-layouts/filters";

export type TPlanCaseDisplayPropertyKey =
  | "code"
  | "name"
  | "repository"
  | "module"
  | "assignee"
  | "type"
  | "priority"
  | "result"
  | "updated_at";

export type TPlanCaseDisplayProperties = Record<TPlanCaseDisplayPropertyKey, boolean>;

export type TPlanCaseOrderBy = "case__code" | "-case__code" | "-case__updated_at" | "case__updated_at";

type Props = {
  disabled?: boolean;
  displayProperties: TPlanCaseDisplayProperties;
  ordering?: string;
  onDisplayPropertiesChange: (updatedDisplayProperties: Partial<TPlanCaseDisplayProperties>) => void;
  onOrderByChange: (orderBy: TPlanCaseOrderBy) => void;
};

type TDisplayPropertyOption = {
  key: TPlanCaseDisplayPropertyKey;
  label: string;
};

type TOrderByOption = {
  key: TPlanCaseOrderBy;
  label: string;
};

export const DEFAULT_PLAN_CASE_DISPLAY_PROPERTIES: TPlanCaseDisplayProperties = {
  code: true,
  name: true,
  repository: true,
  module: true,
  assignee: true,
  type: true,
  priority: true,
  result: true,
  updated_at: true,
};

const DISPLAY_PROPERTY_OPTIONS: TDisplayPropertyOption[] = [
  { key: "code", label: "编号" },
  { key: "name", label: "名称" },
  { key: "repository", label: "用例库" },
  { key: "module", label: "模块" },
  { key: "assignee", label: "执行人" },
  { key: "type", label: "类型" },
  { key: "priority", label: "优先级" },
  { key: "result", label: "执行结果" },
  { key: "updated_at", label: "更新时间" },
];

const ORDER_BY_OPTIONS: TOrderByOption[] = [
  { key: "case__code", label: "用例编号升序" },
  { key: "-case__code", label: "用例编号降序" },
  { key: "-case__updated_at", label: "最近更新" },
  { key: "case__updated_at", label: "最早更新" },
];

export const PlanCaseDisplayFilters = ({
  disabled = false,
  displayProperties,
  ordering,
  onDisplayPropertiesChange,
  onOrderByChange,
}: Props) => {
  const [displayPropertiesExpanded, setDisplayPropertiesExpanded] = useState(true);
  const [orderByExpanded, setOrderByExpanded] = useState(true);

  const activeOrderBy: TPlanCaseOrderBy = (ordering as TPlanCaseOrderBy) || "-case__updated_at";

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
