/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Header, Row } from "@plane/ui";
import { cn } from "@plane/utils";
import { TabNavigationRoot } from "@/components/navigation/tab-navigation-root";
import { AppSidebarToggleButton } from "@/components/sidebar/sidebar-toggle-button";
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useProjectNavigationPreferences } from "@/hooks/use-navigation-preferences";

type TProjectTopNavigationProps = {
  workspaceSlug: string;
  projectId: string;
};

export const ProjectTopNavigation = observer(function ProjectTopNavigation(props: TProjectTopNavigationProps) {
  const { workspaceSlug, projectId } = props;
  const { sidebarCollapsed } = useAppTheme();
  const { preferences: projectPreferences } = useProjectNavigationPreferences();

  if (projectPreferences.navigationMode !== "horizontal") return null;

  return (
    <div className="z-20">
      <Row className="flex h-header w-full items-center gap-2 border-b border-subtle bg-surface-1">
        <div className="flex h-full w-full items-center gap-2 divide-x divide-subtle">
          <div className="flex size-full flex-1 items-center gap-2">
            {sidebarCollapsed && (
              <div className="shrink-0">
                <AppSidebarToggleButton />
              </div>
            )}
            <Header className={cn("h-full", { "pl-1.5": !sidebarCollapsed })}>
              <Header.LeftItem className="flex h-full max-w-full items-center gap-2">
                <TabNavigationRoot workspaceSlug={workspaceSlug} projectId={projectId} />
              </Header.LeftItem>
            </Header>
          </div>
        </div>
      </Row>
    </div>
  );
});
