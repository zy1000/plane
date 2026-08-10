/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { setToast, TOAST_TYPE } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIdentifierTextProps, TIdentifierTextVariant, TIssueIdentifierSize } from "@plane/types";
import { cn } from "@plane/utils";

const SIZE_MAP: Record<TIssueIdentifierSize, string> = {
  xs: "text-caption-sm-regular",
  sm: "text-caption-sm-medium",
  md: "text-caption-md-medium",
  lg: "text-caption-lg-medium",
};

const VARIANT_MAP: Record<TIdentifierTextVariant, string> = {
  default: "text-tertiary",
  secondary: "text-secondary",
  tertiary: "text-tertiary",
  primary: "text-primary",
  "primary-subtle": "text-primary/80",
  success: "text-success-primary",
};

type TProps = TIdentifierTextProps & {
  /** 复制成功的 toast 标题。需求等非工作项场景必须传，否则会弹出工作项的文案 */
  copyToastTitle?: string;
  /** 悬浮提示文案 */
  copyTooltipContent?: string;
};

export function IdentifierText(props: TProps) {
  const {
    identifier,
    enableClickToCopyIdentifier = false,
    size = "lg",
    variant = "default",
    copyToastTitle = "Work item ID copied to clipboard",
    copyTooltipContent = "Click to copy",
  } = props;
  // handlers
  const handleCopyIssueIdentifier = () => {
    if (enableClickToCopyIdentifier) {
      navigator.clipboard
        .writeText(identifier)
        .then(() => {
          setToast({
            type: TOAST_TYPE.SUCCESS,
            title: copyToastTitle,
          });
          return;
        })
        .catch(() => {
          console.error("Failed to copy identifier");
        });
    }
  };

  const textSizeClassName = SIZE_MAP[size];
  const variantClassName = VARIANT_MAP[variant];
  const textClassName = cn("text-12 font-medium whitespace-nowrap", textSizeClassName, variantClassName, {
    "cursor-pointer": enableClickToCopyIdentifier,
  });

  // 非「点击复制」时为纯文本：避免在外层为 <button> 的父级中再包一层 <button disabled>，否则点击会落在内层，无法触发行级操作（如菜单项跳转）
  return (
    <Tooltip tooltipContent={copyTooltipContent} disabled={!enableClickToCopyIdentifier} position="top">
      {enableClickToCopyIdentifier ? (
        <button type="button" className={textClassName} onClick={handleCopyIssueIdentifier}>
          {identifier}
        </button>
      ) : (
        <span className={textClassName}>{identifier}</span>
      )}
    </Tooltip>
  );
}
