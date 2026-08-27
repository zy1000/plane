/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useMemo } from "react";
import { isEmpty } from "lodash-es";
import { observer } from "mobx-react";
import Link from "next/link";
// plane imports
import {
  WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS,
  WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS_LINKS,
  WORKSPACE_SIDEBAR_STATIC_PINNED_NAVIGATION_ITEMS_LINKS,
} from "@plane/constants";
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
import { SidebarFavoritesMenu } from "@/components/workspace/sidebar/favorites/favorites-menu";
import { useSidebarCustomNavItems } from "@/components/workspace/sidebar/use-sidebar-custom-nav-items";
import { useFavorite } from "@/hooks/store/use-favorite";
import { usePersonalNavigationPreferences } from "@/hooks/use-navigation-preferences";
// plane-web imports
import { SidebarItem } from "@/plane-web/components/workspace/sidebar/sidebar-item";

export const SidebarMenuItems = observer(function SidebarMenuItems() {
  // hooks
  const { preferences: personalPreferences } = usePersonalNavigationPreferences();
  const { groupedFavorites } = useFavorite();
  const customNavItems = useSidebarCustomNavItems();

  // derived values
  const isFavoriteEmpty = isEmpty(groupedFavorites);

  // Filter static navigation items based on personal preferences
  const filteredStaticNavigationItems = useMemo(() => {
    const items = [...WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS_LINKS];
    const personalItems: Array<(typeof items)[0] & { sort_order: number }> = [];

    // Add personal items based on preferences with their sort_order
    const stickiesItem = WORKSPACE_SIDEBAR_STATIC_NAVIGATION_ITEMS["stickies"];
    if (personalPreferences.items.stickies?.enabled && stickiesItem) {
      personalItems.push({
        ...stickiesItem,
        sort_order: personalPreferences.items.stickies.sort_order,
      });
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

    // Sort personal items by sort_order
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

  const pinnedSidebarItems = useMemo(() => WORKSPACE_SIDEBAR_STATIC_PINNED_NAVIGATION_ITEMS_LINKS, []);

  return (
    <div className="flex h-full flex-col">
      <div>
        <div className="flex flex-col gap-0.5">
          {filteredStaticNavigationItems.map((item) => (
            <SidebarItem key={`static_${item.key}`} item={item} />
          ))}
        </div>

        <hr className="my-3 border-subtle" />
        <div className="flex flex-col gap-0.5">
          {pinnedSidebarItems.map((item) => (
            <SidebarItem key={`pinned_${item.key}`} item={item} />
          ))}
        </div>
        {/* 自研入口：工时 / 看板 / 归档 */}
        <div className="flex flex-col gap-0.5">
          {customNavItems.map((item) => (
            <Link key={`custom_${item.key}`} href={item.href}>
              <SidebarNavItem isActive={item.isActive}>
                <div className="flex items-center gap-1.5 py-[1px]">
                  {item.icon}
                  <p className="text-13 leading-5 font-medium">{item.label}</p>
                </div>
              </SidebarNavItem>
            </Link>
          ))}
        </div>
        {/* Favorites Menu */}
        {!isFavoriteEmpty && (
          <>
            <hr className="mt-2 mb-1 border-subtle" />
            <SidebarFavoritesMenu />
          </>
        )}
      </div>
    </div>
  );
});
