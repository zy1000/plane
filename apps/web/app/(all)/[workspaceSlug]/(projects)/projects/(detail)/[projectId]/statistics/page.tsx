"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dropdown, Pagination } from "antd";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { observer } from "mobx-react";
import {
  BarChart3,
  Bug,
  ClipboardList,
  FileSearch,
  FileText,
  ExternalLink,
  MoreHorizontal,
  Maximize2,
  Package,
  Repeat,
  TrendingUp,
} from "lucide-react";
import { CYCLE_STATUS, MODULE_STATUS, PROJECT_ANALYTICS_VIEW_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { AreaChart } from "@plane/propel/charts/area-chart";
import { BarChart } from "@plane/propel/charts/bar-chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { getDate, renderFormattedDate } from "@plane/utils";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { PageHead } from "@/components/core/page-title";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { ProjectStatisticService, type TProjectStatisticResponse } from "@/services/project";
import { StatisticExpandModal, type StatisticSectionType } from "./statistic-expand-modal";

const projectStatisticService = new ProjectStatisticService();

/** 与后端 `get_statistic` 中各列表分页条数一致 */
const STATISTIC_TABLE_PAGE_SIZE = 7;

const sectionCard = "rounded-lg border border-subtle bg-surface-1";
const kpiCardBase =
  "rounded-lg border border-subtle bg-surface-1 px-4 py-5 transition-all duration-200 hover:border-primary/20 hover:shadow-sm";
const kpiIconShell = "grid h-11 w-11 flex-shrink-0 place-items-center rounded-sm bg-surface-2";
const kpiLabelClass = "text-sm font-medium text-primary";
const kpiValueNumberClass = "text-18 font-semibold text-primary";
const kpiValueUnitClass = "text-sm font-normal text-primary";

function StatisticKpiCountValue(props: { loaded: boolean; value: number }) {
  const { loaded, value } = props;
  if (!loaded) {
    return <span className={kpiValueNumberClass}>-</span>;
  }
  return (
    <div className="flex items-baseline gap-1">
      <span className={kpiValueNumberClass}>{value}</span>
      <span className={kpiValueUnitClass}>个</span>
    </div>
  );
}

const LEGACY_STATUS_CLASS_MAP: Record<string, string> = {
  "bg-indigo-50": "bg-accent-subtle",
  "text-blue-500": "text-accent-primary",
  "bg-amber-50": "bg-warning-subtle",
  "text-amber-500": "text-warning-primary",
  "bg-red-50": "bg-danger-subtle",
  "text-red-600": "text-danger-primary",
  "bg-green-50": "bg-success-subtle",
  "text-green-600": "text-success-primary",
};

/** 统计页表格内状态：无背景，仅语义色文字 */
const getStatisticStatusTagClassName = (textColor?: string) =>
  [
    "inline-flex items-center rounded-md px-2 py-0.5 text-xs",
    textColor ? (LEGACY_STATUS_CLASS_MAP[textColor] ?? textColor) : "",
  ]
    .filter(Boolean)
    .join(" ");

const CYCLE_STATUS_NORMALIZE_MAP: Record<string, string> = {
  未开始: "not_started",
  进行中: "in_progress",
  已延期: "delayed",
  已完成: "completed",
  已取消: "cancelled",
  current: "in_progress",
  upcoming: "not_started",
  draft: "not_started",
};

function normalizeCycleStatusValue(status?: string): string {
  return status ? (CYCLE_STATUS_NORMALIZE_MAP[status] ?? status.toLowerCase()) : "not_started";
}

/** 表格内日期列：同年只写一次年份（起始完整 yyyy-MM-dd，结束仅 MM-dd） */
function formatStatisticTableDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): string {
  const start = startDate ? getDate(startDate) : null;
  const end = endDate ? getDate(endDate) : null;
  const fullStart = start ? renderFormattedDate(start, "yyyy-MM-dd") : "-";
  const fullEnd = end ? renderFormattedDate(end, "yyyy-MM-dd") : "-";
  if (start && end && start.getFullYear() === end.getFullYear()) {
    return `${fullStart} ~ ${renderFormattedDate(end, "MM-dd")}`;
  }
  return `${fullStart} ~ ${fullEnd}`;
}

