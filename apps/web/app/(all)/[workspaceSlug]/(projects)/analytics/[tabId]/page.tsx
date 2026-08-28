/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane package imports
import { WORKSPACE_ANALYTICS_VIEW_PERMISSION_KEY, WORKSPACE_PROJECT_CREATE_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useProject } from "@/hooks/store/use-project";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
import { useAnalyticsTabs } from "@/plane-web/components/analytics/use-analytics-tabs";
import type { Route } from "./+types/page";

function AnalyticsPage({ params }: Route.ComponentProps) {
  const { tabId } = params;

  // plane imports
  const { t } = useTranslation();

  // store hooks
  const { toggleCreateProjectModal } = useCommandPalette();
  const { workspaceProjectIds, loader } = useProject();
  const { currentWorkspace } = useWorkspace();
  const { workspaceInfoBySlug, allowWorkspacePermissionKeys } = useUserPermissions();

  const pageTitle = currentWorkspace?.name
    ? t(`workspace_analytics.page_label`, { workspace: currentWorkspace?.name })
    : undefined;

  // permissions
  const workspaceSlug = params.workspaceSlug;
  const canViewAnalytics = allowWorkspacePermissionKeys([WORKSPACE_ANALYTICS_VIEW_PERMISSION_KEY], workspaceSlug);
  const canPerformEmptyStateActions = allowWorkspacePermissionKeys(
    [WORKSPACE_PROJECT_CREATE_PERMISSION_KEY],
    workspaceSlug
  );
  const workspaceInfo = workspaceInfoBySlug(workspaceSlug);
  const ANALYTICS_TABS = useAnalyticsTabs(workspaceSlug.toString());

  // Tab 切换已上移到 layout 的页头（WorkspaceManagementNavigation），这里只按 URL 段渲染对应内容；
  // 未知 tabId 回落到第一个 tab
  const activeTab = ANALYTICS_TABS.find((tab) => tab.key === tabId) ?? ANALYTICS_TABS[0];

  if (!workspaceInfo) return null;
  if (!canViewAnalytics) {
    return <NotAuthorizedView section="general" className="h-auto" />;
  }
  if (!activeTab) return null;

  return (
    <>
      <PageHead title={pageTitle} />
      {workspaceProjectIds && (
        <>
          {workspaceProjectIds.length > 0 || loader === "init-loader" ? (
            <div className="flex h-full w-full flex-col overflow-hidden">
              <div
                className={
                  activeTab.key === "overdue"
                    ? "flex min-h-0 flex-1 flex-col overflow-hidden"
                    : "h-full overflow-hidden overflow-y-auto px-2"
                }
              >
                <activeTab.content />
              </div>
            </div>
          ) : (
            <EmptyStateDetailed
              assetKey="project"
              title={t("workspace_projects.empty_state.no_projects.title")}
              description={t("workspace_projects.empty_state.no_projects.description")}
              actions={
                canPerformEmptyStateActions
                  ? [
                      {
                        label: "Create a project",
                        onClick: () => {
                          toggleCreateProjectModal(true);
                        },
                      },
                    ]
                  : []
              }
            />
          )}
        </>
      )}
    </>
  );
}

export default observer(AnalyticsPage);
