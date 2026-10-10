"use client";

import { Check, ChevronDown, Layers } from "lucide-react";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";
import { PLAN_CASE_GROUP_BY_OPTIONS, type TPlanCaseGroupBy } from "./plan-case-display-filters";

type Props = {
  value: TPlanCaseGroupBy;
  disabled?: boolean;
  onChange: (groupBy: TPlanCaseGroupBy) => void;
};

/** 计划用例页左树树头的分组切换：「按模块 ⌄」下拉，选项与执行页 URL 解析共用一份 */
export const PlanCaseGroupBySwitcher = ({ value, disabled = false, onChange }: Props) => {
  const current = PLAN_CASE_GROUP_BY_OPTIONS.find((option) => option.key === value);
  return (
    <CustomMenu
      closeOnSelect
      placement="bottom-start"
      disabled={disabled}
      ariaLabel="分组方式"
      customButtonClassName="max-w-full"
      customButton={
        <span
          className={cn(
            "flex h-7 max-w-full items-center gap-1.5 rounded-md px-1.5 text-13 font-medium text-primary hover:bg-layer-transparent-hover aria-expanded:bg-layer-transparent-active",
            disabled && "opacity-50"
          )}
        >
          <Layers className="size-3.5 shrink-0 text-tertiary" strokeWidth={2} />
          <span className="truncate">按{current?.label ?? "模块"}</span>
          <ChevronDown className="size-3.5 shrink-0 text-tertiary" strokeWidth={2} />
        </span>
      }
      optionsClassName="min-w-[150px]"
    >
      {PLAN_CASE_GROUP_BY_OPTIONS.map((option) => (
        <CustomMenu.MenuItem
          key={option.key}
          onClick={() => onChange(option.key)}
          className="flex items-center justify-between gap-3 px-2 py-1.5 text-13 text-primary"
        >
          <span>{option.label}</span>
          {option.key === value && <Check className="size-3.5 shrink-0 text-accent-primary" strokeWidth={2} />}
        </CustomMenu.MenuItem>
      ))}
    </CustomMenu>
  );
};
