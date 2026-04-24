/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { ChevronDown } from "lucide-react";
import type { TButtonVariant } from "@plane/propel/button";
// helpers
import { Button } from "@plane/propel/button";
import { cn } from "@plane/utils";

type Props = {
  icon: React.ReactNode;
  title: string;
  disabled?: boolean;
  onClick?: () => void;
  /**
   * 仅渲染图标+文案，用于外层已有可点击元素（如 CustomMenu 的触发 button / 原生日 button）时，避免 button 套 button。
   */
  asContentOnly?: boolean;
  className?: string;
  /**
   * 默认 `secondary`；在按钮组中可用 `ghost` 等以贴合分段样式。
   */
  variant?: TButtonVariant;
  /**
   * 为 false 时仅显示图标，文案写入 `sr-only` 供读屏，避免界面上出现名称。
   */
  showLabel?: boolean;
  /** 下拉菜单触发器：在右侧显示小箭头（与 CustomMenu 等配合） */
  showMenuChevron?: boolean;
};

export function IssueDetailWidgetButton(props: Props) {
  const {
    icon,
    title,
    disabled = false,
    onClick,
    asContentOnly,
    className,
    variant = "secondary",
    showLabel = true,
    showMenuChevron = false,
  } = props;
  const visibleLabel = showLabel ? <span className="text-body-xs-medium">{title}</span> : null;
  const a11yLabel = !showLabel ? <span className="sr-only">{title}</span> : null;
  const menuChevron = showMenuChevron ? (
    <ChevronDown className="h-3 w-3 shrink-0 text-tertiary" strokeWidth={2} aria-hidden />
  ) : null;

  if (asContentOnly) {
    return (
      <span
        className={cn(
          "inline-flex min-w-0 max-w-full items-center justify-center text-secondary",
          "pointer-events-none select-none", // 点击由外层处理
          showLabel || showMenuChevron ? "gap-1" : "gap-0",
          className
        )}
      >
        {a11yLabel}
        {icon}
        {visibleLabel}
        {menuChevron}
      </span>
    );
  }

  return (
    <Button variant={variant} disabled={disabled} size="lg" onClick={onClick} className={className}>
      {a11yLabel}
      {icon}
      {visibleLabel}
      {menuChevron}
    </Button>
  );
}
