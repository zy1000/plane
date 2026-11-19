/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useReducer } from "react";
import type { CSSProperties, FC } from "react";
import { useParams } from "next/navigation";
import * as LucideIcons from "lucide-react";
import { Layers } from "lucide-react";
import { getWorkItemTypeIconConfig } from "@plane/constants";
import { cn } from "@plane/utils";
import { ProjectIssueTypeService, projectIssueTypesCache } from "@/services/project/project-issue-type.service";

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
  /** 类型上配置的图标（logo_props.icon）；有值时优先于按类型名称匹配的固定图标 */
  fallbackIcon?: TLegacyWorkItemIcon;
  fallbackTypeName?: string | null;
  /** 未传 fallbackIcon 时，按项目 + 类型 id 从项目类型缓存取配置的图标；缓存没有就拉一次该项目的类型列表 */
  projectId?: string | null;
  typeId?: string | null;
};

const issueTypeService = new ProjectIssueTypeService();
// 同一项目的类型列表只请求一次：同屏多个图标共用一个请求，失败也不重试
const issueTypesRequests = new Map<string, Promise<unknown>>();

const useConfiguredTypeIcon = (projectId?: string | null, typeId?: string | null) => {
  const { workspaceSlug } = useParams();
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const hasCache = !!projectId && projectIssueTypesCache.has(projectId);

  useEffect(() => {
    if (!workspaceSlug || !projectId || !typeId || hasCache) return;
    let request = issueTypesRequests.get(projectId);
    if (!request) {
      request = issueTypeService.fetchProjectIssueTypes(workspaceSlug.toString(), projectId).catch(() => undefined);
      issueTypesRequests.set(projectId, request);
    }
    let cancelled = false;
    void request.then(() => {
      if (!cancelled) rerender();
    });
    return () => {
      cancelled = true;
    };
  }, [workspaceSlug, projectId, typeId, hasCache]);

  return projectId && typeId ? projectIssueTypesCache.get(projectId)?.[typeId]?.logo_props?.icon : undefined;
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
    projectId,
    typeId,
  } = props;

  const cachedIcon = useConfiguredTypeIcon(fallbackIcon?.name ? undefined : projectId, typeId);
  const configuredIcon = fallbackIcon?.name ? fallbackIcon : cachedIcon?.name ? cachedIcon : undefined;
  const iconConfig = configuredIcon ?? getWorkItemTypeIconConfig(typeName);
  const displayTypeName = (typeName ?? fallbackTypeName ?? "Work item").trim();
  const wrapperStyle: CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    color: iconConfig?.color || "currentColor",
  };
  const IconComp = iconConfig?.name
    ? ((LucideIcons as Record<string, FC<{ className?: string; strokeWidth?: number }>>)[iconConfig.name] ?? Layers)
    : Layers;

  return (
    <span
      className={cn("inline-flex shrink-0 items-center justify-center rounded-sm", className)}
      style={wrapperStyle}
      aria-label={`Issue type: ${displayTypeName}`}
      title={title ?? displayTypeName}
    >
      <IconComp className={cn("h-3.5 w-3.5", iconClassName)} strokeWidth={2} />
    </span>
  );
};