function ProjectStatisticsPage() {
  const pageTitle = "统计";
  const { t } = useTranslation();
  const router = useRouter();
  const { workspaceSlug, projectId } = useParams();
  const { getProjectById } = useProject();
  const { workspaceUserInfo, allowProjectPermissionKeys } = useUserPermissions();
  const [cyclePage, setCyclePage] = useState(1);
  const [releasePage, setReleasePage] = useState(1);
  const [planPage, setPlanPage] = useState(1);
  const [reviewPage, setReviewPage] = useState(1);
  const [expandModalSection, setExpandModalSection] = useState<StatisticSectionType | null>(null);

  const changeTriggerRef = useRef<Set<string>>(new Set(["init"]));
  const [displayData, setDisplayData] = useState<TProjectStatisticResponse | undefined>(undefined);

  const handleCyclePageChange = (p: number) => {
    changeTriggerRef.current.add("cycle");
    setCyclePage(p);
  };
  const handleReleasePageChange = (p: number) => {
    changeTriggerRef.current.add("release");
    setReleasePage(p);
  };
  const handlePlanPageChange = (p: number) => {
    changeTriggerRef.current.add("plan");
    setPlanPage(p);
  };
  const handleReviewPageChange = (p: number) => {
    changeTriggerRef.current.add("review");
    setReviewPage(p);
  };

  const effectiveWorkspaceSlug = workspaceSlug?.toString();
  const effectiveProjectId = projectId?.toString();
  const project = getProjectById(effectiveProjectId);

  const canViewStatistics = allowProjectPermissionKeys(
    [PROJECT_ANALYTICS_VIEW_PERMISSION_KEY],
    effectiveWorkspaceSlug,
    effectiveProjectId
  );

  const { data } = useSWR<TProjectStatisticResponse>(
    effectiveWorkspaceSlug && effectiveProjectId
      ? `project-statistic-${effectiveWorkspaceSlug}-${effectiveProjectId}-${cyclePage}-${releasePage}-${planPage}-${reviewPage}`
      : null,
    () =>
      projectStatisticService.getStatistic(effectiveWorkspaceSlug!, effectiveProjectId!, {
        page: cyclePage,
        release_page: releasePage,
        plan_page: planPage,
        review_page: reviewPage,
      }),
    {
      keepPreviousData: true,
      onError: () => {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "加载失败",
          message: "获取项目统计失败，请稍后重试。",
        });
      },
    }
  );

  useEffect(() => {
    if (data === undefined) return;
    const triggers = changeTriggerRef.current;
    setDisplayData((prev) => {
      if (!prev || triggers.has("init")) return data;
      const updated = { ...prev };
      if (triggers.has("cycle")) updated.cycles = data.cycles;
      if (triggers.has("release")) updated.releases = data.releases;
      if (triggers.has("plan")) updated.test_plans = data.test_plans;
      if (triggers.has("review")) updated.case_reviews = data.case_reviews;
      return updated;
    });
    changeTriggerRef.current = new Set();
  }, [data]);

  const requirementTrendData = useMemo(() => {
    const rows = displayData?.requirement_daily_status ?? [];
    return rows.map((row) => ({
      key: row.date,
      name: renderFormattedDate(getDate(row.date), "yyyy-MM-dd") ?? row.date,
      completed: row.completed,
      incomplete: row.incomplete,
    }));
  }, [displayData]);

  const defectTrendData = useMemo(() => {
    const rows = displayData?.defect_daily_created ?? [];
    return rows.map((row) => ({
      key: row.date,
      name: renderFormattedDate(getDate(row.date), "yyyy-MM-dd") ?? row.date,
      created: row.created,
    }));
  }, [displayData]);

  const workItemBarData = useMemo(() => {
    const rows = displayData?.work_item_stats ?? [];
    return rows.map((row) => ({
      key: row.type_id,
      name: row.name,
      unstarted: row.unstarted,
      started: row.started,
      completed: row.completed,
      total: row.total,
    }));
  }, [displayData]);

  const getCycleStatusDetails = (status?: string) => {
    const normalizedStatus = normalizeCycleStatusValue(status);
    const statusDetails =
      CYCLE_STATUS.find((item) => item.value === normalizedStatus) ?? CYCLE_STATUS[CYCLE_STATUS.length - 1];

    if (normalizedStatus === "in_progress") {
      return {
        ...statusDetails,
        textColor: "text-[#F59E0B]",
      };
    }

    if (normalizedStatus === "not_started") {
      return {
        ...statusDetails,
        textColor: "text-secondary",
      };
    }

    return statusDetails;
  };

  const getModuleStatusDetails = (status?: string) => {
    const normalizedStatus = status?.toLowerCase() ?? "planned";
    const statusDetails = MODULE_STATUS.find((item) => item.value === normalizedStatus) ?? MODULE_STATUS[0];

    if (normalizedStatus === "in-progress") {
      return {
        ...statusDetails,
        textColor: "text-[#F59E0B]",
      };
    }

    return statusDetails;
  };

  const getQaStatusDetails = (status?: string) => {
    if (status === "进行中") {
      return { textColor: "text-[#F59E0B]" };
    }
    if (status === "已完成") {
      return { textColor: "text-green-600" };
    }
    if (status === "未开始") {
      return { textColor: "text-secondary" };
    }
    return { textColor: "text-secondary" };
  };

  const counts = displayData?.counts;

  if (workspaceUserInfo && effectiveWorkspaceSlug && effectiveProjectId && !canViewStatistics) {
    return <NotAuthorizedView section="general" isProjectView className="h-auto" />;
  }

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="h-full w-full overflow-y-auto vertical-scrollbar scrollbar-sm">
        <div className="flex flex-col gap-5 px-6 py-4">
          {/* Header */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <h1 className="shrink-0 text-lg font-normal text-primary">项目统计</h1>
            {project ? (
              <p className="min-w-0 truncate text-sm text-placeholder">
                {project.name} · {project.identifier}
              </p>
            ) : null}
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className={kpiCardBase}>
              <div className="flex items-center gap-2.5">
                <div className={kpiIconShell}>
                  <FileText className="h-5 w-5 text-[#3f76ff]" />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className={kpiLabelClass}>全部需求</div>
                  <StatisticKpiCountValue loaded={!!counts} value={counts?.total_requirements ?? 0} />
                </div>
              </div>
            </div>

            <div className={kpiCardBase}>
              <div className="flex items-center gap-2.5">
                <div className={kpiIconShell}>
                  <FileText className="h-5 w-5 text-[#F59E0B]" />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className={kpiLabelClass}>未完成的需求</div>
                  <StatisticKpiCountValue loaded={!!counts} value={counts?.in_progress_requirements ?? 0} />
                </div>
              </div>
            </div>

            <div className={kpiCardBase}>
              <div className="flex items-center gap-2.5">
                <div className={kpiIconShell}>
                  <Bug className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className={kpiLabelClass}>全部缺陷</div>
                  <StatisticKpiCountValue loaded={!!counts} value={counts?.total_defects ?? 0} />
                </div>
              </div>
            </div>

            <div className={kpiCardBase}>
              <div className="flex items-center gap-2.5">
                <div className={kpiIconShell}>
                  <Bug className="h-5 w-5 text-danger-primary" />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className={kpiLabelClass}>待处理的缺陷</div>
                  <StatisticKpiCountValue loaded={!!counts} value={counts?.pending_defects ?? 0} />
                </div>
              </div>
            </div>
          </div>

          {/* Cycles + Releases */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className={`${sectionCard} flex h-[360px] flex-col`}>
              <div className="flex flex-shrink-0 items-center justify-between px-4 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Repeat className="h-3.5 w-3.5 flex-shrink-0 text-placeholder" />
                  <span className="text-sm font-medium text-primary">进行中的迭代</span>
                  <span className="shrink-0 text-xs text-placeholder">共 {displayData?.cycles?.count ?? 0} 个</span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className="grid h-6 w-6 place-items-center rounded transition-colors hover:bg-surface-2"
                    onClick={() => setExpandModalSection("cycle")}
                  >
                    <Maximize2 className="h-3.5 w-3.5 text-placeholder" />
                  </button>
                  <Dropdown
                    menu={{
                      className: "text-13",
                      items: [
                        {
                          key: "view-more",
                          label: "查看更多迭代",
                          icon: <ExternalLink className="h-3.5 w-3.5" />,
                        },
                      ],
                      onClick: ({ key }) => {
                        if (key === "view-more") {
                          router.push(`/${effectiveWorkspaceSlug}/projects/${effectiveProjectId}/cycles`);
                        }
                      },
                    }}
                    trigger={["click"]}
                  >
                    <button
                      type="button"
                      className="grid h-6 w-6 place-items-center rounded transition-colors hover:bg-surface-2"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5 text-placeholder" />
                    </button>
                  </Dropdown>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 vertical-scrollbar scrollbar-sm">
                <Table>
                  <TableHeader className="border-b border-subtle border-t-0 bg-transparent">
                    <TableRow>
                      <TableHead className="h-8 w-[28%] text-left text-xs font-medium text-placeholder">迭代</TableHead>
                      <TableHead className="h-8 w-[24%] text-left text-xs font-medium text-placeholder">日期</TableHead>
                      <TableHead className="h-8 w-[14%] text-left text-xs font-medium text-placeholder">状态</TableHead>
                      <TableHead className="h-8 w-[14%] text-left text-xs font-medium text-placeholder">工作项</TableHead>
                      <TableHead className="h-8 w-[20%] pl-6 text-left text-xs font-medium text-placeholder">负责人</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!displayData ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <div className="grid h-14 place-items-center text-sm text-placeholder">加载中...</div>
                        </TableCell>
                      </TableRow>
                    ) : (displayData?.cycles?.data?.length ?? 0) === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <div className="grid h-14 place-items-center text-sm text-placeholder">暂无进行中的迭代</div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      (displayData?.cycles?.data ?? []).map((cycle) => {
                        return (
                          <TableRow key={cycle.id} className="transition-colors hover:bg-layer-1">
                            <TableCell
                              className="max-w-[200px] truncate text-sm text-primary"
                              title={cycle.name}
                            >
                              <button
                                type="button"
                                className="truncate hover:underline text-left"
                                onClick={() => router.push(`/${effectiveWorkspaceSlug}/projects/${effectiveProjectId}/cycles/${cycle.id}`)}
                              >
                                {cycle.name}
                              </button>
                            </TableCell>
                            <TableCell className="text-sm text-primary">
                              {formatStatisticTableDateRange(cycle.start_date, cycle.end_date)}
                            </TableCell>
                            <TableCell className="pl-0 -ml-1 text-left">
                              {(() => {
                                const statusDetails = getCycleStatusDetails(cycle.status);
                                return (
                                  <span
                                    className={getStatisticStatusTagClassName(statusDetails.textColor)}
                                  >
                                    {t(statusDetails.i18n_title)}
                                  </span>
                                );
                              })()}
                            </TableCell>
                            <TableCell className="text-sm text-primary">
                              {cycle.work_item_count ?? 0}
                            </TableCell>
                            <TableCell className="max-w-[120px] truncate pl-6 text-sm text-primary" title={cycle.owner?.display_name ?? "-"}>
                              {cycle.owner?.display_name ?? "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
              {(displayData?.cycles?.count ?? 0) > STATISTIC_TABLE_PAGE_SIZE && (
                <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle px-4 py-2">
                  <span className="text-xs text-placeholder">共 {displayData?.cycles?.count ?? 0} 条</span>
                  <Pagination
                    simple
                    current={cyclePage}
                    pageSize={STATISTIC_TABLE_PAGE_SIZE}
                    total={displayData?.cycles?.count ?? 0}
                    onChange={handleCyclePageChange}
                    size="small"
                  />
                </div>
              )}
            </div>

            <div className={`${sectionCard} flex h-[360px] flex-col`}>
              <div className="flex flex-shrink-0 items-center justify-between px-4 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Package className="h-3.5 w-3.5 flex-shrink-0 text-placeholder" />
                  <span className="text-sm font-medium text-primary">进行中的发布</span>
                  <span className="shrink-0 text-xs text-placeholder">共 {displayData?.releases?.count ?? 0} 个</span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className="grid h-6 w-6 place-items-center rounded transition-colors hover:bg-surface-2"
                    onClick={() => setExpandModalSection("release")}
                  >
                    <Maximize2 className="h-3.5 w-3.5 text-placeholder" />
                  </button>
                  <Dropdown
                    menu={{
                      className: "text-13",
                      items: [
                        {
                          key: "view-more",
                          label: "查看更多发布",
                          icon: <ExternalLink className="h-3.5 w-3.5" />,
                        },
                      ],
                      onClick: ({ key }) => {
                        if (key === "view-more") {
                          router.push(`/${effectiveWorkspaceSlug}/projects/${effectiveProjectId}/releases`);
                        }
                      },
                    }}
                    trigger={["click"]}
                  >
                    <button
                      type="button"
                      className="grid h-6 w-6 place-items-center rounded transition-colors hover:bg-surface-2"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5 text-placeholder" />
                    </button>
                  </Dropdown>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 vertical-scrollbar scrollbar-sm">
                <Table>
                  <TableHeader className="border-b border-subtle border-t-0 bg-transparent">
                    <TableRow>
                      <TableHead className="h-8 w-[28%] text-left text-xs font-medium text-placeholder">发布</TableHead>
                      <TableHead className="h-8 w-[24%] text-left text-xs font-medium text-placeholder">日期</TableHead>
                      <TableHead className="h-8 w-[14%] text-left text-xs font-medium text-placeholder">状态</TableHead>
                      <TableHead className="h-8 w-[14%] text-left text-xs font-medium text-placeholder">工作项</TableHead>
                      <TableHead className="h-8 w-[20%] pl-6 text-left text-xs font-medium text-placeholder">负责人</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!displayData ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <div className="grid h-14 place-items-center text-sm text-placeholder">加载中...</div>
                        </TableCell>
                      </TableRow>
                    ) : (displayData?.releases?.data?.length ?? 0) === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <div className="grid h-14 place-items-center text-sm text-placeholder">
                            暂无进行中的发布
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      (displayData?.releases?.data ?? []).map((release) => (
                        <TableRow key={release.id} className="transition-colors hover:bg-layer-1">
                          <TableCell className="max-w-[200px] truncate text-sm text-primary" title={release.name}>
                            <button
                              type="button"
                              className="truncate hover:underline text-left"
                              onClick={() => router.push(`/${effectiveWorkspaceSlug}/projects/${effectiveProjectId}/releases/${release.id}`)}
                            >
                              {release.name}
                            </button>
                          </TableCell>
                          <TableCell className="text-sm text-primary">
                            {formatStatisticTableDateRange(release.start_date, release.end_date)}
                          </TableCell>
                          <TableCell className="pl-0 -ml-1 text-left">
                            {(() => {
                              const statusDetails = getModuleStatusDetails(release.status);
                              return (
                                <span
                                  className={getStatisticStatusTagClassName(statusDetails.textColor)}
                                >
                                  {t(statusDetails.i18n_label)}
                                </span>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-sm">{release.work_item_count ?? 0}</TableCell>
                          <TableCell className="max-w-[120px] truncate pl-6 text-sm text-primary" title={release.owner?.display_name ?? "-"}>
                            {release.owner?.display_name ?? "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {(displayData?.releases?.count ?? 0) > STATISTIC_TABLE_PAGE_SIZE && (
                <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle px-4 py-2">
                  <span className="text-xs text-placeholder">共 {displayData?.releases?.count ?? 0} 条</span>
                  <Pagination
                    simple
                    current={releasePage}
                    pageSize={STATISTIC_TABLE_PAGE_SIZE}
                    total={displayData?.releases?.count ?? 0}
                    onChange={handleReleasePageChange}
                    size="small"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Test Plans + Reviews */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className={`${sectionCard} flex h-[360px] flex-col`}>
              <div className="flex flex-shrink-0 items-center justify-between px-4 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <ClipboardList className="h-3.5 w-3.5 flex-shrink-0 text-placeholder" />
                  <span className="text-sm font-medium text-primary">进行中的测试计划</span>
                  <span className="shrink-0 text-xs text-placeholder">共 {displayData?.test_plans?.count ?? 0} 个</span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className="grid h-6 w-6 place-items-center rounded transition-colors hover:bg-surface-2"
                    onClick={() => setExpandModalSection("plan")}
                  >
                    <Maximize2 className="h-3.5 w-3.5 text-placeholder" />
                  </button>
                  <Dropdown
                    menu={{
                      className: "text-13",
                      items: [
                        {
                          key: "view-more",
                          label: "查看更多测试计划",
                          icon: <ExternalLink className="h-3.5 w-3.5" />,
                        },
                      ],
                      onClick: ({ key }) => {
                        if (key === "view-more") {
                          router.push(`/${effectiveWorkspaceSlug}/projects/${effectiveProjectId}/testhub/plans`);
                        }
                      },
                    }}
                    trigger={["click"]}
                  >
                    <button
                      type="button"
                      className="grid h-6 w-6 place-items-center rounded transition-colors hover:bg-surface-2"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5 text-placeholder" />
                    </button>
                  </Dropdown>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 vertical-scrollbar scrollbar-sm">
                <Table>
                  <TableHeader className="border-b border-subtle border-t-0 bg-transparent">
                    <TableRow>
                      <TableHead className="h-8 w-[28%] text-left text-xs font-medium text-placeholder">测试计划</TableHead>
                      <TableHead className="h-8 w-[24%] text-left text-xs font-medium text-placeholder">日期</TableHead>
                      <TableHead className="h-8 w-[14%] text-left text-xs font-medium text-placeholder">状态</TableHead>
                      <TableHead className="h-8 w-[14%] text-left text-xs font-medium text-placeholder">用例</TableHead>
                      <TableHead className="h-8 w-[20%] pl-6 text-left text-xs font-medium text-placeholder">负责人</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!displayData ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <div className="grid h-14 place-items-center text-sm text-placeholder">加载中...</div>
                        </TableCell>
                      </TableRow>
                    ) : (displayData?.test_plans?.data?.length ?? 0) === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <div className="grid h-14 place-items-center text-sm text-placeholder">
                            暂无进行中的测试计划
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      (displayData?.test_plans?.data ?? []).map((plan) => (
                        <TableRow key={plan.id} className="transition-colors hover:bg-layer-1">
                          <TableCell className="max-w-[200px] truncate text-sm text-primary" title={plan.name}>
                            <button
                              type="button"
                              className="truncate hover:underline text-left"
                              onClick={() => router.push(`/${effectiveWorkspaceSlug}/projects/${effectiveProjectId}/testhub/plan-cases?planId=${plan.id}`)}
                            >
                              {plan.name}
                            </button>
                          </TableCell>
                          <TableCell className="text-sm text-primary">
                            {formatStatisticTableDateRange(plan.start_date, plan.end_date)}
                          </TableCell>
                          <TableCell className="pl-0 -ml-1 text-left">
                            {(() => {
                              const statusDetails = getQaStatusDetails(plan.status);
                              return (
                                <span
                                  className={getStatisticStatusTagClassName(statusDetails.textColor)}
                                >
                                  {plan.status ?? "-"}
                                </span>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-sm">{plan.case_count ?? 0}</TableCell>
                          <TableCell className="max-w-[120px] truncate pl-6 text-sm text-primary" title={plan.owner?.display_name ?? "-"}>
                            {plan.owner?.display_name ?? "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {(displayData?.test_plans?.count ?? 0) > STATISTIC_TABLE_PAGE_SIZE && (
                <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle px-4 py-2">
                  <span className="text-xs text-placeholder">共 {displayData?.test_plans?.count ?? 0} 条</span>
                  <Pagination
                    simple
                    current={planPage}
                    pageSize={STATISTIC_TABLE_PAGE_SIZE}
                    total={displayData?.test_plans?.count ?? 0}
                    onChange={handlePlanPageChange}
                    size="small"
                  />
                </div>
              )}
            </div>

            <div className={`${sectionCard} flex h-[360px] flex-col`}>
              <div className="flex flex-shrink-0 items-center justify-between px-4 py-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <FileSearch className="h-3.5 w-3.5 flex-shrink-0 text-placeholder" />
                  <span className="text-sm font-medium text-primary">进行中的评审</span>
                  <span className="shrink-0 text-xs text-placeholder">共 {displayData?.case_reviews?.count ?? 0} 个</span>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className="grid h-6 w-6 place-items-center rounded transition-colors hover:bg-surface-2"
                    onClick={() => setExpandModalSection("review")}
                  >
                    <Maximize2 className="h-3.5 w-3.5 text-placeholder" />
                  </button>
                  <Dropdown
                    menu={{
                      className: "text-13",
                      items: [
                        {
                          key: "view-more",
                          label: "查看更多评审",
                          icon: <ExternalLink className="h-3.5 w-3.5" />,
                        },
                      ],
                      onClick: ({ key }) => {
                        if (key === "view-more") {
                          router.push(`/${effectiveWorkspaceSlug}/projects/${effectiveProjectId}/testhub/reviews`);
                        }
                      },
                    }}
                    trigger={["click"]}
                  >
                    <button
                      type="button"
                      className="grid h-6 w-6 place-items-center rounded transition-colors hover:bg-surface-2"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5 text-placeholder" />
                    </button>
                  </Dropdown>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 vertical-scrollbar scrollbar-sm">
                <Table>
                  <TableHeader className="border-b border-subtle border-t-0 bg-transparent">
                    <TableRow>
                      <TableHead className="h-8 w-[28%] text-left text-xs font-medium text-placeholder">评审</TableHead>
                      <TableHead className="h-8 w-[24%] text-left text-xs font-medium text-placeholder">日期</TableHead>
                      <TableHead className="h-8 w-[14%] text-left text-xs font-medium text-placeholder">状态</TableHead>
                      <TableHead className="h-8 w-[14%] text-left text-xs font-medium text-placeholder">类型</TableHead>
                      <TableHead className="h-8 w-[20%] pl-6 text-left text-xs font-medium text-placeholder">负责人</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!displayData ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <div className="grid h-14 place-items-center text-sm text-placeholder">加载中...</div>
                        </TableCell>
                      </TableRow>
                    ) : (displayData?.case_reviews?.data?.length ?? 0) === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5}>
                          <div className="grid h-14 place-items-center text-sm text-placeholder">
                            暂无进行中的用例评审
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      (displayData?.case_reviews?.data ?? []).map((review) => (
                        <TableRow key={review.id} className="transition-colors hover:bg-layer-1">
                          <TableCell className="max-w-[200px] truncate text-sm text-primary" title={review.name}>
                            <button
                              type="button"
                              className="truncate hover:underline text-left"
                              onClick={() => router.push(`/${effectiveWorkspaceSlug}/projects/${effectiveProjectId}/testhub/caseManagementReviewDetail?review_id=${review.id}`)}
                            >
                              {review.name}
                            </button>
                          </TableCell>
                          <TableCell className="text-sm text-primary">
                            {formatStatisticTableDateRange(review.start_date, review.end_date)}
                          </TableCell>
                          <TableCell className="pl-0 -ml-1 text-left">
                            {(() => {
                              const statusDetails = getQaStatusDetails(review.status);
                              return (
                                <span
                                  className={getStatisticStatusTagClassName(statusDetails.textColor)}
                                >
                                  {review.status ?? "-"}
                                </span>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-sm">用例评审</TableCell>
                          <TableCell className="max-w-[120px] truncate pl-6 text-sm text-primary" title={review.owner?.display_name ?? "-"}>
                            {review.owner?.display_name ?? "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {(displayData?.case_reviews?.count ?? 0) > STATISTIC_TABLE_PAGE_SIZE && (
                <div className="flex flex-shrink-0 items-center justify-between border-t border-subtle px-4 py-2">
                  <span className="text-xs text-placeholder">共 {displayData?.case_reviews?.count ?? 0} 条</span>
                  <Pagination
                    simple
                    current={reviewPage}
                    pageSize={STATISTIC_TABLE_PAGE_SIZE}
                    total={displayData?.case_reviews?.count ?? 0}
                    onChange={handleReviewPageChange}
                    size="small"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Trend Charts */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className={`${sectionCard} flex h-[420px] flex-col p-4`}>
              <div className="mb-3 flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-placeholder" />
                <span className="text-sm font-medium text-primary">需求每日状态趋势</span>
              </div>
              <div className="min-h-0 flex-1">
                <AreaChart
                  className="h-full w-full"
                  data={requirementTrendData}
                  areas={[
                    {
                      key: "completed",
                      label: "已完成",
                      fill: "#19803833",
                      fillOpacity: 1,
                      stackId: "已完成",
                      showDot: false,
                      smoothCurves: true,
                      strokeColor: "#198038",
                      strokeOpacity: 1,
                    },
                    {
                      key: "incomplete",
                      label: "未完成",
                      fill: "#F59E0B33",
                      fillOpacity: 1,
                      stackId: "未完成",
                      showDot: false,
                      smoothCurves: true,
                      strokeColor: "#F59E0B",
                      strokeOpacity: 1,
                    },
                  ]}
                  xAxis={{ key: "name", label: "日期" }}
                  yAxis={{ key: "count", label: "数量", offset: -60, dx: -24 }}
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
              </div>
            </div>

            <div className={`${sectionCard} flex h-[420px] flex-col p-4`}>
              <div className="mb-3 flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-placeholder" />
                <span className="text-sm font-medium text-primary">缺陷每日新增趋势</span>
              </div>
              <div className="min-h-0 flex-1">
                <AreaChart
                  className="h-full w-full"
                  data={defectTrendData}
                  areas={[
                    {
                      key: "created",
                      label: "新增缺陷",
                      fill: "#8e011933",
                      fillOpacity: 1,
                      stackId: "defect",
                      showDot: false,
                      smoothCurves: true,
                      strokeColor: "#8e0119",
                      strokeOpacity: 1,
                    },
                  ]}
                  xAxis={{ key: "name", label: "日期" }}
                  yAxis={{ key: "count", label: "数量", offset: -60, dx: -24 }}
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
              </div>
            </div>
          </div>

          {/* Work Item Stats */}
          <div className={`${sectionCard} flex flex-col p-4`} style={{ minHeight: "420px" }}>
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5 text-placeholder" />
              <span className="text-sm font-medium text-primary">工作项统计</span>
            </div>
            <div className="min-h-0 flex-1">
              <BarChart
                className="h-[340px] w-full"
                margin={{ top: 20, right: 30, bottom: 5, left: 0 }}
                data={workItemBarData}
                bars={[
                  {
                    key: "unstarted",
                    label: "未开始",
                    stackId: "work-items",
                    fill: "#a3a3a3",
                    showPercentage: false,
                    textClassName: "",
                  },
                  {
                    key: "started",
                    label: "进行中",
                    stackId: "work-items",
                    fill: "#3f76ff",
                    showPercentage: false,
                    textClassName: "",
                  },
                  {
                    key: "completed",
                    label: "已完成",
                    stackId: "work-items",
                    fill: "#16a34a",
                    showPercentage: false,
                    textClassName: "",
                  },
                ]}
                xAxis={{ key: "name", label: "类型" }}
                yAxis={{ key: "count", label: "数量", offset: -60, dx: -24 }}
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
            </div>
          </div>
        </div>
      </div>
      {expandModalSection && effectiveWorkspaceSlug && effectiveProjectId && (
        <StatisticExpandModal
          isOpen={!!expandModalSection}
          onClose={() => setExpandModalSection(null)}
          section={expandModalSection}
          workspaceSlug={effectiveWorkspaceSlug}
          projectId={effectiveProjectId}
        />
      )}
    </>
  );
}

export default observer(ProjectStatisticsPage);
