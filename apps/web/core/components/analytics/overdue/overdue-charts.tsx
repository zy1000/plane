/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { AreaChart } from "@plane/propel/charts/area-chart";
import { BarChart } from "@plane/propel/charts/bar-chart";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import type { TOverdueEntityType, TOverdueRecord, TOverdueTrendPoint } from "@plane/types";
import { Card } from "@plane/ui";
import AnalyticsSectionWrapper from "../analytics-section-wrapper";
import { ChartLoader } from "../loaders";

type Props = {
  records: TOverdueRecord[];
  trend: TOverdueTrendPoint[];
  isLoading?: boolean;
};

const ENTITY_LABEL_MAP: Record<TOverdueEntityType, string> = {
  issue: "工作项",
  cycle: "迭代",
  release: "发布",
  test_plan: "测试计划",
};

const barProps = {
  label: "Count",
  stackId: "bar-one",
  textClassName: "",
  showPercentage: false,
  showTopBorderRadius: () => true,
  showBottomBorderRadius: () => true,
};

const EmptyChartState = () => (
  <EmptyStateCompact
    assetKey="unknown"
    assetClassName="size-16"
    rootClassName="border border-subtle px-5 py-8"
    title="暂无可展示数据"
  />
);

export const OverdueCharts = ({ records, trend, isLoading = false }: Props) => {
  const byTypeData = useMemo(() => {
    const map: Record<TOverdueEntityType, number> = {
      issue: 0,
      cycle: 0,
      release: 0,
      test_plan: 0,
    };

    records.forEach((record) => {
      map[record.entity_type] += 1;
    });

    return (Object.keys(map) as TOverdueEntityType[]).map((key) => ({
      key,
      name: ENTITY_LABEL_MAP[key],
      count: map[key],
    }));
  }, [records]);

  const byProjectData = useMemo(() => {
    const map = new Map<string, number>();
    records.forEach((record) => {
      const projectName = record.project_name || "未命名项目";
      map.set(projectName, (map.get(projectName) ?? 0) + 1);
    });

    return Array.from(map.entries())
      .map(([name, count]) => ({ key: name, name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [records]);

  const byAssigneeData = useMemo(() => {
    const map = new Map<string, number>();

    records.forEach((record) => {
      if (record.entity_type !== "issue") return;

      if (!record.assignees || record.assignees.length === 0) {
        const unassignedKey = "未指定负责人";
        map.set(unassignedKey, (map.get(unassignedKey) ?? 0) + 1);
        return;
      }

      record.assignees.forEach((assignee) => {
        const key = assignee.display_name || "未命名负责人";
        map.set(key, (map.get(key) ?? 0) + 1);
      });
    });

    return Array.from(map.entries())
      .map(([name, count]) => ({ key: name, name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [records]);

  const trendData = useMemo(
    () =>
      trend.map((item) => ({
        key: item.month,
        name: item.month,
        count: item.count,
      })),
    [trend]
  );

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <AnalyticsSectionWrapper title="延期分布（按类型）" className="col-span-1">
        <Card>
          {isLoading ? (
            <ChartLoader />
          ) : byTypeData.length > 0 ? (
            <BarChart
              className="h-[320px] w-full"
              margin={{ top: 20, right: 30, bottom: 5, left: 0 }}
              data={byTypeData}
              bars={[
                {
                  ...barProps,
                  key: "count",
                  fill: () => "#3f76ff",
                },
              ]}
              xAxis={{
                key: "name",
                label: "类型",
              }}
              yAxis={{
                key: "count",
                label: "数量",
              }}
              barSize={24}
            />
          ) : (
            <EmptyChartState />
          )}
        </Card>
      </AnalyticsSectionWrapper>

      <AnalyticsSectionWrapper title="延期分布（按项目）" className="col-span-1">
        <Card>
          {isLoading ? (
            <ChartLoader />
          ) : byProjectData.length > 0 ? (
            <BarChart
              className="h-[320px] w-full"
              margin={{ top: 20, right: 30, bottom: 5, left: 0 }}
              data={byProjectData}
              bars={[
                {
                  ...barProps,
                  key: "count",
                  fill: () => "#f59e0b",
                },
              ]}
              xAxis={{
                key: "name",
                label: "项目",
              }}
              yAxis={{
                key: "count",
                label: "数量",
              }}
              barSize={24}
            />
          ) : (
            <EmptyChartState />
          )}
        </Card>
      </AnalyticsSectionWrapper>

      <AnalyticsSectionWrapper title="延期工作项分布（按负责人）" className="col-span-1">
        <Card>
          {isLoading ? (
            <ChartLoader />
          ) : byAssigneeData.length > 0 ? (
            <BarChart
              className="h-[320px] w-full"
              margin={{ top: 20, right: 30, bottom: 5, left: 0 }}
              data={byAssigneeData}
              bars={[
                {
                  ...barProps,
                  key: "count",
                  fill: () => "#198038",
                },
              ]}
              xAxis={{
                key: "name",
                label: "负责人",
              }}
              yAxis={{
                key: "count",
                label: "数量",
              }}
              barSize={24}
            />
          ) : (
            <EmptyChartState />
          )}
        </Card>
      </AnalyticsSectionWrapper>

      <AnalyticsSectionWrapper title="延期趋势（月）" className="col-span-1">
        <Card>
          {isLoading ? (
            <ChartLoader />
          ) : trendData.length > 0 ? (
            <AreaChart
              className="h-[320px] w-full"
              data={trendData}
              areas={[
                {
                  key: "count",
                  label: "延期数量",
                  fill: "#3f76ff33",
                  fillOpacity: 1,
                  stackId: "bar-one",
                  showDot: false,
                  smoothCurves: true,
                  strokeColor: "#3f76ff",
                  strokeOpacity: 1,
                },
              ]}
              xAxis={{
                key: "name",
                label: "月份",
              }}
              yAxis={{
                key: "count",
                label: "数量",
                offset: -60,
                dx: -24,
              }}
            />
          ) : (
            <EmptyChartState />
          )}
        </Card>
      </AnalyticsSectionWrapper>
    </div>
  );
};
