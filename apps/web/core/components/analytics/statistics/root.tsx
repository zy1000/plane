import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Search } from "lucide-react";
import { CloseIcon, ProjectIcon } from "@plane/propel/icons";
import { AreaChart } from "@plane/propel/charts/area-chart";
import { BarChart } from "@plane/propel/charts/bar-chart";
import { PieChart } from "@plane/propel/charts/pie-chart";
import { STATE_GROUPS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { Card, Loader } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import { useAnalytics } from "@/hooks/store/use-analytics";
import { useProject } from "@/hooks/store/use-project";
import { AnalyticsService } from "@/services/analytics.service";
import AnalyticsSectionWrapper from "../analytics-section-wrapper";
import AnalyticsWrapper from "../analytics-wrapper";

type TDistributionRow = { count: number } & Record<string, any>;

type ProjectStatisticsResponse = {
  project: {
    id: string;
    name: string;
    identifier: string;
    logo_props?: any;
  };
  kpis: {
    total_work_items: number;
    completed_work_items: number;
    in_progress_work_items: number;
    backlog_work_items: number;
    overdue_work_items: number;
    due_today_work_items: number;
    defect_work_items: number;
    active_cycles: number;
    total_cycles: number;
    total_modules: number;
    total_milestones: number;
    total_members: number;
    total_pages: number;
    total_views: number;
    test_repository_count: number;
    test_case_count: number;
    created_last_7d: number;
    completed_last_7d: number;
    created_last_30d: number;
    completed_last_30d: number;
  };
  distributions: {
    state_groups: TDistributionRow[];
    priorities: TDistributionRow[];
    issue_types: TDistributionRow[];
    module_status: TDistributionRow[];
    milestone_state: TDistributionRow[];
    test_case_type: TDistributionRow[];
    test_case_test_type: TDistributionRow[];
    test_case_priority: TDistributionRow[];
  };
  trend_30d: { date: string; created: number; completed: number }[];
};

const analyticsService = new AnalyticsService();

const priorityColors: Record<string, string> = {
  urgent: "#991b1b",
  high: "#ef4444",
  medium: "#f59e0b",
  low: "#16a34a",
  none: "#e5e5e5",
};

const moduleStatusLabel: Record<string, string> = {
  backlog: "Backlog",
  planned: "Planned",
  "in-progress": "In Progress",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

const milestoneStateColor: Record<string, string> = {
  未开始: "#a3a3a3",
  进行中: "#3f76ff",
  延期: "#f59e0b",
  已完成: "#16a34a",
};

const testTypeLabel: Record<string, string> = {
  "0": "手动",
  "1": "自动",
};

const testPriorityLabel: Record<string, string> = {
  "0": "低",
  "1": "中",
  "2": "高",
};

const testCaseTypeLabel: Record<string, string> = {
  "0": "功能测试",
  "1": "性能测试",
  "2": "安全测试",
  "3": "可用性测试",
  "4": "兼容性测试",
  "5": "回归测试",
  "6": "其他",
};

function StatisticsRoot() {
  const { t } = useTranslation();
  const { workspaceSlug } = useParams();

  const { joinedProjectIds, getProjectById } = useProject();
  const { selectedProjects, updateSelectedProjects } = useAnalytics();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!joinedProjectIds || joinedProjectIds.length === 0) return;
    const preferred = selectedProjects?.[0] || joinedProjectIds[0];
    if (!preferred) return;
    setSelectedProjectId(preferred);
    if (selectedProjects?.[0] !== preferred) updateSelectedProjects([preferred]);
  }, [joinedProjectIds, selectedProjects, updateSelectedProjects]);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = (joinedProjectIds ?? [])
      .map((id) => getProjectById(id))
      .filter((p) => !!p)
      .map((p) => p!);

    if (!q) return list;
    return list.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.identifier ?? "").toLowerCase().includes(q)
    );
  }, [getProjectById, joinedProjectIds, searchQuery]);

  const effectiveWorkspaceSlug = workspaceSlug?.toString();
  const { data, isLoading } = useSWR<ProjectStatisticsResponse>(
    selectedProjectId && effectiveWorkspaceSlug ? `project-statistics-${effectiveWorkspaceSlug}-${selectedProjectId}` : null,
    () => analyticsService.getProjectStatistics<ProjectStatisticsResponse>(effectiveWorkspaceSlug!, selectedProjectId!)
  );

  const statePie = useMemo(() => {
    const rows = data?.distributions?.state_groups ?? [];
    return rows
      .map((row) => {
        const key = row["state__group"] as keyof typeof STATE_GROUPS | undefined;
        if (!key) return null;
        const meta = STATE_GROUPS[key];
        if (!meta) return null;
        return {
          id: key,
          key,
          value: row.count ?? 0,
          name: meta.label,
          color: meta.color,
        };
      })
      .filter((x) => x !== null) as Array<{ id: string; key: string; value: number; name: string; color: string }>;
  }, [data]);

  const priorityBarData = useMemo(() => {
    const rows = data?.distributions?.priorities ?? [];
    return rows.map((row) => {
      const key = (row["priority"] ?? "none") as string;
      return {
        key,
        name: key === "none" ? "None" : key[0].toUpperCase() + key.slice(1),
        count: row.count ?? 0,
      };
    });
  }, [data]);

  const issueTypeBarData = useMemo(() => {
    const rows = data?.distributions?.issue_types ?? [];
    return rows
      .map((row) => ({
        key: row["type_id"] ?? "unknown",
        name: row["type__name"] ?? "未指定类型",
        count: row.count ?? 0,
      }))
      .slice(0, 10);
  }, [data]);

  const trendData = useMemo(() => {
    const rows = data?.trend_30d ?? [];
    return rows.map((row) => ({
      key: row.date,
      name: renderFormattedDate(row.date) ?? row.date,
      created: row.created,
      completed: row.completed,
    }));
  }, [data]);

  const moduleStatusData = useMemo(() => {
    const rows = data?.distributions?.module_status ?? [];
    return rows.map((row) => {
      const key = (row["status"] ?? "planned") as string;
      return {
        key,
        name: moduleStatusLabel[key] ?? key,
        count: row.count ?? 0,
      };
    });
  }, [data]);

  const milestoneStateData = useMemo(() => {
    const rows = data?.distributions?.milestone_state ?? [];
    return rows.map((row) => {
      const key = (row["state"] ?? "未开始") as string;
      return {
        key,
        name: key,
        count: row.count ?? 0,
      };
    });
  }, [data]);

  const testTypeData = useMemo(() => {
    const rows = data?.distributions?.test_case_test_type ?? [];
    return rows.map((row) => {
      const key = String(row["test_type"] ?? "1");
      return {
        key,
        name: testTypeLabel[key] ?? key,
        count: row.count ?? 0,
      };
    });
  }, [data]);

  const testCaseTypeData = useMemo(() => {
    const rows = data?.distributions?.test_case_type ?? [];
    return rows.map((row) => {
      const key = String(row["type"] ?? "0");
      return {
        key,
        name: testCaseTypeLabel[key] ?? key,
        count: row.count ?? 0,
      };
    });
  }, [data]);

  const testCasePriorityData = useMemo(() => {
    const rows = data?.distributions?.test_case_priority ?? [];
    return rows.map((row) => {
      const key = String(row["priority"] ?? "1");
      return {
        key,
        name: testPriorityLabel[key] ?? key,
        count: row.count ?? 0,
      };
    });
  }, [data]);

  const kpis = data?.kpis;
  const completionRate =
    kpis && kpis.total_work_items > 0 ? Math.round((kpis.completed_work_items / kpis.total_work_items) * 100) : 0;

  return (
    <AnalyticsWrapper i18nTitle="统计" className="h-full">
      <div className="flex h-full gap-4 overflow-hidden">
        <div className="w-[320px] flex-shrink-0 overflow-hidden">
          <Card className="h-full overflow-hidden">
            <div className="p-4 border-b border-custom-border-200">
              <div className="text-sm font-medium text-custom-text-200">项目</div>
              <div className="mt-3 flex items-center gap-1.5 rounded border border-custom-border-200 bg-custom-background-90 px-2 py-1.5">
                <Search className="h-3.5 w-3.5 text-custom-text-400" />
                <input
                  className="w-full border-none bg-transparent text-sm text-custom-text-100 placeholder:text-custom-text-400 focus:outline-none"
                  placeholder={t("common.search.label")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery.trim() !== "" && (
                  <button
                    type="button"
                    className="grid place-items-center"
                    onClick={() => setSearchQuery("")}
                  >
                    <CloseIcon className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="h-full overflow-y-auto vertical-scrollbar scrollbar-sm p-2">
              {filteredProjects.map((project) => {
                const isActive = project.id === selectedProjectId;
                return (
                  <button
                    key={project.id}
                    type="button"
                    className={cn(
                      "w-full flex items-center gap-2 rounded-md px-2.5 py-2 text-left hover:bg-custom-background-90 transition-colors",
                      {
                        "bg-custom-primary-100/10 border border-custom-primary-200": isActive,
                      }
                    )}
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      updateSelectedProjects([project.id]);
                    }}
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded bg-custom-background-90 overflow-hidden">
                      {project.logo_props ? <Logo logo={project.logo_props} size={18} /> : <ProjectIcon className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-custom-text-200">{project.name}</div>
                      <div className="truncate text-xs text-custom-text-400">{project.identifier}</div>
                    </div>
                  </button>
                );
              })}
              {filteredProjects.length === 0 && (
                <div className="px-2 py-3 text-sm text-custom-text-400">没有匹配的项目</div>
              )}
            </div>
          </Card>
        </div>

        <div className="flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm pr-2">
          {!selectedProjectId ? (
            <div className="grid place-items-center h-full text-custom-text-300">请选择一个项目查看统计</div>
          ) : isLoading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, idx) => (
                <Loader
                  key={idx}
                  className="min-h-[92px] gap-2 border border-custom-border-200 rounded-lg bg-custom-background-100 p-4"
                >
                  <Loader.Item width="60%" height="12px" />
                  <Loader.Item width="40%" height="22px" />
                  <Loader.Item width="80%" height="10px" />
                </Loader>
              ))}
            </div>
          ) : data ? (
            <div className="flex flex-col gap-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xl font-semibold text-custom-text-200 truncate">{data.project.name}</div>
                  <div className="text-sm text-custom-text-400 truncate">{data.project.identifier}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="p-4 border border-custom-border-200">
                  <div className="text-xs text-custom-text-400">工作项总数</div>
                  <div className="mt-1 text-2xl font-semibold text-custom-text-200">{kpis?.total_work_items ?? 0}</div>
                  <div className="mt-1 text-xs text-custom-text-400">近 7 天新增 {kpis?.created_last_7d ?? 0}</div>
                </Card>
                <Card className="p-4 border border-custom-border-200">
                  <div className="text-xs text-custom-text-400">完成率</div>
                  <div className="mt-1 text-2xl font-semibold text-custom-text-200">{completionRate}%</div>
                  <div className="mt-1 text-xs text-custom-text-400">近 7 天完成 {kpis?.completed_last_7d ?? 0}</div>
                </Card>
                <Card className="p-4 border border-custom-border-200">
                  <div className="text-xs text-custom-text-400">逾期工作项</div>
                  <div className="mt-1 text-2xl font-semibold text-custom-text-200">{kpis?.overdue_work_items ?? 0}</div>
                  <div className="mt-1 text-xs text-custom-text-400">今日到期 {kpis?.due_today_work_items ?? 0}</div>
                </Card>
                <Card className="p-4 border border-custom-border-200">
                  <div className="text-xs text-custom-text-400">缺陷工作项</div>
                  <div className="mt-1 text-2xl font-semibold text-custom-text-200">{kpis?.defect_work_items ?? 0}</div>
                  <div className="mt-1 text-xs text-custom-text-400">进行中 {kpis?.in_progress_work_items ?? 0}</div>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Card className="p-4 border border-custom-border-200">
                  <div className="text-xs text-custom-text-400">成员</div>
                  <div className="mt-1 text-2xl font-semibold text-custom-text-200">{kpis?.total_members ?? 0}</div>
                </Card>
                <Card className="p-4 border border-custom-border-200">
                  <div className="text-xs text-custom-text-400">迭代（进行中/总数）</div>
                  <div className="mt-1 text-2xl font-semibold text-custom-text-200">
                    {kpis?.active_cycles ?? 0}/{kpis?.total_cycles ?? 0}
                  </div>
                </Card>
                <Card className="p-4 border border-custom-border-200">
                  <div className="text-xs text-custom-text-400">模块</div>
                  <div className="mt-1 text-2xl font-semibold text-custom-text-200">{kpis?.total_modules ?? 0}</div>
                </Card>
                <Card className="p-4 border border-custom-border-200">
                  <div className="text-xs text-custom-text-400">用例（用例库/用例）</div>
                  <div className="mt-1 text-2xl font-semibold text-custom-text-200">
                    {kpis?.test_repository_count ?? 0}/{kpis?.test_case_count ?? 0}
                  </div>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <AnalyticsSectionWrapper title="近 30 天趋势" className="col-span-1">
                  <Card>
                    <AreaChart
                      className="h-[320px] w-full"
                      data={trendData}
                      areas={[
                        {
                          key: "completed",
                          label: "Completed",
                          fill: "#19803833",
                          fillOpacity: 1,
                          stackId: "bar-one",
                          showDot: false,
                          smoothCurves: true,
                          strokeColor: "#198038",
                          strokeOpacity: 1,
                        },
                        {
                          key: "created",
                          label: "Created",
                          fill: "#1192E833",
                          fillOpacity: 1,
                          stackId: "bar-one",
                          showDot: false,
                          smoothCurves: true,
                          strokeColor: "#1192E8",
                          strokeOpacity: 1,
                        },
                      ]}
                      xAxis={{
                        key: "name",
                        label: "日期",
                      }}
                      yAxis={{
                        key: "count",
                        label: "数量",
                        offset: -60,
                        dx: -24,
                      }}
                      legend={{
                        align: "left",
                        verticalAlign: "bottom",
                        layout: "horizontal",
                        wrapperStyles: {
                          justifyContent: "start",
                          alignContent: "start",
                          paddingLeft: "40px",
                          paddingTop: "10px",
                        },
                      }}
                    />
                  </Card>
                </AnalyticsSectionWrapper>

                <AnalyticsSectionWrapper title="状态组分布" className="col-span-1">
                  <Card className="h-full">
                    <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2 w-full h-[320px]">
                      <PieChart
                        className="size-full"
                        dataKey="value"
                        margin={{ top: 0, right: -10, bottom: 12, left: -10 }}
                        data={statePie}
                        cells={statePie.map((s) => ({ key: s.key, fill: s.color }))}
                        showTooltip
                        tooltipLabel="Count"
                        paddingAngle={5}
                        cornerRadius={4}
                        innerRadius="50%"
                        showLabel={false}
                      />
                      <div className="flex items-center">
                        <div className="w-full space-y-4">
                          {statePie.map((s) => (
                            <div key={s.key} className="flex items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-1.5">
                                <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                                <div className="whitespace-nowrap">{s.name}</div>
                              </div>
                              <div>{s.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Card>
                </AnalyticsSectionWrapper>

                <AnalyticsSectionWrapper title="优先级分布" className="col-span-1">
                  <Card>
                    <BarChart
                      className="w-full h-[320px]"
                      margin={{ top: 20, right: 30, bottom: 5, left: 0 }}
                      data={priorityBarData}
                      bars={[
                        {
                          key: "count",
                          label: "Count",
                          stackId: "bar-one",
                          fill: (payload: any) => priorityColors[payload.key as keyof typeof priorityColors] ?? "#e5e5e5",
                          textClassName: "",
                          showPercentage: false,
                          showTopBorderRadius: () => true,
                          showBottomBorderRadius: () => true,
                        },
                      ]}
                      xAxis={{
                        key: "name",
                        label: "优先级",
                      }}
                      yAxis={{
                        key: "count",
                        label: "",
                      }}
                      barSize={20}
                    />
                  </Card>
                </AnalyticsSectionWrapper>

                <AnalyticsSectionWrapper title="工作项类型（Top 10）" className="col-span-1">
                  <Card>
                    <BarChart
                      className="w-full h-[320px]"
                      margin={{ top: 20, right: 30, bottom: 5, left: 0 }}
                      data={issueTypeBarData}
                      bars={[
                        {
                          key: "count",
                          label: "Count",
                          stackId: "bar-one",
                          fill: () => "#3f76ff",
                          textClassName: "",
                          showPercentage: false,
                          showTopBorderRadius: () => true,
                          showBottomBorderRadius: () => true,
                        },
                      ]}
                      xAxis={{
                        key: "name",
                        label: "类型",
                      }}
                      yAxis={{
                        key: "count",
                        label: "",
                      }}
                      barSize={20}
                    />
                  </Card>
                </AnalyticsSectionWrapper>

                <AnalyticsSectionWrapper title="模块状态" className="col-span-1">
                  <Card>
                    <BarChart
                      className="w-full h-[320px]"
                      margin={{ top: 20, right: 30, bottom: 5, left: 0 }}
                      data={moduleStatusData}
                      bars={[
                        {
                          key: "count",
                          label: "Count",
                          stackId: "bar-one",
                          fill: () => "#f59e0b",
                          textClassName: "",
                          showPercentage: false,
                          showTopBorderRadius: () => true,
                          showBottomBorderRadius: () => true,
                        },
                      ]}
                      xAxis={{
                        key: "name",
                        label: "状态",
                      }}
                      yAxis={{
                        key: "count",
                        label: "",
                      }}
                      barSize={20}
                    />
                  </Card>
                </AnalyticsSectionWrapper>

                <AnalyticsSectionWrapper title="里程碑状态" className="col-span-1">
                  <Card>
                    <BarChart
                      className="w-full h-[320px]"
                      margin={{ top: 20, right: 30, bottom: 5, left: 0 }}
                      data={milestoneStateData}
                      bars={[
                        {
                          key: "count",
                          label: "Count",
                          stackId: "bar-one",
                          fill: (payload: any) => milestoneStateColor[payload.key as keyof typeof milestoneStateColor] ?? "#a3a3a3",
                          textClassName: "",
                          showPercentage: false,
                          showTopBorderRadius: () => true,
                          showBottomBorderRadius: () => true,
                        },
                      ]}
                      xAxis={{
                        key: "name",
                        label: "状态",
                      }}
                      yAxis={{
                        key: "count",
                        label: "",
                      }}
                      barSize={20}
                    />
                  </Card>
                </AnalyticsSectionWrapper>

                <AnalyticsSectionWrapper title="用例测试类型" className="col-span-1">
                  <Card>
                    <BarChart
                      className="w-full h-[320px]"
                      margin={{ top: 20, right: 30, bottom: 5, left: 0 }}
                      data={testTypeData}
                      bars={[
                        {
                          key: "count",
                          label: "Count",
                          stackId: "bar-one",
                          fill: () => "#198038",
                          textClassName: "",
                          showPercentage: false,
                          showTopBorderRadius: () => true,
                          showBottomBorderRadius: () => true,
                        },
                      ]}
                      xAxis={{
                        key: "name",
                        label: "类型",
                      }}
                      yAxis={{
                        key: "count",
                        label: "",
                      }}
                      barSize={20}
                    />
                  </Card>
                </AnalyticsSectionWrapper>

                <AnalyticsSectionWrapper title="用例类型" className="col-span-1">
                  <Card>
                    <BarChart
                      className="w-full h-[320px]"
                      margin={{ top: 20, right: 30, bottom: 5, left: 0 }}
                      data={testCaseTypeData}
                      bars={[
                        {
                          key: "count",
                          label: "Count",
                          stackId: "bar-one",
                          fill: () => "#3f76ff",
                          textClassName: "",
                          showPercentage: false,
                          showTopBorderRadius: () => true,
                          showBottomBorderRadius: () => true,
                        },
                      ]}
                      xAxis={{
                        key: "name",
                        label: "类型",
                      }}
                      yAxis={{
                        key: "count",
                        label: "",
                      }}
                      barSize={20}
                    />
                  </Card>
                </AnalyticsSectionWrapper>

                <AnalyticsSectionWrapper title="用例优先级" className="col-span-1">
                  <Card>
                    <BarChart
                      className="w-full h-[320px]"
                      margin={{ top: 20, right: 30, bottom: 5, left: 0 }}
                      data={testCasePriorityData}
                      bars={[
                        {
                          key: "count",
                          label: "Count",
                          stackId: "bar-one",
                          fill: () => "#ef4444",
                          textClassName: "",
                          showPercentage: false,
                          showTopBorderRadius: () => true,
                          showBottomBorderRadius: () => true,
                        },
                      ]}
                      xAxis={{
                        key: "name",
                        label: "优先级",
                      }}
                      yAxis={{
                        key: "count",
                        label: "",
                      }}
                      barSize={20}
                    />
                  </Card>
                </AnalyticsSectionWrapper>
              </div>
            </div>
          ) : (
            <div className="grid place-items-center h-full text-custom-text-300">暂无统计数据</div>
          )}
        </div>
      </div>
    </AnalyticsWrapper>
  );
}

export const Statistics = observer(StatisticsRoot);
