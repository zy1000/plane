/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { cn } from "@plane/utils";

type TSidebarPropertyListItemProps = {
  icon: React.FC<{ className?: string }>;
  label: string;
  children: ReactNode;
  appendElement?: ReactNode;
  childrenClassName?: string;
  /**
   * 控制 label 与 children 在垂直方向的对齐方式。
   * - "center"（默认）：label 与 children 在容器内垂直居中，适用于单行控件。
   * - "start"：label 贴顶对齐，适用于 children 可能撑高（如段落文本域）的场景，避免 label 被居中。
   */
  align?: "center" | "start";
};

export function SidebarPropertyListItem(props: TSidebarPropertyListItemProps) {
  const { icon: Icon, label, children, appendElement, childrenClassName, align = "center" } = props;

  return (
    <div className={cn("flex gap-2", align === "start" ? "items-start" : "items-center")}>
      <div className="flex h-7.5 w-30 shrink-0 items-center gap-1.5 text-body-xs-regular text-tertiary">
        <Icon className="size-4 shrink-0" />
        <span>{label}</span>
        {appendElement}
      </div>
      <div className={cn("flex min-w-0 flex-1 flex-wrap items-center gap-1", childrenClassName)}>{children}</div>
    </div>
  );
}
