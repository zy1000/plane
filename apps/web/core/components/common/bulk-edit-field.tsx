"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@plane/utils";

/** 批量「修改属性」面板的一行：左侧固定宽标签 + 右侧字段 */
export function BulkEditFieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[72px] shrink-0 text-13 text-secondary">{label}</span>
      {children}
    </div>
  );
}

/**
 * 批量「修改属性」面板的字段外框。`isSet` 时换成强调色边框，右侧出一个 × 改回「保持不变」。
 */
export function BulkEditFieldShell({
  isSet,
  onReset,
  resetLabel = "改回保持不变",
  children,
}: {
  isSet: boolean;
  onReset: () => void;
  resetLabel?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-9 min-w-0 flex-1 items-center rounded-md border transition-colors",
        isSet ? "border-accent-strong bg-accent-subtle" : "border-subtle bg-surface-1 hover:border-strong"
      )}
    >
      {children}
      {isSet && (
        <button
          type="button"
          className="mr-2 flex size-5 shrink-0 items-center justify-center rounded-full text-tertiary hover:bg-layer-transparent-hover hover:text-secondary"
          onClick={onReset}
          aria-label={resetLabel}
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}
