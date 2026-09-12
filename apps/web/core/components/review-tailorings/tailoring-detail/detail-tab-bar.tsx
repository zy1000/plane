import type { ReactNode } from "react";
import { cn } from "@plane/utils";

export type TDetailTab = "matrix" | "items" | "activity" | "comments";

/**
 * Tab 条：左边四个 Tab（带计数徽章），右边是当前 Tab 自己的工具（矩阵的筛选、折叠、加轴）。
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
