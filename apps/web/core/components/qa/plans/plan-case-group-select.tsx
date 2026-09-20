/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useOutsideClickDetector } from "@plane/hooks";
import { cn } from "@plane/utils";
import { PLAN_CASE_GROUP_BY_OPTIONS, type TPlanCaseGroupBy } from "./plan-case-display-filters";

type TPlanCaseGroupSelectProps = {
  disabled?: boolean;
  value: TPlanCaseGroupBy;
  onChange: (groupBy: TPlanCaseGroupBy) => void;
};

/** 左栏顶部的分组方式选择器 */
export const PlanCaseGroupSelect = ({ disabled = false, value, onChange }: TPlanCaseGroupSelectProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useOutsideClickDetector(containerRef, () => setIsOpen(false));

  const activeOption = PLAN_CASE_GROUP_BY_OPTIONS.find((option) => option.key === value);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-md bg-layer-1 px-2.5 text-12 text-secondary transition-colors hover:bg-layer-2",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <span className="truncate">
          分组 <span className="font-medium text-primary">{activeOption?.label ?? "模块"}</span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-tertiary" />
      </button>

      {isOpen && (
        <div className="absolute top-9 left-0 z-20 w-full min-w-[150px] rounded-md border border-subtle bg-surface-1 p-1 shadow-raised-300">
          {PLAN_CASE_GROUP_BY_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => {
                setIsOpen(false);
                if (option.key !== value) onChange(option.key);
              }}
              className={cn(
                "flex h-8 w-full items-center justify-between gap-2 rounded px-2 text-13 transition-colors hover:bg-layer-1",
                option.key === value ? "text-accent-primary" : "text-primary"
              )}
            >
              <span className="truncate">{option.label}</span>
              {option.key === value && <Check className="size-3.5 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
