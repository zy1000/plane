/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { AlertTriangle } from "lucide-react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import AnalyticsWrapper from "../analytics-wrapper";
import { WorkspaceOverviewAttention, WorkspaceOverviewProjectsTable } from "./workspace-overview-projects";
import { WorkspaceOverviewSummary } from "./workspace-overview-summary";
import { useWorkspaceOverview } from "./use-workspace-overview";

const OverviewRoot = () => {
  const { workspaceSlug } = useParams();
  const workspaceSlugValue = workspaceSlug?.toString();
  const { summary, rows, attentionRows, error, isLoading } = useWorkspaceOverview(workspaceSlugValue);

  return (
    <AnalyticsWrapper i18nTitle="common.overview">
      <div className="flex flex-col gap-6">
        {error ? (
          <div className="flex items-center gap-2 rounded-md border border-danger-subtle bg-danger-subtle px-3 py-2 text-13 text-danger-primary">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>工作区概览数据加载失败，请稍后重试。</span>
          </div>
        ) : null}

        <WorkspaceOverviewSummary summary={summary} isLoading={isLoading} />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="xl:col-span-8">
            <WorkspaceOverviewProjectsTable
              rows={rows}
              isLoading={isLoading}
              workspaceSlug={workspaceSlugValue ?? ""}
            />
          </div>
          <div className="xl:col-span-4">
            <WorkspaceOverviewAttention
              rows={attentionRows}
              isLoading={isLoading}
              workspaceSlug={workspaceSlugValue ?? ""}
            />
          </div>
        </div>
      </div>
    </AnalyticsWrapper>
  );
};

const Overview = observer(OverviewRoot);

export { Overview };
