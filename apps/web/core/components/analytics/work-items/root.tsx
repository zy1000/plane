/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import AnalyticsWrapper from "../analytics-wrapper";
import CustomizedInsights from "./customized-insights";
import { useWorkItemsAnalysis } from "./use-work-items-analysis";
import { WorkItemsFlowOverview } from "./work-items-flow-overview";
import WorkItemsInsightTable from "./workitems-insight-table";

const WorkItems = observer(function WorkItems() {
  const params = useParams();
  const workspaceSlug = params.workspaceSlug.toString();
  const { error, isLoading, rows, summary } = useWorkItemsAnalysis(workspaceSlug);

  return (
    <AnalyticsWrapper i18nTitle="sidebar.work_items">
      <div className="flex flex-col gap-8">
        {error ? (
          <div className="flex items-center gap-2 rounded-md border border-danger-subtle bg-danger-subtle px-4 py-3 text-13 text-danger-primary">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>工作项项目统计加载失败，请稍后重试。</span>
          </div>
        ) : null}
        <WorkItemsFlowOverview isLoading={isLoading} summary={summary} />
        <WorkItemsInsightTable rows={rows} isLoading={isLoading} workspaceSlug={workspaceSlug} />
        <CustomizedInsights />
      </div>
    </AnalyticsWrapper>
  );
});

export { WorkItems };
