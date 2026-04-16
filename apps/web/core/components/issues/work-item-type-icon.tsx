/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { CSSProperties, FC } from "react";
import * as LucideIcons from "lucide-react";
import { Layers } from "lucide-react";
import { getWorkItemTypeIconConfig } from "@plane/constants";
import { cn } from "@plane/utils";

type TLegacyWorkItemIcon = {
  name?: string;
  color?: string;
  background_color?: string;
};

type Props = {
  typeName?: string | null;
  className?: string;
  iconClassName?: string;
  title?: string;
  size?: number;
  fallbackIcon?: TLegacyWorkItemIcon;
  fallbackTypeName?: string | null;
};

export const WorkItemTypeIcon = (props: Props) => {
  const {
    typeName,
    className,
    iconClassName,
    title,
    size = 16,
    fallbackIcon,
    fallbackTypeName,
  } = props;

  const iconConfig = getWorkItemTypeIconConfig(typeName) ?? fallbackIcon;
  const displayTypeName = (typeName ?? fallbackTypeName ?? "Work item").trim();
  const wrapperStyle: CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    backgroundColor: iconConfig?.background_color || "transparent",
    color: iconConfig?.color || "currentColor",
  };
  const IconComp = iconConfig?.name
    ? ((LucideIcons as Record<string, FC<{ className?: string; strokeWidth?: number }>>)[iconConfig.name] ?? Layers)
    : Layers;

  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-sm", className)}
      style={wrapperStyle}
      aria-label={`Issue type: ${displayTypeName}`}
      title={title ?? displayTypeName}
    >
      <IconComp className={cn("h-3.5 w-3.5", iconClassName)} strokeWidth={2} />
    </span>
  );
};
