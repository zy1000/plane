"use client";

import type { ReactNode } from "react";
import { Checkbox } from "@plane/ui";
import { cn } from "@plane/utils";

type TProps = {
  selectedCount: number;
  selectedLabel: string;
  onClearSelection: () => void;
  children?: ReactNode;
  className?: string;
};

/**
 * 列表勾选后的底部批量操作栏。
 *
 * 宽度贴内容、水平居中，浮在分页上方（不占布局行）。
 * 调用方须把本组件放进分页行的 relative 容器里，用 absolute bottom-full 贴在分页顶上。
 */
export function BulkOperationsBar(props: TProps) {
  const { selectedCount, selectedLabel, onClearSelection, children, className } = props;

  if (selectedCount <= 0) return null;

  return (
    <div className={cn("pointer-events-none absolute inset-x-0 bottom-full z-[20] flex justify-center pb-2", className)}>
      <div className="pointer-events-auto inline-flex h-10 w-fit items-center gap-2.5 rounded-[10px] border border-subtle bg-surface-1 px-2.5 shadow-md">
        <div className="flex items-center gap-2 border-r border-subtle pr-2.5">
          <Checkbox checked onClick={onClearSelection} className="size-3.5 !outline-none" iconClassName="size-3" />
          <span className="text-xs text-secondary" aria-live="polite">
            {selectedLabel}
          </span>
        </div>
        {children ? <div className="flex items-center gap-1.5">{children}</div> : null}
      </div>
    </div>
  );
}
