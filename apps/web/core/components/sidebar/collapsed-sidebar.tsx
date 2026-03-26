/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useMemo } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { LayoutDashboard, PanelLeft } from "lucide-react";
import {
  WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS,
  WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS_LINKS,
  WORKSPACE_SIDEBAR_STATIC_PINNED_NAVIGATION_ITEMS_LINKS,
  EUserPermissions,
  EUserPermissionsLevel,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { cn, joinUrlPath } from "@plane/utils";
import { Tooltip } from "@plane/ui";
// components
import { HelpMenuRoot } from "@/components/workspace/sidebar/help-section/root";
import { UserMenuRoot } from "@/components/workspace/sidebar/user-menu-root";
import { WorkspaceMenuRoot } from "@/components/workspace/sidebar/workspace-menu-root";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useWorkspaceNotifications } from "@/hooks/store/notifications";
import { usePersonalNavigationPreferences } from "@/hooks/use-navigation-preferences";
// plane-web
import { getSidebarNavigationItemIcon } from "@/plane-web/components/workspace/sidebar/helper";

/** 折叠侧栏导航图标的容器：固定 32×32；激活态仅背景/文字，不额外描边 */
function collapsedNavIconClass(isActive: boolean) {
  return cn(
    "flex size-8 shrink-0 items-center justify-center rounded-md",
    isActive ? "bg-layer-transparent-selected text-primary" : "text-secondary hover:bg-layer-transparent-hover"
  );
}

type NavIconProps = {
  slug: string;
  pathname: string | null;
  item: { key: string; href: string; labelTranslationKey: string; highlight: (p: string, u: string) => boolean };
  t: (key: string) => string;
  badgeDot?: boolean;
};

function NavIconItem({ slug, pathname, item, t, badgeDot = false }: NavIconProps) {
  const itemHref = joinUrlPath(slug, item.href);
  const icon = getSidebarNavigationItemIcon(item.key);
  const isActive = item.highlight(pathname ?? "", itemHref);
  if (!icon) return null;

  return (
    <Tooltip tooltipContent={t(item.labelTranslationKey)} position="right">
      <Link href={itemHref} className="flex w-full justify-center">
        <div className={collapsedNavIconClass(isActive)}>
          {badgeDot ? (
            <div className="relative flex-shrink-0">
              {icon}
              <span className="absolute -top-0 -right-0 size-2 rounded-full bg-danger-primary" />
            </div>
          ) : (
            icon
          )}
        </div>
      </Link>
    </Tooltip>
  );
}

export const CollapsedSidebar = observer(function CollapsedSidebar() {
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
  const { t } = useTranslation();
  const { toggleSidebar } = useAppTheme();
  const { allowPermissions } = useUserPermissions();
  const { data: currentUser } = useUser();
  const { preferences: personalPreferences } = usePersonalNavigationPreferences();
  const { unreadNotificationsCount } = useWorkspaceNotifications();

  const slug = workspaceSlug?.toString() || "";

  const canPerformWorkspaceMemberActions = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );

  const filteredStaticNavigationItems = useMemo(() => {
    const items = [...WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS_LINKS];
    const personalItems: Array<(typeof items)[0] & { sort_order: number }> = [];

    const stickiesItem = WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS["stickies"];
    if (personalPreferences.items.stickies?.enabled && stickiesItem) {
      personalItems.push({ ...stickiesItem, sort_order: personalPreferences.items.stickies.sort_order });
    }
    if (personalPreferences.items.your_work?.enabled && WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS["your-work"]) {
      personalItems.push({
        ...WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS["your-work"],
        sort_order: personalPreferences.items.your_work.sort_order,
      });
    }
    if (personalPreferences.items.drafts?.enabled && WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS["drafts"]) {
      personalItems.push({
        ...WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS["drafts"],
        sort_order: personalPreferences.items.drafts.sort_order,
      });
    }

    personalItems.sort((a, b) => a.sort_order - b.sort_order);

    const mergedItems = [...items, ...personalItems];
    const inboxItem = WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS["inbox"];
    if (inboxItem) {
      const stickiesIndex = mergedItems.findIndex((item) => item.key === "stickies");
      if (stickiesIndex >= 0) {
        mergedItems.splice(stickiesIndex + 1, 0, inboxItem);
      } else {
        mergedItems.push(inboxItem);
      }
    }

    return mergedItems;
  }, [personalPreferences]);

  const projectsSidebarItem = useMemo(
    () => WORKSPACE_SIDEBAR_STATIC_PINNED_NAVIGATION_ITEMS_LINKS.find((item) => item.key === "projects"),
    []
  );

  const isMentionsEnabled = unreadNotificationsCount.mention_unread_notifications_count > 0;
  const totalNotifications = isMentionsEnabled
    ? unreadNotificationsCount.mention_unread_notifications_count
    : unreadNotificationsCount.total_unread_notifications_count;

  return (
    <div className="flex h-full flex-col items-center gap-1 pb-3">
      {/* Workspace Switcher */}
      <div className="w-full px-1.5">
        <WorkspaceMenuRoot variant="sidebar" />
      </div>

      <hr className="w-full border-subtle" />

      {/* Navigation Icons */}
      <div className="flex w-full flex-col items-center gap-0.5 px-1.5">
        {filteredStaticNavigationItems.map((item) => {
          const itemHref =
            item.key === "your_work" && currentUser?.id
              ? joinUrlPath(slug, item.href, currentUser.id)
              : joinUrlPath(slug, item.href);
          const icon = getSidebarNavigationItemIcon(item.key);
          const isActive = item.highlight(pathname ?? "", itemHref);
          const shouldShowInboxDot = item.key === "inbox" && totalNotifications > 0;
          if (!icon) return null;

          return (
            <Tooltip key={item.key} tooltipContent={t(item.labelTranslationKey)} position="right">
              <Link href={itemHref} className="flex w-full justify-center">
                <div className={collapsedNavIconClass(isActive)}>
                  {shouldShowInboxDot ? (
                    <div className="relative flex-shrink-0">
                      {icon}
                      <span className="absolute -top-0 -right-0 size-2 rounded-full bg-danger-primary" />
                    </div>
                  ) : (
                    icon
                  )}
                </div>
              </Link>
            </Tooltip>
          );
        })}

        {canPerformWorkspaceMemberActions && (
          <Tooltip tooltipContent="工作区" position="right">
            <Link href={`/${slug}/analytics`} className="flex w-full justify-center">
              <div
                className={collapsedNavIconClass(
                  !!(pathname?.includes(`/${slug}/analytics`) || pathname?.includes(`/${slug}/projects/archives`))
                )}
              >
                <LayoutDashboard className="size-4 flex-shrink-0" />
              </div>
            </Link>
          </Tooltip>
        )}

        {projectsSidebarItem && (
          <NavIconItem slug={slug} pathname={pathname} item={projectsSidebarItem} t={t} />
        )}
      </div>

      {/* Bottom area */}
      <div className="mt-auto flex w-full flex-col items-center gap-1 px-1.5">
        <UserMenuRoot size="xs" />
        <HelpMenuRoot />
        <Tooltip tooltipContent="展开侧栏" position="right">
          <button
            type="button"
            onClick={() => toggleSidebar()}
            className="flex size-8 w-full items-center justify-center rounded-md text-secondary hover:bg-layer-transparent-hover"
            aria-label="展开侧栏"
          >
            <PanelLeft className="size-4" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
});
