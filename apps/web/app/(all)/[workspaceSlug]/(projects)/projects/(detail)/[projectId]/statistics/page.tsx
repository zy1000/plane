"use client";

import { useMemo, useState } from "react";
import { Dropdown } from "antd";
import { Tab } from "@headlessui/react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { observer } from "mobx-react";
import {
  AlertTriangle,
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
  Timer,
} from "lucide-react";
import { CYCLE_STATUS, PROJECT_ANALYTICS_VIEW_PERMISSION_KEY } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { BarChart } from "@plane/propel/charts/bar-chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn, getDate, renderFormattedDate } from "@plane/utils";
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { OverdueByAssigneeCard } from "@/components/common/overdue-by-assignee-card";
import { PageHead } from "@/components/core/page-title";
import { CycleOverviewFullscreenModal } from "@/components/cycles/cycle-overview-fullscreen-modal";
import { getReleaseStatusDetails as getReleaseStatusMeta } from "@/components/releases/release-status-config";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { ProjectStatisticService, type TProjectStatisticResponse } from "@/services/project";
import { StatisticExpandModal, type StatisticSectionType } from "./statistic-expand-modal";

const projectStatisticService = new ProjectStatisticService();

/** 统计页四个 Tab 一次性加载的最大条数（与后端上限保持一致） */
const STATISTIC_TABLE_PAGE_SIZE = 1000;

const sectionCard = "rounded-lg border border-subtle bg-surface-1";
const kpiCardBase =
  "rounded-lg border border-subtle bg-surface-1 px-4 py-5 transition-all duration-200 hover:border-primary/20 hover:shadow-sm";
const kpiIconShell = "grid h-11 w-11 flex-shrink-0 place-items-center rounded-sm bg-surface-2";
const kpiLabelClass = "text-sm font-medium text-primary";
const kpiValueNumberClass = "text-18 font-semibold text-primary";
const kpiValueUnitClass = "text-sm font-normal text-primary";

