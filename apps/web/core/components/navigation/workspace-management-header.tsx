/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TabNavigationItem, TabNavigationList } from "@plane/propel/tab-navigation";
import { Header, Row } from "@plane/ui";
import { cn } from "@plane/utils";
import { useAppTheme } from "@/hooks/store/use-app-theme";

export type TWorkspaceManagementTab = {
  key: string;
  label: string;
  href: string;
};

type Props = {
  icon: ReactNode;
  title: string;
  /** 可选的二级 Tab，不传或为空时只渲染标题 */
  tabs?: TWorkspaceManagementTab[];
};

export const WorkspaceManagementNavigation = observer(function WorkspaceManagementNavigation({
  icon,
  title,
  tabs = [],
}: Props) {
  const pathname = usePathname();
  const { sidebarCollapsed } = useAppTheme();

  return (
    <div className="z-20">
      <Row className="flex h-header w-full items-center gap-2 border-b border-subtle bg-surface-1">
        <div className="flex h-full w-full items-center gap-2 divide-x divide-subtle">
          <div className="flex size-full flex-1 items-center gap-2">
            <Header className={cn("h-full", { "pl-1.5": !sidebarCollapsed })}>
              <Header.LeftItem className="flex h-full max-w-full items-center gap-2">
                <div className="flex size-full items-center gap-3 overflow-hidden">
                  <div className="flex flex-shrink-0 items-center gap-1.5 text-sm font-medium text-secondary">
                    {icon}
                    <span>{title}</span>
                  </div>
                  {tabs.length > 0 && (
                    <>
                      <div className="h-5 w-px flex-shrink-0 bg-border-subtle" />
                      <TabNavigationList className="h-full">
                        {tabs.map((tab) => {
                          const isActive = !!pathname?.includes(tab.href);
                          return (
                            <div key={tab.key} className="relative flex h-full items-center">
                              {isActive && (
                                <span className="absolute -bottom-px left-1/2 h-0.5 w-[80%] -translate-x-1/2 rounded-t-md bg-(--text-color-icon-primary)" />
                              )}
                              <Link href={tab.href}>
                                <TabNavigationItem isActive={isActive}>
                                  <span>{tab.label}</span>
                                </TabNavigationItem>
                              </Link>
                            </div>
                          );
                        })}
                      </TabNavigationList>
                    </>
                  )}
                </div>
              </Header.LeftItem>
            </Header>
          </div>
        </div>
      </Row>
    </div>
  );
});
