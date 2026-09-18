"use client";

import { Checkbox } from "@plane/ui";
import { cn } from "@plane/utils";

/**
 * 行首的勾选框：绝对定位在宿主格的左内边距里，不单独占一列。
 *
 * 平时隐身，鼠标移到这一行（或表头）才浮现，选中后常驻 —— 没在批量操作时，
 * 表格看起来还是一张干净的表。宿主格要 `relative` 且左内边距留出位置（`pl-10`）。
 */
export const TableSelectCheckbox = ({
  checked,
  indeterminate,
  forceVisible = false,
  hoverGroup,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  /** 有选中时常驻显示 */
  forceVisible?: boolean;
  /** 表头跟着 `group/header` 走，行跟着行自己的 `group` 走 */
  hoverGroup: "header" | "row";
  label: string;
  onChange: (checked: boolean) => void;
}) => (
  <div className="absolute inset-y-0 left-3 z-[1] grid w-3.5 place-items-center" onClick={(event) => event.stopPropagation()}>
    <Checkbox
      className="size-3.5 !outline-none"
      iconClassName="size-3"
      checked={checked}
      indeterminate={indeterminate}
      aria-label={label}
      title={label}
      onChange={(event) => onChange(event.target.checked)}
      containerClassName={cn(
        "pointer-events-none opacity-0 transition-opacity",
        hoverGroup === "header"
          ? "group-hover/header:pointer-events-auto group-hover/header:opacity-100"
          : "group-hover:pointer-events-auto group-hover:opacity-100",
        (forceVisible || checked || indeterminate) && "pointer-events-auto opacity-100"
      )}
    />
  </div>
);
