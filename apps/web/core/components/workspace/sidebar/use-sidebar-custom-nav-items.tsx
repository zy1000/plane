/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useParams, usePathname } from "next/navigation";
import { Clock, LayoutDashboard } from "lucide-react";
// plane imports
import { WORKSPACE_ANALYTICS_VIEW_PERMISSION_KEY, WORKSPACE_PROJECT_VIEW_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { ArchiveIcon } from "@plane/propel/icons";
// hooks
import { useUserPermissions } from "@/hooks/store/user";

export type TSidebarCustomNavItem = {
  key: string;
  label: string;
  href: string;
  icon: ReactNode;
  isActive: boolean;
};

/**
 * 侧栏「工时 / 看板 / 归档」三个自研入口的单一来源，
 * 展开态（SidebarMenuItems）与折叠态（CollapsedSidebar）共用，返回值已按权限过滤，顺序即侧栏顺序。
 */
export const useSidebarCustomNavItems = (): TSidebarCustomNavItem[] => {
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { allowWorkspacePermissionKeys } = useUserPermissions();

  const slug = workspaceSlug?.toString() || "";
  const canViewAnalytics = allowWorkspacePermissionKeys([WORKSPACE_ANALYTICS_VIEW_PERMISSION_KEY], slug);
  const canViewProjects = allowWorkspacePermissionKeys([WORKSPACE_PROJECT_VIEW_PERMISSION_KEY], slug);

  const items: (TSidebarCustomNavItem & { shouldRender: boolean })[] = [
    {
      key: "timesheets",
      label: t("timesheets"),
      href: `/${slug}/timesheets/overview/`,
      icon: <Clock className="size-4 flex-shrink-0" />,
      isActive: !!pathname?.includes(`/${slug}/timesheets`),
      shouldRender: true,
    },
    {
      key: "dashboard",
      label: "看板",
      href: `/${slug}/analytics/overview/`,
      icon: <LayoutDashboard className="size-4 flex-shrink-0" />,
      isActive: !!pathname?.includes(`/${slug}/analytics`),
      shouldRender: canViewAnalytics,
    },
    {
      key: "archives",
      label: t("archives"),
      href: `/${slug}/projects/archives/`,
      icon: <ArchiveIcon className="size-4 flex-shrink-0" />,
      isActive: !!pathname?.includes(`/${slug}/projects/archives`),
      shouldRender: canViewProjects,
    },
  ];

  return items.filter((item) => item.shouldRender);
};
