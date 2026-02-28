"use client";

import { useMemo, useState } from "react";
import { Pagination } from "antd";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { CYCLE_STATUS, MODULE_STATUS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { AreaChart } from "@plane/propel/charts/area-chart";
import { BarChart } from "@plane/propel/charts/bar-chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@plane/propel/table";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { getDate, renderFormattedDate } from "@plane/utils";
import { PageHead } from "@/components/core/page-title";
import { ProjectStatisticService, type TProjectStatisticResponse } from "@/services/project";

const projectStatisticService = new ProjectStatisticService();

const Card: React.FC<{ title: string; children: React.ReactNode; className?: string }> = (props) => {
  const { title, children, className } = props;
  return (
    <div className={`bg-custom-background-100 border border-custom-border-200 rounded-lg shadow-custom-shadow-md p-4 ${className ?? ""}`}>
      <h4 className="text-lg font-medium text-custom-text-200">{title}</h4>
      <div className="mt-3">{children}</div>
    </div>
  );
};

const KpiCard: React.FC<{
  title: string;
  value: string | number;
  unit?: string;
  className?: string;
  valueClassName?: string;
}> = (props) => {
  const { title, value, unit = "个", className, valueClassName } = props;
  const shouldShowUnit = typeof value === "number";
  return (
    <div
      className={`bg-custom-background-100 border border-custom-border-200 rounded-lg shadow-custom-shadow-md p-3 min-h-[150px] flex flex-col ${
        className ?? ""
      }`}
    >
      <div>
        <div className="text-lg font-medium text-custom-text-200">{title}</div>
      </div>
      <div className="flex-1 grid place-items-center">
        <div className="flex items-end gap-2">
          <div className={`text-5xl font-semibold leading-none text-custom-text-200 ${valueClassName ?? ""}`}>{value}</div>
          {shouldShowUnit && <div className="pb-1 text-xs text-custom-text-300">{unit}</div>}
        </div>
      </div>
    </div>
  );
};

export default function ProjectStatisticsPage() {
  const pageTitle = "统计";
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams();
  const [cyclePage, setCyclePage] = useState(1);
  const [releasePage, setReleasePage] = useState(1);
  const [planPage, setPlanPage] = useState(1);
  const [reviewPage, setReviewPage] = useState(1);

  const effectiveWorkspaceSlug = workspaceSlug?.toString();
  const effectiveProjectId = projectId?.toString();

  const { data, isLoading } = useSWR<TProjectStatisticResponse>(
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
      onError: () => {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "加载失败",
          message: "获取项目统计失败，请稍后重试。",
        });
      },
    }
  );

  const requirementTrendData = useMemo(() => {
    const rows = data?.requirement_daily_status ?? [];
    return rows.map((row) => ({
      key: row.date,
      name: renderFormattedDate(getDate(row.date), "yyyy-MM-dd") ?? row.date,
      completed: row.completed,
      incomplete: row.incomplete,
    }));
  }, [data]);

  const defectTrendData = useMemo(() => {
    const rows = data?.defect_daily_created ?? [];
    return rows.map((row) => ({
      key: row.date,
      name: renderFormattedDate(getDate(row.date), "yyyy-MM-dd") ?? row.date,
      created: row.created,
    }));
  }, [data]);

  const workItemBarData = useMemo(() => {
    const rows = data?.work_item_stats ?? [];
    return rows.map((row) => ({
      key: row.type_id,
      name: row.name,
      unstarted: row.unstarted,
      started: row.started,
      completed: row.completed,
      total: row.total,
    }));
  }, [data]);

  const getCycleStatusDetails = (status?: string) => {
    const normalizedStatus = status?.toLowerCase() ?? "draft";
    return CYCLE_STATUS.find((item) => item.value === normalizedStatus) ?? CYCLE_STATUS[CYCLE_STATUS.length - 1];
  };

  const getModuleStatusDetails = (status?: string) => {
    const normalizedStatus = status?.toLowerCase() ?? "planned";
    return MODULE_STATUS.find((item) => item.value === normalizedStatus) ?? MODULE_STATUS[0];
  };

  const getQaStatusDetails = (status?: string) => {
    if (status === "进行中") {
      return { bgColor: "bg-indigo-50", textColor: "text-blue-500" };
    }
    if (status === "已完成") {
      return { bgColor: "bg-green-50", textColor: "text-green-600" };
    }
    if (status === "未开始") {
      return { bgColor: "bg-custom-background-90", textColor: "text-custom-text-300" };
    }
    return { bgColor: "bg-custom-background-90", textColor: "text-custom-text-300" };
  };

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="relative h-full w-full overflow-hidden overflow-y-auto">
        <div className="mx-auto w-full max-w-full px-6 py-6">
          <div className="grid grid-cols-1 gap-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
              <KpiCard
                title="全部需求"
                value={isLoading ? "-" : (data?.counts?.total_requirements ?? 0)}
              />
              <KpiCard
                title="进行中的需求"
                value={isLoading ? "-" : (data?.counts?.in_progress_requirements ?? 0)}
                valueClassName="text-[#ef9d13]"
              />
              <KpiCard
                title="全部缺陷"
                value={isLoading ? "-" : (data?.counts?.total_defects ?? 0)}
              />
              <KpiCard
                title="待处理的缺陷"
                value={isLoading ? "-" : (data?.counts?.pending_defects ?? 0)}
                valueClassName="text-[#dc2626]"
              />
              <KpiCard
                title="全部用例"
                value={isLoading ? "-" : (data?.counts?.total_cases ?? 0)}
              />
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="bg-custom-background-100 border border-custom-border-200 rounded-lg shadow-custom-shadow-md p-4 min-h-[300px] flex flex-col">
                <div className="flex items-baseline gap-2">
                  <div className="text-lg font-medium text-custom-text-200">进行中的迭代</div>
                  <div className="text-xs text-custom-text-400">{`共 ${data?.cycles?.count ?? 0} 个进行中的迭代`}</div>
                </div>
                <div className="mt-3 flex-1 min-h-0 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-transparent border-b border-custom-border-200 border-t-0">
                      <TableRow>
                        <TableHead className="w-1/3 text-left">名称</TableHead>
                        <TableHead className="w-1/3 text-left">日期</TableHead>
                        <TableHead className="w-1/6 text-left">状态</TableHead>
                        <TableHead className="w-1/6 text-left whitespace-nowrap">工作项</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                          <TableCell colSpan={4}>
                            <div className="h-20 grid place-items-center text-sm text-custom-text-300">加载中...</div>
                          </TableCell>
                        </TableRow>
                      ) : (data?.cycles?.data?.length ?? 0) === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4}>
                            <div className="h-20 grid place-items-center text-sm text-custom-text-300">暂无进行中的迭代</div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        (data?.cycles?.data ?? []).map((cycle) => (
                          <TableRow key={cycle.id} className="hover:bg-[#f7f7f7]">
                            <TableCell className="max-w-[320px] truncate text-custom-text-200" title={cycle.name}>
                              {cycle.name}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm text-custom-text-200">
                                {(cycle.start_date ? renderFormattedDate(getDate(cycle.start_date), "yyyy-MM-dd") : "-") +
                                  " ~ " +
                                  (cycle.end_date ? renderFormattedDate(getDate(cycle.end_date), "yyyy-MM-dd") : "-")}
                              </div>
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const statusDetails = getCycleStatusDetails(cycle.status);
                                return (
                                  <span
                                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs ${statusDetails.bgColor} ${statusDetails.textColor}`}
                                  >
                                    {t(statusDetails.i18n_title)}
                                  </span>
                                );
                              })()}
                            </TableCell>
                            <TableCell>{cycle.work_item_count ?? 0}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex-shrink-0 border-t border-custom-border-200 px-4 py-3 bg-custom-background-100 flex items-center justify-between">
                  <div className="text-sm text-custom-text-300">{(data?.cycles?.count ?? 0) > 0 ? `共 ${data?.cycles?.count ?? 0} 条` : ""}</div>
                  <Pagination
                    simple
                    current={cyclePage}
                    pageSize={5}
                    total={data?.cycles?.count ?? 0}
                    showQuickJumper
                    onChange={(p) => setCyclePage(p)}
                    size="small"
                  />
                </div>
              </div>

              <div className="bg-custom-background-100 border border-custom-border-200 rounded-lg shadow-custom-shadow-md p-4 min-h-[300px] flex flex-col">
                <div className="flex items-baseline gap-2">
                  <div className="text-lg font-medium text-custom-text-200">进行中的发布</div>
                  <div className="text-xs text-custom-text-400">{`共 ${data?.releases?.count ?? 0} 个进行中的发布`}</div>
                </div>
                <div className="mt-3 flex-1 min-h-0 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-transparent border-b border-custom-border-200 border-t-0">
                      <TableRow>
                        <TableHead className="w-1/3 text-left">名称</TableHead>
                        <TableHead className="w-1/3 text-left">日期</TableHead>
                        <TableHead className="w-1/6 text-left">状态</TableHead>
                        <TableHead className="w-1/6 text-left whitespace-nowrap">工作项</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                          <TableCell colSpan={4}>
                            <div className="h-20 grid place-items-center text-sm text-custom-text-300">加载中...</div>
                          </TableCell>
                        </TableRow>
                      ) : (data?.releases?.data?.length ?? 0) === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4}>
                            <div className="h-20 grid place-items-center text-sm text-custom-text-300">暂无进行中的发布</div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        (data?.releases?.data ?? []).map((release) => (
                          <TableRow key={release.id} className="hover:bg-[#f7f7f7]">
                            <TableCell className="max-w-[320px] truncate text-custom-text-200" title={release.name}>
                              {release.name}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm text-custom-text-200">
                                {(release.start_date ? renderFormattedDate(getDate(release.start_date), "yyyy-MM-dd") : "-") +
                                  " ~ " +
                                  (release.end_date ? renderFormattedDate(getDate(release.end_date), "yyyy-MM-dd") : "-")}
                              </div>
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const statusDetails = getModuleStatusDetails(release.status);
                                return (
                                  <span
                                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs ${statusDetails.bgColor} ${statusDetails.textColor}`}
                                  >
                                    {t(statusDetails.i18n_label)}
                                  </span>
                                );
                              })()}
                            </TableCell>
                            <TableCell>{release.work_item_count ?? 0}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex-shrink-0 border-t border-custom-border-200 px-4 py-3 bg-custom-background-100 flex items-center justify-between">
                  <div className="text-sm text-custom-text-300">{(data?.releases?.count ?? 0) > 0 ? `共 ${data?.releases?.count ?? 0} 条` : ""}</div>
                  <Pagination
                    simple
                    current={releasePage}
                    pageSize={5}
                    total={data?.releases?.count ?? 0}
                    showQuickJumper
                    onChange={(p) => setReleasePage(p)}
                    size="small"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="bg-custom-background-100 border border-custom-border-200 rounded-lg shadow-custom-shadow-md p-4 min-h-[300px] flex flex-col">
                <div className="flex items-baseline gap-2">
                  <div className="text-lg font-medium text-custom-text-200">进行中的测试计划</div>
                  <div className="text-xs text-custom-text-400">{`共 ${data?.test_plans?.count ?? 0} 个进行中的测试计划`}</div>
                </div>
                <div className="mt-3 flex-1 min-h-0 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-transparent border-b border-custom-border-200 border-t-0">
                      <TableRow>
                        <TableHead className="w-1/3 text-left">名称</TableHead>
                        <TableHead className="w-1/3 text-left">日期</TableHead>
                        <TableHead className="w-1/6 text-left">状态</TableHead>
                        <TableHead className="w-1/6 text-left whitespace-nowrap">用例</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                          <TableCell colSpan={4}>
                            <div className="h-20 grid place-items-center text-sm text-custom-text-300">加载中...</div>
                          </TableCell>
                        </TableRow>
                      ) : (data?.test_plans?.data?.length ?? 0) === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4}>
                            <div className="h-20 grid place-items-center text-sm text-custom-text-300">暂无进行中的测试计划</div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        (data?.test_plans?.data ?? []).map((plan) => (
                          <TableRow key={plan.id} className="hover:bg-[#f7f7f7]">
                            <TableCell className="max-w-[320px] truncate text-custom-text-200" title={plan.name}>
                              {plan.name}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm text-custom-text-200">
                                {(plan.start_date ? renderFormattedDate(getDate(plan.start_date), "yyyy-MM-dd") : "-") +
                                  " ~ " +
                                  (plan.end_date ? renderFormattedDate(getDate(plan.end_date), "yyyy-MM-dd") : "-")}
                              </div>
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const statusDetails = getQaStatusDetails(plan.status);
                                return (
                                  <span
                                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs ${statusDetails.bgColor} ${statusDetails.textColor}`}
                                  >
                                    {plan.status ?? "-"}
                                  </span>
                                );
                              })()}
                            </TableCell>
                            <TableCell>{plan.case_count ?? 0}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex-shrink-0 border-t border-custom-border-200 px-4 py-3 bg-custom-background-100 flex items-center justify-between">
                  <div className="text-sm text-custom-text-300">{(data?.test_plans?.count ?? 0) > 0 ? `共 ${data?.test_plans?.count ?? 0} 条` : ""}</div>
                  <Pagination
                    simple
                    current={planPage}
                    pageSize={5}
                    total={data?.test_plans?.count ?? 0}
                    showQuickJumper
                    onChange={(p) => setPlanPage(p)}
                    size="small"
                  />
                </div>
              </div>

              <div className="bg-custom-background-100 border border-custom-border-200 rounded-lg shadow-custom-shadow-md p-4 min-h-[300px] flex flex-col">
                <div className="flex items-baseline gap-2">
                  <div className="text-lg font-medium text-custom-text-200">进行中的评审</div>
                  <div className="text-xs text-custom-text-400">{`共 ${data?.case_reviews?.count ?? 0} 个进行中的评审`}</div>
                </div>
                <div className="mt-3 flex-1 min-h-0 overflow-hidden">
                  <Table>
                    <TableHeader className="bg-transparent border-b border-custom-border-200 border-t-0">
                      <TableRow>
                        <TableHead className="w-1/3 text-left">名称</TableHead>
                        <TableHead className="w-1/3 text-left">日期</TableHead>
                        <TableHead className="w-1/6 text-left">状态</TableHead>
                        <TableHead className="w-1/6 text-left">类型</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                          <TableCell colSpan={4}>
                            <div className="h-20 grid place-items-center text-sm text-custom-text-300">加载中...</div>
                          </TableCell>
                        </TableRow>
                      ) : (data?.case_reviews?.data?.length ?? 0) === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4}>
                            <div className="h-20 grid place-items-center text-sm text-custom-text-300">暂无进行中的用例评审</div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        (data?.case_reviews?.data ?? []).map((review) => (
                          <TableRow key={review.id} className="hover:bg-[#f7f7f7]">
                            <TableCell className="max-w-[320px] truncate text-custom-text-200" title={review.name}>
                              {review.name}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm text-custom-text-200">
                                {(review.start_date ? renderFormattedDate(getDate(review.start_date), "yyyy-MM-dd") : "-") +
                                  " ~ " +
                                  (review.end_date ? renderFormattedDate(getDate(review.end_date), "yyyy-MM-dd") : "-")}
                              </div>
                            </TableCell>
                            <TableCell>
                              {(() => {
                                const statusDetails = getQaStatusDetails(review.status);
                                return (
                                  <span
                                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs ${statusDetails.bgColor} ${statusDetails.textColor}`}
                                  >
                                    {review.status ?? "-"}
                                  </span>
                                );
                              })()}
                            </TableCell>
                            <TableCell>用例评审</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex-shrink-0 border-t border-custom-border-200 px-4 py-3 bg-custom-background-100 flex items-center justify-between">
                  <div className="text-sm text-custom-text-300">{(data?.case_reviews?.count ?? 0) > 0 ? `共 ${data?.case_reviews?.count ?? 0} 条` : ""}</div>
                  <Pagination
                    simple
                    current={reviewPage}
                    pageSize={5}
                    total={data?.case_reviews?.count ?? 0}
                    showQuickJumper
                    onChange={(p) => setReviewPage(p)}
                    size="small"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Card title="需求每日状态趋势" className="min-h-[420px]">
                <AreaChart
                  className="h-[340px] w-full"
                  data={requirementTrendData}
                  areas={[
                    {
                      key: "completed",
                      label: "已完成",
                      fill: "#19803833",
                      fillOpacity: 1,
                      stackId: "requirement",
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
                      stackId: "requirement",
                      showDot: false,
                      smoothCurves: true,
                      strokeColor: "#F59E0B",
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
                    wrapperStyles: { justifyContent: "start", alignContent: "start", paddingLeft: "40px", paddingTop: "10px" },
                  }}
                />
              </Card>

              <Card title="缺陷每日新增趋势" className="min-h-[420px]">
                <AreaChart
                  className="h-[340px] w-full"
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
                    wrapperStyles: { justifyContent: "start", alignContent: "start", paddingLeft: "40px", paddingTop: "10px" },
                  }}
                />
              </Card>
            </div>

            <Card title="工作项统计" className="min-h-[420px]">
              <BarChart
                className="w-full h-[340px]"
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
                  wrapperStyles: { justifyContent: "start", alignContent: "start", paddingLeft: "40px", paddingTop: "10px" },
                }}
              />
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
