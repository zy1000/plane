"use client";

import { useCallback, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { TableHead } from "@plane/propel/table";
import { cn } from "@plane/utils";

/**
 * 列宽拖拽：表头右缘 8px 的热区，按住左右拖。
 *
 * 这套交互原本在用例表、计划用例表、需求网格、工作项 spreadsheet 里各抄了一份，
 * 这里收成一处。宽度只活在组件树里，刷新回默认 —— 各处都没做持久化，保持一致。
 */
export const useColumnWidths = (defaults: Record<string, number>) => {
  const [widths, setWidths] = useState<Record<string, number>>({});

  const setWidth = useCallback((key: string, width: number) => {
    setWidths((current) => ({ ...current, [key]: width }));
  }, []);

  /** 定宽列用它；不传宽度的列吃掉剩余宽度，所以右边不会留白 */
  const widthOf = useCallback((key: string) => widths[key] ?? defaults[key], [widths, defaults]);

  return { widths, setWidth, widthOf };
};

/**
 * 可拖宽的表头格。`onResize` 不传就是不可拖的列（例如吃剩余宽度的那一列）。
 *
 * `selectHost` 是给行首复选框腾位置的：复选框绝对定位在左侧内边距里，不单独占一列。
 */
export const ResizableTableHead = ({
  children,
  className,
  minWidth = 80,
  onResize,
  selectHost = false,
  style,
}: {
  children: ReactNode;
  className?: string;
  minWidth?: number;
  onResize?: (width: number) => void;
  selectHost?: boolean;
  style?: CSSProperties;
}) => {
  const thRef = useRef<HTMLTableCellElement>(null);

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!onResize || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startWidth = thRef.current?.getBoundingClientRect().width ?? 0;
    // 拖动期间整页禁选，否则拖过表头会把标题文字刷成选中态
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (moveEvent: MouseEvent) => {
      onResize(Math.round(Math.max(minWidth, startWidth + (moveEvent.clientX - startX))));
    };

    const handleMouseUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <TableHead
      ref={thRef}
      className={cn(
        "group/header relative h-12 border-r border-b border-subtle py-0 align-middle text-13 font-medium text-secondary",
        selectHost ? "pr-3 pl-10" : "px-3",
        className
      )}
      style={style}
    >
      {children}
      {onResize && (
        <div
          className="group/resizer absolute top-0 right-0 z-[1] h-full w-2 cursor-col-resize"
          onMouseDown={handleMouseDown}
          role="presentation"
        >
          <span className="absolute top-0 right-0 h-full w-px bg-transparent transition-colors group-hover/header:bg-accent-primary/40 group-hover/resizer:bg-accent-primary" />
        </div>
      )}
    </TableHead>
  );
};
