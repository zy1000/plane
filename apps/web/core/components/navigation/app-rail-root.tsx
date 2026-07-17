/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";
import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
import { SettingsIcon } from "lucide-react";
import { WORKSPACE_SETTINGS_VIEW_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { ContextMenu } from "@plane/propel/context-menu";
import { CheckIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import { cn } from "@plane/utils";
// components
import { AppSidebarItem } from "@/components/sidebar/sidebar-item";
// hooks
import { useAppRailPreferences } from "@/hooks/use-navigation-preferences";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRailVisibility } from "@/lib/app-rail/context";
// plane web imports
import { DesktopSidebarWorkspaceMenu } from "@/plane-web/components/desktop";
// local imports
import { AppSidebarItemsRoot } from "./items-root";

export const AppRailRoot = observer(() => {
  // router
  const { workspaceSlug, projectId } = useParams();
  const pathname = usePathname();
  const { t } = useTranslation();
  // preferences
  const { preferences, updateDisplayMode } = useAppRailPreferences();
  const { allowWorkspacePermissionKeys } = useUserPermissions();
  const { isCollapsed, toggleAppRail } = useAppRailVisibility();
  // derived values
  const isWorkspaceSettingsPath = pathname.includes(`/${workspaceSlug}/settings`) && !projectId;
  const canViewWorkspaceSettings = allowWorkspacePermissionKeys(
    [WORKSPACE_SETTINGS_VIEW_PERMISSION_KEY],
    workspaceSlug?.toString()
  );
  const showLabel = preferences.displayMode === "icon_with_label";
  const railWidth = showLabel ? "3.75rem" : "3rem";

  return (
    <div
      className="z-[26] h-full flex-shrink-0 bg-canvas transition-all duration-300 ease-in-out"
      style={{
        width: railWidth,
        display: "block",
      }}
    >
      <ContextMenu>
        <ContextMenu.Trigger className="h-full">
          <div className="flex h-full flex-col justify-between gap-4 px-2 py-3">
            <div
              className={cn("flex flex-col", {
                "gap-4": showLabel,
                "gap-3": !showLabel,
              })}
            >
              <DesktopSidebarWorkspaceMenu />
              <AppSidebarItemsRoot showLabel={showLabel} />
              <div className="mx-2 border-t border-strong" />
              <Tooltip
                disabled={canViewWorkspaceSettings}
                tooltipContent={
                  !canViewWorkspaceSettings ? t("you_do_not_have_the_permission_to_access_this_page") : null
                }
                position="right"
              >
                <span className={cn("inline-flex justify-center", { "cursor-not-allowed": !canViewWorkspaceSettings })}>
                  <AppSidebarItem
                    variant={canViewWorkspaceSettings ? "link" : "button"}
                    item={{
                      label: "Settings",
                      icon: <SettingsIcon className="size-5" />,
                      href: `/${workspaceSlug}/settings`,
                      isActive: canViewWorkspaceSettings && isWorkspaceSettingsPath,
                      disabled: !canViewWorkspaceSettings,
                      showLabel,
                    }}
                  />
                </span>
              </Tooltip>
            </div>
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content positionerClassName="z-30" className="outline-none">
            <ContextMenu.Item onClick={() => updateDisplayMode("icon_only")}>
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-11">Icon only</span>
                {preferences.displayMode === "icon_only" && <CheckIcon className="size-3.5" />}
              </div>
            </ContextMenu.Item>
            <ContextMenu.Item onClick={() => updateDisplayMode("icon_with_label")}>
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-11">Icon with name</span>
                {preferences.displayMode === "icon_with_label" && <CheckIcon className="size-3.5" />}
              </div>
            </ContextMenu.Item>
            <ContextMenu.Separator />
            <ContextMenu.Item onClick={toggleAppRail}>
              <span className="text-11">{isCollapsed ? "Dock App Rail" : "Undock App Rail"}</span>
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu>
    </div>
  );
});
