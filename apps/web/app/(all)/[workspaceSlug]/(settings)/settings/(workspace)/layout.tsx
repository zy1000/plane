/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { usePathname } from "next/navigation";
import { Outlet } from "react-router";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { getWorkspaceActivePath, pathnameToAccessKey } from "@/components/settings/helper";
import { SettingsMobileNav } from "@/components/settings/mobile/nav";
// plane imports
import { WORKSPACE_SETTINGS } from "@plane/constants";
// components
import { WorkspaceSettingsSidebarRoot } from "@/components/settings/workspace/sidebar";
// hooks
import { useUserPermissions } from "@/hooks/store/user";

import type { Route } from "./+types/layout";

const WorkspaceSettingLayout = observer(function WorkspaceSettingLayout({ params }: Route.ComponentProps) {
  // router
  const { workspaceSlug } = params;
  // store hooks
  const { workspaceInfoBySlug, allowWorkspacePermissionKeys } = useUserPermissions();
  // next hooks
  const pathname = usePathname();
  // derived values
  const { accessKey } = pathnameToAccessKey(pathname);
  const currentSetting = Object.values(WORKSPACE_SETTINGS).find((setting) => setting.href === accessKey);
  const permissionKeys =
    currentSetting && "permissionKeys" in currentSetting ? currentSetting.permissionKeys : undefined;
  const requiresMembership =
    currentSetting && "requiresMembership" in currentSetting ? currentSetting.requiresMembership : false;
  const workspaceInfo = workspaceInfoBySlug(workspaceSlug);

  const isAuthorized = Boolean(
    pathname &&
    workspaceSlug &&
    workspaceInfo &&
    currentSetting &&
    (permissionKeys?.length
      ? allowWorkspacePermissionKeys(permissionKeys, workspaceSlug)
      : requiresMembership)
  );

  if (!workspaceInfo) return null;

  return (
    <>
      <SettingsMobileNav
        hamburgerContent={WorkspaceSettingsSidebarRoot}
        activePath={getWorkspaceActivePath(pathname) || ""}
      />
      <div className="inset-y-0 flex h-full w-full flex-row">
        {!isAuthorized ? (
          <NotAuthorizedView section="settings" className="h-auto" />
        ) : (
          <div className="relative flex size-full">
            <div className="hidden h-full md:block">
              <WorkspaceSettingsSidebarRoot />
            </div>
            <Outlet />
          </div>
        )}
      </div>
    </>
  );
});

export default WorkspaceSettingLayout;