function StatisticKpiCountValue(props: { loaded: boolean; value: number; unit?: string }) {
  const { loaded, value, unit = "个" } = props;
  if (!loaded) {
    return <span className={kpiValueNumberClass}>-</span>;
  }
  return (
    <div className="flex items-baseline gap-1">
      <span className={kpiValueNumberClass}>{value}</span>
      <span className={kpiValueUnitClass}>{unit}</span>
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
  测试中: "testing",
  已退回: "returned",
  已延期: "delayed",
  已完成: "completed",
  已取消: "cancelled",
  testing: "testing",
  current: "in_progress",
  upcoming: "not_started",
  draft: "not_started",
};

function normalizeCycleStatusValue(status?: string): string {
  return status ? (CYCLE_STATUS_NORMALIZE_MAP[status] ?? status.toLowerCase()) : "not_started";
}

/** 表格内日期列：yyyy/MM/dd ~ yyyy/MM/dd */
function formatStatisticTableDateRange(
  startDate: string | null | undefined,
  endDate: string | null | undefined
): string {
  const start = startDate ? getDate(startDate) : null;
  const end = endDate ? getDate(endDate) : null;
  const fullStart = start ? renderFormattedDate(start, "yyyy/MM/dd") : "-";
  const fullEnd = end ? renderFormattedDate(end, "yyyy/MM/dd") : "-";
  return `${fullStart} ~ ${fullEnd}`;
}

type ProgressListTabKey = "cycle" | "release" | "plan" | "review";

type ProgressListTabConfig = {
  key: ProgressListTabKey;
  label: string;
  icon: typeof Repeat;
  dataKey: "cycles" | "releases" | "test_plans" | "case_reviews";
  expandSection: StatisticSectionType;
  viewMoreLabel: string;
  viewMoreRoute: string;
};

const PROGRESS_LIST_TABS: ProgressListTabConfig[] = [
  {
    key: "cycle",
    label: "迭代",
    icon: Repeat,
    dataKey: "cycles",
    expandSection: "cycle",
    viewMoreLabel: "查看更多迭代",
    viewMoreRoute: "cycles",
  },
  {
    key: "release",
    label: "发布",
    icon: Package,
    dataKey: "releases",
    expandSection: "release",
    viewMoreLabel: "查看更多发布",
    viewMoreRoute: "releases",
  },
  {
    key: "plan",
    label: "测试计划",
    icon: ClipboardList,
    dataKey: "test_plans",
    expandSection: "plan",
    viewMoreLabel: "查看更多测试计划",
    viewMoreRoute: "testhub/plans",
  },
  {
    key: "review",
    label: "评审",
    icon: FileSearch,
    dataKey: "case_reviews",
    expandSection: "review",
    viewMoreLabel: "查看更多评审",
    viewMoreRoute: "testhub/reviews",
  },
];

function ProjectStatisticsPage() {
  const pageTitle = "统计";
  const { t } = useTranslation();
  const router = useRouter();
  const { workspaceSlug, projectId } = useParams();
  const { getProjectById } = useProject();
  const { workspaceUserInfo, allowProjectPermissionKeys } = useUserPermissions();
  const [expandModalSection, setExpandModalSection] = useState<StatisticSectionType | null>(null);
  const [overdueExpandOpen, setOverdueExpandOpen] = useState(false);
  const [activeListTabIndex, setActiveListTabIndex] = useState(0);
  const activeTab = PROGRESS_LIST_TABS[activeListTabIndex] ?? PROGRESS_LIST_TABS[0];

  const effectiveWorkspaceSlug = workspaceSlug?.toString();
  const effectiveProjectId = projectId?.toString();
  const project = getProjectById(effectiveProjectId);

  const canViewStatistics = allowProjectPermissionKeys(
    [PROJECT_ANALYTICS_VIEW_PERMISSION_KEY],
    effectiveWorkspaceSlug,
    effectiveProjectId
  );

  const { data: displayData } = useSWR<TProjectStatisticResponse>(
    effectiveWorkspaceSlug && effectiveProjectId
      ? `project-statistic-${effectiveWorkspaceSlug}-${effectiveProjectId}`
      : null,
    () =>
      projectStatisticService.getStatistic(effectiveWorkspaceSlug!, effectiveProjectId!, {
        page_size: STATISTIC_TABLE_PAGE_SIZE,
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

  /** 工时统计：展示工时排名前 N 的成员，避免柱体过密 */
  const MEMBER_TIMESHEET_MAX_BARS = 15;
  const memberTimesheetSourceRows = displayData?.member_timesheet_hours;
  const memberTimesheetBarData = useMemo(() => {
    const rows = memberTimesheetSourceRows ?? [];
    return rows.slice(0, MEMBER_TIMESHEET_MAX_BARS).map((row) => ({
      key: row.member_id,
      name: row.display_name,
      hours: Math.round((row.hours ?? 0) * 100) / 100,
    }));
  }, [memberTimesheetSourceRows]);
  const memberTimesheetTotalMembers = memberTimesheetSourceRows?.length ?? 0;
  const memberTimesheetHasMore = memberTimesheetTotalMembers > MEMBER_TIMESHEET_MAX_BARS;

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
    const statusDetails = getReleaseStatusMeta(status);
    if (statusDetails.value === "in-progress") {
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
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className={kpiCardBase}>
              <div className="flex items-center gap-2.5">
                <div className={kpiIconShell}>
                  <Timer className="h-5 w-5 text-amber-500" />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className={kpiLabelClass}>工时总计</div>
                  <StatisticKpiCountValue
                    loaded={!!counts}
                    value={Math.round((counts?.total_timesheet_hours ?? 0) * 100) / 100}
                    unit="h"
                  />
                </div>
              </div>
            </div>

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

          {/* Progress Lists Tab（左 1/2）+ 延期工作项负责人（右 1/2） */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <div className={`${sectionCard} flex h-[420px] flex-col`}>
              <Tab.Group
                selectedIndex={activeListTabIndex}
                onChange={(index) => setActiveListTabIndex(index)}
              >
                <div className="flex flex-shrink-0 items-center gap-2 px-4 py-3">
                  <Tab.List
                    as="div"
                    className="grid min-w-0 flex-1 grid-cols-4 gap-1 rounded-md bg-layer-2 p-1 text-sm font-medium"
                  >
                    {PROGRESS_LIST_TABS.map((tab) => {
                      const Icon = tab.icon;
                      return (
                        <Tab
                          key={tab.key}
                          className={({ selected }) =>
                            cn(
                              "min-w-0 w-full cursor-pointer rounded-sm p-1 text-primary transition-all outline-none focus:outline-none",
                              "flex items-center justify-center gap-1.5",
                              selected
                                ? "bg-layer-transparent-active text-secondary"
                                : "text-placeholder hover:text-secondary"
                            )
                          }
                        >
                          <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{tab.label}</span>
                          <span className="shrink-0 text-placeholder">
                            {displayData?.[tab.dataKey]?.count ?? 0}
                          </span>
                        </Tab>
                      );
                    })}
                  </Tab.List>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="grid h-6 w-6 place-items-center rounded transition-colors hover:bg-surface-2"
                      onClick={() => setExpandModalSection(activeTab.expandSection)}
                    >
                      <Maximize2 className="h-3.5 w-3.5 text-placeholder" />
                    </button>
                    <Dropdown
                      menu={{
                        className: "text-13",
                        items: [
                          {
                            key: "view-more",
                            label: activeTab.viewMoreLabel,
                            icon: <ExternalLink className="h-3.5 w-3.5" />,
                          },
                        ],
                        onClick: ({ key }) => {
                          if (key === "view-more") {
                            router.push(
                              `/${effectiveWorkspaceSlug}/projects/${effectiveProjectId}/${activeTab.viewMoreRoute}`
                            );
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
                <Tab.Panels className="flex min-h-0 flex-1 flex-col">
                  {/* 迭代 */}
                  <Tab.Panel className="flex min-h-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 vertical-scrollbar scrollbar-sm">
                      <Table className="table-fixed" wrapperClassName="overflow-visible">
                        <TableHeader className="border-y-0 bg-transparent [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface-1 [&_th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
                          <TableRow>
                            <TableHead className="h-8 w-[22%] text-left text-xs font-medium text-primary">迭代</TableHead>
                            <TableHead className="h-8 w-[38%] text-left text-xs font-medium tabular-nums text-primary">日期</TableHead>
                            <TableHead className="h-8 w-[12%] text-left text-xs font-medium text-primary">状态</TableHead>
                            <TableHead className="h-8 w-[28%] pl-20 text-left text-xs font-medium text-primary">负责人</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!displayData ? (
                            <TableRow>
                              <TableCell colSpan={4}>
                                <div className="grid h-14 place-items-center text-sm text-placeholder">加载中...</div>
                              </TableCell>
                            </TableRow>
                          ) : (displayData?.cycles?.data?.length ?? 0) === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4}>
                                <div className="grid h-14 place-items-center text-sm text-placeholder">暂无进行中的迭代</div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            (displayData?.cycles?.data ?? []).map((cycle) => (
                              <TableRow key={cycle.id} className="transition-colors hover:bg-layer-1">
                                <TableCell
                                  className="min-w-0 truncate text-sm text-primary"
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
                                <TableCell className="whitespace-nowrap tabular-nums text-sm text-primary">
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
                                <TableCell className="min-w-0 truncate pl-20 text-sm text-primary" title={cycle.owner?.display_name ?? "-"}>
                                  {cycle.owner?.display_name ?? "-"}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </Tab.Panel>

                  {/* 发布 */}
                  <Tab.Panel className="flex min-h-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 vertical-scrollbar scrollbar-sm">
                      <Table className="table-fixed" wrapperClassName="overflow-visible">
                        <TableHeader className="border-y-0 bg-transparent [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface-1 [&_th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
                          <TableRow>
                            <TableHead className="h-8 w-[22%] text-left text-xs font-medium text-primary">发布</TableHead>
                            <TableHead className="h-8 w-[38%] text-left text-xs font-medium tabular-nums text-primary">日期</TableHead>
                            <TableHead className="h-8 w-[12%] text-left text-xs font-medium text-primary">状态</TableHead>
                            <TableHead className="h-8 w-[28%] pl-20 text-left text-xs font-medium text-primary">负责人</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!displayData ? (
                            <TableRow>
                              <TableCell colSpan={4}>
                                <div className="grid h-14 place-items-center text-sm text-placeholder">加载中...</div>
                              </TableCell>
                            </TableRow>
                          ) : (displayData?.releases?.data?.length ?? 0) === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4}>
                                <div className="grid h-14 place-items-center text-sm text-placeholder">
                                  暂无进行中的发布
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            (displayData?.releases?.data ?? []).map((release) => (
                              <TableRow key={release.id} className="transition-colors hover:bg-layer-1">
                                <TableCell className="min-w-0 truncate text-sm text-primary" title={release.name}>
                                  <button
                                    type="button"
                                    className="truncate hover:underline text-left"
                                    onClick={() => router.push(`/${effectiveWorkspaceSlug}/projects/${effectiveProjectId}/releases/${release.id}/overview`)}
                                  >
                                    {release.name}
                                  </button>
                                </TableCell>
                                <TableCell className="whitespace-nowrap tabular-nums text-sm text-primary">
                                  {formatStatisticTableDateRange(release.start_date, release.end_date)}
                                </TableCell>
                                <TableCell className="pl-0 -ml-1 text-left">
                                  {(() => {
                                    const statusDetails = getModuleStatusDetails(release.status);
                                    return (
                                      <span
                                        className={getStatisticStatusTagClassName(statusDetails.textColor)}
                                      >
                                        {statusDetails.label}
                                      </span>
                                    );
                                  })()}
                                </TableCell>
                                <TableCell className="min-w-0 truncate pl-20 text-sm text-primary" title={release.owner?.display_name ?? "-"}>
                                  {release.owner?.display_name ?? "-"}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </Tab.Panel>

                  {/* 测试计划 */}
                  <Tab.Panel className="flex min-h-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 vertical-scrollbar scrollbar-sm">
                      <Table className="table-fixed" wrapperClassName="overflow-visible">
                        <TableHeader className="border-y-0 bg-transparent [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface-1 [&_th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
                          <TableRow>
                            <TableHead className="h-8 w-[22%] text-left text-xs font-medium text-primary">测试计划</TableHead>
                            <TableHead className="h-8 w-[38%] text-left text-xs font-medium tabular-nums text-primary">日期</TableHead>
                            <TableHead className="h-8 w-[12%] text-left text-xs font-medium text-primary">状态</TableHead>
                            <TableHead className="h-8 w-[28%] pl-20 text-left text-xs font-medium text-primary">负责人</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!displayData ? (
                            <TableRow>
                              <TableCell colSpan={4}>
                                <div className="grid h-14 place-items-center text-sm text-placeholder">加载中...</div>
                              </TableCell>
                            </TableRow>
                          ) : (displayData?.test_plans?.data?.length ?? 0) === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4}>
                                <div className="grid h-14 place-items-center text-sm text-placeholder">
                                  暂无进行中的测试计划
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            (displayData?.test_plans?.data ?? []).map((plan) => (
                              <TableRow key={plan.id} className="transition-colors hover:bg-layer-1">
                                <TableCell className="min-w-0 truncate text-sm text-primary" title={plan.name}>
                                  <button
                                    type="button"
                                    className="truncate hover:underline text-left"
                                    onClick={() => router.push(`/${effectiveWorkspaceSlug}/projects/${effectiveProjectId}/testhub/plan-cases?planId=${plan.id}`)}
                                  >
                                    {plan.name}
                                  </button>
                                </TableCell>
                                <TableCell className="whitespace-nowrap tabular-nums text-sm text-primary">
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
                                <TableCell className="min-w-0 truncate pl-20 text-sm text-primary" title={plan.owner?.display_name ?? "-"}>
                                  {plan.owner?.display_name ?? "-"}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </Tab.Panel>

                  {/* 评审 */}
                  <Tab.Panel className="flex min-h-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 vertical-scrollbar scrollbar-sm">
                      <Table className="table-fixed" wrapperClassName="overflow-visible">
                        <TableHeader className="border-y-0 bg-transparent [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface-1 [&_th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
                          <TableRow>
                            <TableHead className="h-8 w-[22%] text-left text-xs font-medium text-primary">评审</TableHead>
                            <TableHead className="h-8 w-[38%] text-left text-xs font-medium tabular-nums text-primary">日期</TableHead>
                            <TableHead className="h-8 w-[12%] text-left text-xs font-medium text-primary">状态</TableHead>
                            <TableHead className="h-8 w-[28%] pl-20 text-left text-xs font-medium text-primary">负责人</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {!displayData ? (
                            <TableRow>
                              <TableCell colSpan={4}>
                                <div className="grid h-14 place-items-center text-sm text-placeholder">加载中...</div>
                              </TableCell>
                            </TableRow>
                          ) : (displayData?.case_reviews?.data?.length ?? 0) === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4}>
                                <div className="grid h-14 place-items-center text-sm text-placeholder">
                                  暂无进行中的用例评审
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            (displayData?.case_reviews?.data ?? []).map((review) => (
                              <TableRow key={review.id} className="transition-colors hover:bg-layer-1">
                                <TableCell className="min-w-0 truncate text-sm text-primary" title={review.name}>
                                  <button
                                    type="button"
                                    className="truncate hover:underline text-left"
                                    onClick={() => router.push(`/${effectiveWorkspaceSlug}/projects/${effectiveProjectId}/testhub/caseManagementReviewDetail?review_id=${review.id}`)}
                                  >
                                    {review.name}
                                  </button>
                                </TableCell>
                                <TableCell className="whitespace-nowrap tabular-nums text-sm text-primary">
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
                                <TableCell className="min-w-0 truncate pl-20 text-sm text-primary" title={review.owner?.display_name ?? "-"}>
                                  {review.owner?.display_name ?? "-"}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </Tab.Panel>
                </Tab.Panels>
              </Tab.Group>
            </div>
            <div>
              <OverdueByAssigneeCard
                data={displayData?.overdue_by_assignee}
                headerExtra={
                  <button
                    type="button"
                    className="grid h-6 w-6 shrink-0 place-items-center rounded transition-colors hover:bg-surface-2"
                    onClick={() => setOverdueExpandOpen(true)}
                    aria-label="放大"
                  >
                    <Maximize2 className="h-3.5 w-3.5 text-placeholder" />
                  </button>
                }
              />
            </div>
          </div>

          {/* Work Item Stats（独占整行） */}
          <div className={`${sectionCard} flex h-[420px] flex-col p-4`}>
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5 text-placeholder" />
              <span className="text-sm font-medium text-primary">工作项统计</span>
            </div>
            <div className="min-h-0 flex-1">
              <BarChart
                className="h-full w-full"
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

          {/* 工时统计：按项目成员汇总已登记工时 */}
          <div className={`${sectionCard} flex h-[420px] flex-col p-4`}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Timer className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-sm font-medium text-primary">工时统计</span>
                <span className="shrink-0 text-xs text-placeholder">
                  共 {memberTimesheetTotalMembers} 位成员
                </span>
              </div>
              <div className="flex items-baseline gap-1 text-xs text-placeholder">
                <span>累计工时</span>
                <span className="text-sm font-medium text-amber-500 tabular-nums">
                  {Math.round((counts?.total_timesheet_hours ?? 0) * 100) / 100}
                </span>
                <span>h</span>
                {memberTimesheetHasMore && (
                  <span className="ml-2 truncate">
                    · 仅显示前 {MEMBER_TIMESHEET_MAX_BARS} 名
                  </span>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1">
              {!displayData ? (
                <div className="grid h-full place-items-center text-sm text-placeholder">加载中...</div>
              ) : memberTimesheetBarData.length === 0 ? (
                <div className="grid h-full place-items-center text-sm text-placeholder">
                  暂无工时记录
                </div>
              ) : (
                <BarChart
                  className="h-full w-full"
                  margin={{ top: 20, right: 30, bottom: 5, left: 0 }}
                  data={memberTimesheetBarData}
                  barSize={32}
                  bars={[
                    {
                      key: "hours",
                      label: "工时（小时）",
                      fill: "#F59E0B",
                      showPercentage: false,
                      textClassName: "",
                    },
                  ]}
                  xAxis={{ key: "name", label: "成员" }}
                  yAxis={{ key: "hours", label: "工时（h）", offset: -60, dx: -24 }}
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
              )}
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
      <CycleOverviewFullscreenModal
        isOpen={overdueExpandOpen}
        onClose={() => setOverdueExpandOpen(false)}
        title="延期工作项负责人"
        badgeText={
          displayData?.overdue_by_assignee != null
            ? `共 ${displayData.overdue_by_assignee.total} 条`
            : undefined
        }
        icon={AlertTriangle}
      >
        <div className="flex min-h-0 flex-1 flex-col bg-surface-1">
          <div className="min-h-0 flex-1 overflow-hidden px-4 pb-3">
            <OverdueByAssigneeCard
              hideHeader
              data={displayData?.overdue_by_assignee}
              className="h-full min-h-[50vh]"
            />
          </div>
        </div>
      </CycleOverviewFullscreenModal>
    </>
  );
}

export default observer(ProjectStatisticsPage);
