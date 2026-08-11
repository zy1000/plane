/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import { observer } from "mobx-react";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import { cn } from "@plane/utils";
import emptyModule from "@/app/assets/empty-state/module.svg?url";
import { EmptyState } from "@/components/common/empty-state";
import { ScopeSubTabs } from "@/components/common/scope-sub-tabs";
import {
  getReleaseScopeSubTabStorageKey,
  SCOPE_SUB_TAB_ICONS,
  useScopeSubTab,
} from "@/components/common/use-scope-sub-tab";
import { PageHead } from "@/components/core/page-title";
import { ReleaseLayoutRoot } from "@/components/issues/issue-layouts/roots/release-layout-root";
import { ReleaseAnalyticsSidebar } from "@/components/releases/release-analytics-sidebar";
import { ReleaseScopeRequirementsPane } from "@/components/releases/release-scope-requirements-pane";
import { useProject } from "@/hooks/store/use-project";
import { useRelease } from "@/hooks/store/use-release";
import { useAppRouter } from "@/hooks/use-app-router";
import useLocalStorage from "@/hooks/use-local-storage";
import type { Route } from "./+types/page";

function ReleaseIssuesPage({ params }: Route.ComponentProps) {
  const router = useAppRouter();
  const { workspaceSlug, projectId, releaseId } = params;
  const { t } = useTranslation();
  const { fetchReleaseDetails, getReleaseById } = useRelease();
  const { getProjectById } = useProject();
  const { setValue, storedValue } = useLocalStorage("release_sidebar_collapsed", "false");
  const isSidebarCollapsed = storedValue ? storedValue === "true" : false;
  // 二级切换：工作项 | 需求。header 右侧那排工具条也读这个 key，切到需求时整排隐藏
  const { activeSubTab, setSubTab } = useScopeSubTab(getReleaseScopeSubTabStorageKey(releaseId));

  const { error } = useSWR(`CURRENT_RELEASE_DETAILS_${releaseId}`, () =>
    fetchReleaseDetails(workspaceSlug, projectId, releaseId)
  );

  const projectRelease = getReleaseById(releaseId);
  const project = getProjectById(projectId);
  const pageTitle = project?.name && projectRelease?.name ? `${project?.name} - ${projectRelease?.name}` : undefined;

  const toggleSidebar = () => {
    setValue(`${!isSidebarCollapsed}`);
  };

  return (
    <>
      <PageHead title={pageTitle} />
      {error ? (
        <EmptyState
          image={emptyModule}
          title="Release does not exist"
          description="The release you are looking for does not exist or has been deleted."
          primaryButton={{
            text: "View other releases",
            onClick: () => router.push(`/${workspaceSlug}/projects/${projectId}/releases`),
          }}
        />
      ) : (
        // relative 是必需的：侧栏 absolute right-0，没有它包含块会变成整个内容区，
        // 侧栏会盖到二级切换条上面去
        <div className="relative flex h-full w-full">
          {/*
            列方向 flex：切换条 flex-shrink-0，内容区 min-h-0 flex-1。
            ReleaseLayoutRoot 内部是 h-full，要求父容器高度确定 —— 看板更是垂直不滚
            （overflow-y-hidden），父高度一旦变成 auto 就会把卡片裁掉且滚不到。
          */}
          <div className="flex h-full w-full flex-col overflow-hidden">
            <ScopeSubTabs
              value={activeSubTab}
              onChange={setSubTab}
              tabs={[
                {
                  key: "work-items",
                  label: t("project_requirements.scope_tabs.work_items"),
                  icon: SCOPE_SUB_TAB_ICONS["work-items"],
                },
                {
                  key: "requirements",
                  label: t("project_requirements.scope_tabs.requirements"),
                  icon: SCOPE_SUB_TAB_ICONS.requirements,
                },
              ]}
            />
            <div className="min-h-0 flex-1">
              {activeSubTab === "requirements" ? (
                <ReleaseScopeRequirementsPane
                  workspaceSlug={workspaceSlug}
                  projectId={projectId}
                  releaseId={releaseId}
                  isArchived={Boolean(projectRelease?.archived_at)}
                />
              ) : (
                <ReleaseLayoutRoot />
              )}
            </div>
          </div>
          {!isSidebarCollapsed && (
            <div
              className={cn(
                "vertical-scrollbar absolute right-0 z-13 flex scrollbar-sm h-full w-[24rem] flex-shrink-0 flex-col gap-3.5 overflow-y-auto border-l border-subtle bg-surface-1 px-6 shadow-raised-200 duration-300"
              )}
            >
              <ReleaseAnalyticsSidebar releaseId={releaseId} handleClose={toggleSidebar} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default observer(ReleaseIssuesPage);
