import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import dayjs from "dayjs";
import { Search } from "lucide-react";
import { CloseIcon, ProjectIcon } from "@plane/propel/icons";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { Card, Loader } from "@plane/ui";
import { cn, renderFormattedDate } from "@plane/utils";
import { Button, Modal, Segmented, Select, message } from "antd";
import type { SegmentedValue } from "antd/es/segmented";
import { useAnalytics } from "@/hooks/store/use-analytics";
import { useProject } from "@/hooks/store/use-project";
import { AnalyticsService } from "@/services/analytics.service";
import AnalyticsWrapper from "../analytics-wrapper";
import { EChart } from "./echart";
import { STATUS_COLORS, VI_COLORS } from "./palette";
import { exportDashboardAsPdf, exportDashboardAsPng } from "./export";

type DashboardReleaseNode = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  state: string;
  is_urgent: boolean;
  completion_rate: number;
  remaining_work_items: number;
  total_work_items: number;
};

type ProjectStatisticsDashboardResponse = {
  generated_at: string;
  project: { id: string; name: string; identifier: string; logo_props?: any };
  project_progress: {
    start_date: string | null;
    end_date: string | null;
    completion_rate: number;
    description: string;
    release: {
      id: string | null;
      name: string | null;
      start_date: string | null;
      end_date: string | null;
      completion_rate: number;
      total_work_items: number;
      remaining_work_items: number;
      is_urgent: boolean;
    };
    releases: DashboardReleaseNode[];
  };
  test_progress: {
    total_cases: number;
    success: number;
    fail: number;
    not_executed: number;
    failed_cases: Array<{
      id: string;
      code: string;
      name: string;
      result: string;
      reason: string | null;
      executed_at: string | null;
      executor: string | null;
      plan_id: string | null;
      plan_name: string | null;
    }>;
  };
  defect_stats: {
    range: { start_date: string | null; end_date: string | null };
    total: number;
    by_status: Array<{ status: string; count: number }>;
    by_severity: Array<{ priority: string; count: number }>;
  };
  case_review: {
    pass: number;
    fail: number;
    pending: number;
    pass_rate: number;
    trend_30d: Array<{ date: string; pass: number; fail: number; pass_rate: number }>;
    owner: null | {
      review_id: string;
      review_name: string;
      state: string;
      assignees: Array<{ id: string; display_name: string; avatar_url: string | null }>;
    };
  };
  cycles: Array<{ id: string; name: string; start_date: string | null; end_date: string | null }>;
  burndown: null | {
    cycle: { id: string; name: string; start_date: string | null; end_date: string | null; total_issues: number | null };
    series: Record<string, number | null>;
  };
};

const analyticsService = new AnalyticsService();

function computeIdealBurndown(dates: string[], startValue: number) {
  if (dates.length === 0) return [];
  const lastIndex = dates.length - 1;
  return dates.map((_, idx) => {
    const ratio = lastIndex === 0 ? 1 : idx / lastIndex;
    return Math.max(0, startValue * (1 - ratio));
  });
}

function estimateCompletionDate(dates: string[], actual: Array<number | null>) {
  const points: Array<{ x: number; y: number }> = [];
  for (let i = actual.length - 1; i >= 0 && points.length < 7; i--) {
    const v = actual[i];
    if (typeof v === "number") points.unshift({ x: i, y: v });
  }
  if (points.length < 2) return null;

  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  if (slope >= 0) return null;

  const xAtZero = -intercept / slope;
  const lastKnownIndex = points[points.length - 1]!.x;
  const remainingSteps = Math.ceil(xAtZero - lastKnownIndex);
  if (remainingSteps <= 0) return null;
  const lastDate = dayjs(dates[lastKnownIndex]);
  return lastDate.add(remainingSteps, "day").format("YYYY-MM-DD");
}

