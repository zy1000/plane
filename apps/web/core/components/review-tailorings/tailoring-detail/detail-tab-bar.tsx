import type { ReactNode } from "react";
import { cn } from "@plane/utils";

export type TDetailTab = "matrix" | "items" | "activity" | "comments";

/**
 * Tab 条：左边四个 Tab（带计数徽章），右边是当前 Tab 自己的工具（矩阵的筛选 / 折叠 / 加轴，明细的产品筛选）。
 * 加评审 / 加产品从页头挪到这里 —— 它们是对矩阵的操作，跟着矩阵走。
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
  <div className="flex shrink-0 flex-wrap items-center gap-x-1 border-b border-subtle px-6">
    {tabs.map((entry) => {
      const isActive = entry.key === active;
      return (
        <button
          key={entry.key}
          type="button"
          className={cn(
            "-mb-px flex h-10 items-center gap-1.5 border-b-2 px-2.5 text-13 transition-colors",
            isActive
              ? "border-accent-strong font-medium text-primary"
              : "border-transparent text-tertiary hover:text-secondary"
          )}
          onClick={() => onChange(entry.key)}
        >
          {entry.label}
          {typeof entry.count === "number" && (
            <span
              className={cn(
                "rounded-full px-1.5 text-11 tabular-nums",
                isActive ? "bg-accent-subtle text-accent-primary" : "bg-layer-3 text-tertiary"
              )}
            >
              {entry.count}
            </span>
          )}
        </button>
      );
    })}
    {tools && <div className="ml-auto flex items-center gap-1.5 py-1.5">{tools}</div>}
  </div>
);

/** Tab 条右侧的分段筛选：全部 / 裁剪 N / 待补原因 N */
export const TabBarSegments = <T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { key: T; label: string; count?: number; tone?: "warning" }[];
  onChange: (value: T) => void;
}) => (
  <div role="radiogroup" className="flex h-7.5 items-center gap-0.5 rounded-lg border border-subtle bg-layer-1 p-0.5">
    {options.map((option) => {
      const isActive = option.key === value;
      return (
        <button
          key={option.key}
          type="button"
          role="radio"
          aria-checked={isActive}
          className={cn(
            "flex h-full items-center gap-1.5 rounded-md px-2.5 text-12 whitespace-nowrap transition-colors",
            isActive ? "bg-surface-1 font-medium text-primary shadow-raised-100" : "text-tertiary hover:text-secondary"
          )}
          onClick={() => onChange(option.key)}
        >
          {option.label}
          {typeof option.count === "number" && (
            <span
              className={cn(
                "text-11 tabular-nums",
                option.tone === "warning" && option.count > 0 ? "text-warning-primary" : "text-placeholder"
              )}
            >
              {option.count}
            </span>
          )}
        </button>
      );
    })}
  </div>
);
