/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { TabNavigationItem, TabNavigationList } from "@plane/propel/tab-navigation";
import { Header, Row } from "@plane/ui";
import { cn } from "@plane/utils";
import { useAppTheme } from "@/hooks/store/use-app-theme";

export const WorkspaceManagementNavigation = observer(function WorkspaceManagementNavigation() {
  const { workspaceSlug } = useParams();
  const pathname = usePathname();
  const { sidebarCollapsed } = useAppTheme();

  const slug = workspaceSlug?.toString() || "";
  const isAnalyticsActive = !!pathname?.includes("/analytics");
  const isArchivesActive = !!pathname?.includes("/projects/archives");

  const tabs = [
    {
      key: "analytics",
      label: "分析",
      href: `/${slug}/analytics`,
      isActive: isAnalyticsActive,
    },
    {
      key: "archives",
      label: "归档",
      href: `/${slug}/projects/archives`,
      isActive: isArchivesActive,
    },
  ];

  return (
    <div className="z-20">
      <Row className="flex h-header w-full items-center gap-2 border-b border-subtle bg-surface-1">
        <div className="flex h-full w-full items-center gap-2 divide-x divide-subtle">
          <div className="flex size-full flex-1 items-center gap-2">
            <Header className={cn("h-full", { "pl-1.5": !sidebarCollapsed })}>
              <Header.LeftItem className="flex h-full max-w-full items-center gap-2">
                <div className="flex size-full items-center gap-3 overflow-hidden">
                  <div className="flex flex-shrink-0 items-center gap-1.5 text-sm font-medium text-secondary">
                    <LayoutDashboard className="size-4 flex-shrink-0" />
                    <span>工作区</span>
                  </div>
                  <div className="h-5 w-px flex-shrink-0 bg-border-subtle" />
                  <TabNavigationList className="h-full">
                    {tabs.map((tab) => (
                      <div key={tab.key} className="relative flex h-full items-center">
                        {tab.isActive && (
                          <span className="absolute bottom-0 left-1/2 h-0.5 w-[80%] -translate-x-1/2 rounded-t-md bg-(--text-color-icon-primary)" />
                        )}
                        <Link href={tab.href}>
                          <TabNavigationItem isActive={tab.isActive}>
                            <span>{tab.label}</span>
                          </TabNavigationItem>
                        </Link>
                      </div>
                    ))}
                  </TabNavigationList>
                </div>
              </Header.LeftItem>
            </Header>
          </div>
        </div>
      </Row>
    </div>
  );
});
