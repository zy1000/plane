import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { CustomMenu } from "@plane/ui";
import { cn } from "@plane/utils";

export type TDetailTab = "matrix" | "items" | "activity" | "comments";

/**
 * Tab 条：左边四个 Tab（数量直接写在名字后面），右边是当前 Tab 自己的工具
 * （矩阵的筛选与加轴，明细的产品与结果筛选，变更历史的类型筛选）。
 */
export const DetailTabBar = ({
  tabs,
  active,
  onChange,
  tools,
}: {
  tabs: { key: TDetailTab; label: string; count?: number }[];
  active: TDetailTab;
  onChange: (tab: TDetailTab) => void;
  tools?: ReactNode;
}) => (
  <div className="flex shrink-0 flex-wrap items-center gap-x-1 border-b border-subtle pr-5 pl-3">
    {tabs.map((entry) => {
      const isActive = entry.key === active;
      return (
        <button
          key={entry.key}
          type="button"
          className={cn(
            "-mb-px flex h-11 items-center gap-1.5 border-b-2 px-3 text-13 transition-colors",
            isActive
              ? "border-accent-strong font-semibold text-primary"
              : "border-transparent font-medium text-secondary hover:text-primary"
          )}
          onClick={() => onChange(entry.key)}
        >
          {entry.label}
          {typeof entry.count === "number" && (
            <span className="font-normal text-placeholder tabular-nums">{entry.count}</span>
          )}
        </button>
      );
    })}
    {tools && <div className="ml-auto flex items-center gap-2 py-1.5">{tools}</div>}
  </div>
);

/** Tab 条右侧的下拉筛选：「显示 全部 ▾」。选项后面可以带数量 */
export const TabBarSelect = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { key: T; label: string; count?: number }[];
  onChange: (value: T) => void;
}) => {
  const current = options.find((option) => option.key === value) ?? options[0];
  return (
    <CustomMenu
      customButton={
        <span className="flex h-7.5 items-center gap-1.5 rounded-md border border-subtle bg-surface-1 px-2.5 text-13 whitespace-nowrap text-primary hover:bg-layer-1">
          <span className="text-tertiary">{label}</span>
          <span className="max-w-40 truncate">{current?.label}</span>
          <ChevronDown className="size-3.5 shrink-0 text-tertiary" />
        </span>
      }
      placement="bottom-end"
      maxHeight="lg"
      closeOnSelect
    >
      {options.map((option) => (
        <CustomMenu.MenuItem
          key={option.key}
          onClick={() => onChange(option.key)}
          className="flex min-w-32 items-center gap-2"
        >
          <span className="min-w-0 flex-1 truncate">{option.label}</span>
          {typeof option.count === "number" && (
            <span className="text-12 text-placeholder tabular-nums">{option.count}</span>
          )}
          <Check
            className={cn("size-3.5 shrink-0 text-accent-primary", option.key !== value && "invisible")}
            strokeWidth={2.4}
          />
        </CustomMenu.MenuItem>
      ))}
    </CustomMenu>
  );
};
