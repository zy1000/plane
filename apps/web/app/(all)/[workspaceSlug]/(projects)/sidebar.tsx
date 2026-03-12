/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { FC } from "react";
import { observer } from "mobx-react";
// components
import { SidebarWrapper } from "@/components/sidebar/sidebar-wrapper";
import { SidebarProjectsList } from "@/components/workspace/sidebar/projects-list";
import { SidebarMenuItems } from "@/components/workspace/sidebar/sidebar-menu-items";
// plane web components
import { SidebarTeamsList } from "@/plane-web/components/workspace/sidebar/teams-sidebar-list";

export const AppSidebar = observer(function AppSidebar() {
  return (
    <SidebarWrapper title="Projects" quickActions={<div className="border-t border-subtle-1" />}>
      <SidebarMenuItems />
      {/* Teams List */}
      <SidebarTeamsList />
      {/* Projects List */}
      <SidebarProjectsList />
    </SidebarWrapper>
  );
});