function Dashboard() {
  const { workspaceSlug } = useParams();
  const effectiveWorkspaceSlug = workspaceSlug?.toString();

  const { joinedProjectIds, getProjectById } = useProject();
  const { selectedProjects, updateSelectedProjects } = useAnalytics();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [defectRangeDays, setDefectRangeDays] = useState<7 | 30 | 90>(30);
  const [selectedCycleId, setSelectedCycleId] = useState<string | undefined>(undefined);
  const [selectedDefectStatus, setSelectedDefectStatus] = useState<string | null>(null);
  const [failedCasesOpen, setFailedCasesOpen] = useState(false);

  const dashboardRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState(false);

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
    return list.filter((p) => p.name.toLowerCase().includes(q) || (p.identifier ?? "").toLowerCase().includes(q));
  }, [getProjectById, joinedProjectIds, searchQuery]);

  const defectEndDate = dayjs().format("YYYY-MM-DD");
  const defectStartDate = dayjs().subtract(defectRangeDays - 1, "day").format("YYYY-MM-DD");

  const swrKey =
    selectedProjectId && effectiveWorkspaceSlug
      ? `project-dashboard-${effectiveWorkspaceSlug}-${selectedProjectId}-${defectStartDate}-${defectEndDate}-${selectedCycleId ?? "auto"}`
      : null;

  const {
    data,
    isLoading,
    mutate: refresh,
  } = useSWR<ProjectStatisticsDashboardResponse>(
    swrKey,
    () =>
      analyticsService.getProjectStatistics<ProjectStatisticsDashboardResponse>(effectiveWorkspaceSlug!, selectedProjectId!, {
        start_date: defectStartDate,
        end_date: defectEndDate,
        cycle_id: selectedCycleId,
      }),
    { refreshInterval: 30_000, revalidateOnFocus: true }
  );

  useEffect(() => {
    if (!data?.burndown?.cycle?.id) return;
    if (selectedCycleId) return;
    setSelectedCycleId(data.burndown.cycle.id);
  }, [data?.burndown?.cycle?.id, selectedCycleId]);

  const lastUpdatedText = useMemo(() => {
    if (!data?.generated_at) return "-";
    return dayjs(data.generated_at).format("YYYY-MM-DD HH:mm:ss");
  }, [data?.generated_at]);

  const progressPercent = useMemo(() => {
    const v = data?.project_progress?.completion_rate;
    return typeof v === "number" ? Math.max(0, Math.min(100, v)) : 0;
  }, [data?.project_progress?.completion_rate]);

  const testProgressOption = useMemo(() => {
    const tp = data?.test_progress;
    const items = [
      { name: "成功", value: tp?.success ?? 0, color: VI_COLORS.success },
      { name: "失败", value: tp?.fail ?? 0, color: VI_COLORS.danger },
      { name: "未执行", value: tp?.not_executed ?? 0, color: VI_COLORS.muted },
    ];
    return {
      tooltip: { trigger: "item" },
      series: [
        {
          type: "pie",
          radius: ["58%", "78%"],
          avoidLabelOverlap: true,
          label: { show: false },
          labelLine: { show: false },
          itemStyle: { borderRadius: 6, borderColor: "transparent", borderWidth: 2 },
          data: items.map((x) => ({ name: x.name, value: x.value, itemStyle: { color: x.color } })),
        },
      ],
    };
  }, [data?.test_progress]);

  const defectStatusOption = useMemo(() => {
    const rows = data?.defect_stats?.by_status ?? [];
    const labelMap: Record<string, string> = {
      backlog: "待办",
      unstarted: "未开始",
      started: "进行中",
      completed: "已完成",
      cancelled: "已取消",
    };
    const chartData = rows
      .filter((r) => r.count > 0)
      .map((r) => ({
        name: labelMap[r.status] ?? r.status,
        value: r.count,
        statusKey: r.status,
        itemStyle: {
          color: (STATUS_COLORS as any)[r.status] ?? VI_COLORS.primary,
          opacity: selectedDefectStatus && selectedDefectStatus !== r.status ? 0.25 : 1,
        },
      }));

    return {
      tooltip: { trigger: "item" },
      legend: { bottom: 0, left: "center" },
      series: [
        {
          type: "pie",
          radius: ["48%", "72%"],
          label: { show: false },
          labelLine: { show: false },
          data: chartData,
        },
      ],
    };
  }, [data?.defect_stats?.by_status, selectedDefectStatus]);

  const defectSeverityOption = useMemo(() => {
    const rows = data?.defect_stats?.by_severity ?? [];
    const order = ["urgent", "high", "medium", "low", "none"];
    const counts = new Map(rows.map((r) => [r.priority ?? "none", r.count ?? 0]));
    const x = order;
    const y = x.map((k) => counts.get(k) ?? 0);
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 24, right: 16, top: 16, bottom: 24, containLabel: true },
      xAxis: { type: "category", data: x },
      yAxis: { type: "value" },
      series: [
        {
          type: "bar",
          data: y,
          barWidth: 18,
          itemStyle: { color: VI_COLORS.primary, borderRadius: [6, 6, 0, 0] },
        },
      ],
    };
  }, [data?.defect_stats?.by_severity]);

  const reviewCountsOption = useMemo(() => {
    const r = data?.case_review;
    const pass = r?.pass ?? 0;
    const fail = r?.fail ?? 0;
    const pending = r?.pending ?? 0;
    return {
      tooltip: { trigger: "axis" },
      grid: { left: 24, right: 16, top: 16, bottom: 24, containLabel: true },
      xAxis: { type: "category", data: ["通过", "不通过", "未评审"] },
      yAxis: { type: "value" },
      series: [
        {
          type: "bar",
          data: [
            { value: pass, itemStyle: { color: VI_COLORS.success, borderRadius: [6, 6, 0, 0] } },
            { value: fail, itemStyle: { color: VI_COLORS.danger, borderRadius: [6, 6, 0, 0] } },
            { value: pending, itemStyle: { color: VI_COLORS.muted, borderRadius: [6, 6, 0, 0] } },
          ],
          barWidth: 22,
        },
      ],
    };
  }, [data?.case_review]);

  const reviewTrendOption = useMemo(() => {
    const rows = data?.case_review?.trend_30d ?? [];
    const x = rows.map((r) => renderFormattedDate(r.date) ?? r.date);
    const y = rows.map((r) => r.pass_rate ?? 0);
    return {
      tooltip: { trigger: "axis", valueFormatter: (v: any) => `${v}%` },
      grid: { left: 24, right: 16, top: 16, bottom: 24, containLabel: true },
      xAxis: { type: "category", data: x, boundaryGap: false },
      yAxis: { type: "value", min: 0, max: 100 },
      series: [
        {
          type: "line",
          data: y,
          smooth: true,
          showSymbol: false,
          lineStyle: { color: VI_COLORS.primary, width: 2 },
          areaStyle: { color: "rgba(63,118,255,0.15)" },
        },
      ],
    };
  }, [data?.case_review?.trend_30d]);

  const burndownOption = useMemo(() => {
    const bd = data?.burndown;
    const seriesMap = bd?.series ?? {};
    const dates = Object.keys(seriesMap).sort();
    const actual = dates.map((d) => (typeof seriesMap[d] === "number" ? (seriesMap[d] as number) : null));
    const startValue = bd?.cycle?.total_issues ?? actual.find((v) => typeof v === "number") ?? 0;
    const ideal = computeIdealBurndown(dates, startValue as number);
    return {
      tooltip: { trigger: "axis" },
      legend: { top: 0, left: "left" },
      grid: { left: 24, right: 16, top: 28, bottom: 24, containLabel: true },
      xAxis: { type: "category", data: dates.map((d) => renderFormattedDate(d) ?? d) },
      yAxis: { type: "value", min: 0 },
      series: [
        { name: "理想曲线", type: "line", data: ideal, smooth: true, showSymbol: false, lineStyle: { color: VI_COLORS.muted, type: "dashed" } },
        { name: "实际曲线", type: "line", data: actual, smooth: true, showSymbol: false, connectNulls: false, lineStyle: { color: VI_COLORS.primary, width: 2 } },
      ],
    };
  }, [data?.burndown]);

  const burndownSummary = useMemo(() => {
    const bd = data?.burndown;
    if (!bd) return { remaining: 0, eta: null as string | null };
    const seriesMap = bd.series ?? {};
    const dates = Object.keys(seriesMap).sort();
    const actual = dates.map((d) => (typeof seriesMap[d] === "number" ? (seriesMap[d] as number) : null));
    const remaining = actual.filter((v) => typeof v === "number").slice(-1)[0] ?? 0;
    const eta = estimateCompletionDate(dates, actual);
    return { remaining, eta };
  }, [data?.burndown]);

  const handleExport = async (type: "png" | "pdf") => {
    if (!dashboardRef.current) return;
    setExporting(true);
    try {
      if (type === "png") await exportDashboardAsPng(dashboardRef.current, `${data?.project?.identifier ?? "dashboard"}-analytics`);
      else await exportDashboardAsPdf(dashboardRef.current, `${data?.project?.identifier ?? "dashboard"}-analytics`);
    } catch (e: any) {
      message.error(e?.message ?? "导出失败");
    } finally {
      setExporting(false);
    }
  };

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
                  placeholder="搜索项目"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery.trim() !== "" && (
                  <button type="button" className="grid place-items-center" onClick={() => setSearchQuery("")}>
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
                      { "bg-custom-primary-100/10 border border-custom-primary-200": isActive }
                    )}
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      updateSelectedProjects([project.id]);
                      setSelectedCycleId(undefined);
                      setSelectedDefectStatus(null);
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
              {filteredProjects.length === 0 && <div className="px-2 py-3 text-sm text-custom-text-400">没有匹配的项目</div>}
            </div>
          </Card>
        </div>

        <div className="flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm pr-2">
          {!selectedProjectId ? (
            <div className="grid place-items-center h-full text-custom-text-300">请选择一个项目查看仪表板</div>
          ) : isLoading ? (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Loader key={idx} className="min-h-[160px] gap-2 border border-custom-border-200 rounded-lg bg-custom-background-100 p-4 xl:col-span-6">
                  <Loader.Item width="50%" height="12px" />
                  <Loader.Item width="80%" height="10px" />
                  <Loader.Item width="100%" height="84px" />
                </Loader>
              ))}
            </div>
          ) : data ? (
            <div className="flex flex-col gap-4" ref={dashboardRef}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xl font-semibold text-custom-text-200 truncate">项目数据可视化仪表板</div>
                  <div className="mt-1 text-sm text-custom-text-400 truncate">
                    {data.project.name} · {data.project.identifier} · 最后更新时间 {lastUpdatedText}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={() => refresh()} disabled={exporting}>
                    刷新
                  </Button>
                  <Button onClick={() => handleExport("png")} loading={exporting}>
                    导出 PNG
                  </Button>
                  <Button onClick={() => handleExport("pdf")} loading={exporting}>
                    导出 PDF
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                <Card className="p-4 border border-custom-border-200 xl:col-span-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-custom-text-200">项目进度</div>
                    <div className="text-xs text-custom-text-400">
                      {data.project_progress.release?.name ? `发布：${data.project_progress.release.name} · ` : ""}
                      {data.project_progress.start_date ?? "-"} ～ {data.project_progress.end_date ?? "-"}
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="flex items-end justify-between">
                      <div className="text-2xl font-semibold text-custom-text-200">{progressPercent}%</div>
                      <div className={cn("text-xs", data.project_progress.release?.is_urgent ? "text-red-600" : "text-custom-text-400")}>
                        {data.project_progress.release?.total_work_items ? `剩余 ${data.project_progress.release.remaining_work_items}` : "完成率"}
                        {data.project_progress.release?.is_urgent ? " · 3天内截止预警" : ""}
                      </div>
                    </div>
                    <div className="mt-2 h-2 w-full rounded bg-custom-background-90 overflow-hidden">
                      <div className="h-full rounded bg-custom-primary-100" style={{ width: `${progressPercent}%` }} />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div>
                      <div className="text-xs text-custom-text-400">发布节点（3天内自动预警）</div>
                      <div className="mt-2 space-y-2">
                        {(data.project_progress.releases ?? []).slice(0, 6).map((r) => (
                          <div
                            key={r.id}
                            className={cn(
                              "rounded border px-2 py-1.5 text-xs",
                              r.is_urgent ? "border-red-300 bg-red-50/70 text-red-700" : "border-custom-border-200 bg-custom-background-90"
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0 truncate">{r.name}</div>
                              <div className="shrink-0">{r.end_date ?? "-"}</div>
                            </div>
                            <div className="mt-1 flex items-center justify-between gap-2">
                              <div className="text-[11px] opacity-80">{r.state}</div>
                              <div className="text-[11px] opacity-80">{Math.round(r.completion_rate)}%</div>
                            </div>
                            <div className="mt-1 h-1.5 w-full rounded bg-white/60 overflow-hidden">
                              <div className="h-full rounded" style={{ width: `${Math.max(0, Math.min(100, r.completion_rate))}%`, background: VI_COLORS.primary }} />
                            </div>
                          </div>
                        ))}
                        {(data.project_progress.releases ?? []).length === 0 && (
                          <div className="text-xs text-custom-text-400">暂无发布节点</div>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-custom-text-400">已完成迭代</div>
                      <div className="mt-2 h-[132px] overflow-auto space-y-2 vertical-scrollbar scrollbar-sm pr-1">
                        {(() => {
                          const completed = (data.project_progress.releases ?? [])
                            .filter((r) => r.state === "已发布" || Math.round(r.completion_rate) >= 100)
                            .slice(-6)
                            .reverse();
                          if (completed.length === 0) {
                            return <div className="text-xs text-custom-text-400">暂无已完成迭代</div>;
                          }
                          return (
                            <div className="space-y-2">
                              {completed.map((r) => (
                                <div
                                  key={r.id}
                                  className={cn(
                                    "rounded border px-2 py-1.5 text-xs",
                                    r.is_urgent ? "border-red-300 bg-red-50/70 text-red-700" : "border-custom-border-200 bg-custom-background-90"
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0 truncate">{r.name}</div>
                                    <div className="shrink-0">{r.end_date ?? "-"}</div>
                                  </div>
                                  <div className="mt-1 flex items-center justify-between gap-2">
                                    <div className="text-[11px] opacity-80">{r.state}</div>
                                    <div className="text-[11px] opacity-80">{Math.round(r.completion_rate)}%</div>
                                  </div>
                                  <div className="mt-1 h-1.5 w-full rounded bg-white/60 overflow-hidden">
                                    <div
                                      className="h-full rounded"
                                      style={{
                                        width: `${Math.max(0, Math.min(100, r.completion_rate))}%`,
                                        background: VI_COLORS.primary,
                                      }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </Card>

                <Card className="p-4 border border-custom-border-200 xl:col-span-7">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-custom-text-200">测试进度</div>
                    <div className="text-xs text-custom-text-400">用例总数 {data.test_progress.total_cases}</div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="h-[220px]">
                      <EChart
                        option={testProgressOption as any}
                        onEvents={{
                          click: (params) => {
                            if (params?.name === "失败") setFailedCasesOpen(true);
                          },
                        }}
                      />
                    </div>
                    <div className="flex flex-col justify-center gap-3">
                      <div className="flex items-center justify-between text-sm">
                        <div className="text-custom-text-400">成功</div>
                        <div className="font-medium text-custom-text-200">{data.test_progress.success}</div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="text-custom-text-400">失败（点击图表查看）</div>
                        <div className="font-medium text-custom-text-200">{data.test_progress.fail}</div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="text-custom-text-400">未执行</div>
                        <div className="font-medium text-custom-text-200">{data.test_progress.not_executed}</div>
                      </div>
                      <div className="mt-2 text-xs text-custom-text-400">提示：统计口径为“每条用例的最新执行结果（跨计划）”。</div>
                    </div>
                  </div>
                </Card>

                <Card className="p-4 border border-custom-border-200 xl:col-span-7">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-custom-text-200">缺陷统计</div>
                      <div className="mt-1 text-xs text-custom-text-400">
                        时间段 {data.defect_stats.range.start_date ?? "-"} ～ {data.defect_stats.range.end_date ?? "-"} · 缺陷总数{" "}
                        {data.defect_stats.total}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Segmented
                        value={`${defectRangeDays}`}
                        onChange={(v: SegmentedValue) => setDefectRangeDays(Number(v) as 7 | 30 | 90)}
                        options={[
                          { label: "近7天", value: "7" },
                          { label: "近30天", value: "30" },
                          { label: "近90天", value: "90" },
                        ]}
                      />
                      <Button onClick={() => setSelectedDefectStatus(null)} disabled={!selectedDefectStatus}>
                        清除筛选
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="h-[260px]">
                      <EChart
                        option={defectStatusOption as any}
                        onEvents={{
                          click: (params) => {
                            const statusKey = params?.data?.statusKey;
                            if (!statusKey) return;
                            setSelectedDefectStatus((prev) => (prev === statusKey ? null : statusKey));
                          },
                        }}
                      />
                    </div>
                    <div className="h-[260px]">
                      <div className="mb-2 text-xs text-custom-text-400">严重等级分布（按优先级口径）</div>
                      <EChart option={defectSeverityOption as any} />
                    </div>
                  </div>
                </Card>

                <Card className="p-4 border border-custom-border-200 xl:col-span-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-custom-text-200">用例评审</div>
                      <div className="mt-1 text-xs text-custom-text-400">
                        通过率 {data.case_review.pass_rate}%{data.case_review.owner ? ` · 负责人 ${data.case_review.owner.assignees.map((a) => a.display_name).join("、")}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3">
                    <div className="h-[170px]">
                      <EChart option={reviewCountsOption as any} />
                    </div>
                    <div className="h-[170px]">
                      <div className="mb-2 text-xs text-custom-text-400">近30天通过率趋势</div>
                      <EChart option={reviewTrendOption as any} />
                    </div>
                  </div>
                </Card>

                <Card className="p-4 border border-custom-border-200 xl:col-span-12">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-custom-text-200">燃尽图</div>
                      <div className="mt-1 text-xs text-custom-text-400">
                        当前剩余 {burndownSummary.remaining} · 预计完成时间 {burndownSummary.eta ?? "-"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-custom-text-400">迭代</div>
                      <Select
                        value={data.burndown?.cycle.id ?? selectedCycleId}
                        style={{ width: 260 }}
                        options={(data.cycles ?? []).map((c) => ({
                          value: c.id,
                          label: `${c.name}${c.start_date && c.end_date ? `（${c.start_date}~${c.end_date}）` : ""}`,
                        }))}
                        onChange={(v) => setSelectedCycleId(v)}
                        allowClear
                        placeholder="选择迭代"
                      />
                    </div>
                  </div>
                  <div className="mt-3 h-[320px]">
                    {data.burndown ? <EChart option={burndownOption as any} /> : <div className="grid h-full place-items-center text-sm text-custom-text-400">暂无燃尽数据</div>}
                  </div>
                </Card>
              </div>

              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 rounded border border-custom-border-200 bg-custom-background-90 px-3 py-2 text-xs text-custom-text-400">
                <div>数据来源：工作项（Issue）/ 迭代（Cycle）/ 里程碑（Milestone）/ QA（Plan & Review）。</div>
                <Button size="small" onClick={() => refresh()} disabled={exporting}>
                  刷新数据
                </Button>
              </div>

              <Modal
                title="失败用例详情"
                open={failedCasesOpen}
                onCancel={() => setFailedCasesOpen(false)}
                footer={null}
                width={720}
              >
                <div className="space-y-2">
                  {(data.test_progress.failed_cases ?? []).length === 0 ? (
                    <div className="text-sm text-custom-text-400">暂无失败用例</div>
                  ) : (
                    data.test_progress.failed_cases.map((c) => (
                      <div key={c.id} className="rounded border border-custom-border-200 px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-custom-text-200 truncate">{c.name}</div>
                            <div className="mt-0.5 text-xs text-custom-text-400 truncate">
                              {c.code}
                              {c.plan_name ? ` · 计划：${c.plan_name}` : ""}
                            </div>
                            <div className="mt-1 text-xs text-custom-text-400">
                              执行人 {c.executor ?? "-"} · 执行时间 {c.executed_at ? dayjs(c.executed_at).format("YYYY-MM-DD HH:mm") : "-"} · 结果 {c.result}
                            </div>
                            {c.reason?.trim() ? (
                              <div className="mt-1 text-xs text-custom-text-200">
                                原因：<span className="text-custom-text-300">{c.reason}</span>
                              </div>
                            ) : null}
                          </div>
                          <Button
                            size="small"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(c.code || c.id);
                                message.success("已复制");
                              } catch {
                                message.error("复制失败");
                              }
                            }}
                          >
                            复制编号
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Modal>
            </div>
          ) : (
            <div className="grid place-items-center h-full text-custom-text-300">暂无统计数据</div>
          )}
        </div>
      </div>
    </AnalyticsWrapper>
  );
}

export const Statistics = observer(Dashboard);
