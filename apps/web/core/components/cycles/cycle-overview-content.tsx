/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { isEmpty } from "lodash-es";
import { observer } from "mobx-react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Tab } from "@headlessui/react";
import {
  CalendarDays,
  ArrowRight,
  SquareUser,
  CheckCircle2,
  PlayCircle,
  Circle,
  Clock,
  XCircle,
  Layers,
  Plus,
  Download,
  Trash2,
  FileText,
  Maximize2,
  AlertTriangle,
  ClipboardList,
  Pencil,
} from "lucide-react";
import { Pagination, Popconfirm } from "antd";
import { CYCLE_STATUS, EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { CheckIcon, MembersPropertyIcon, WorkItemsIcon } from "@plane/propel/icons";
import type { ICycle, TCyclePlotType, TProgressSnapshot, TCycleDistribution, TCycleEstimateDistribution } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
import { Loader, Avatar, AvatarGroup, Button, CircularProgressIndicator } from "@plane/ui";
import { cn, getFileURL, calculateCycleProgress, getDate, toFilterArray } from "@plane/utils";
import { OverdueByAssigneeCard } from "@/components/common/overdue-by-assignee-card";
import { CycleDescriptionFullscreenModal } from "@/components/cycles/cycle-description-fullscreen-modal";
import { CycleOverviewFullscreenModal } from "@/components/cycles/cycle-overview-fullscreen-modal";
import useCyclesDetails from "@/components/cycles/active-cycle/use-cycles-details";
import type { TAssigneeData } from "@/components/core/sidebar/progress-stats/assignee";
import { AssigneeStatComponent } from "@/components/core/sidebar/progress-stats/assignee";
import { createFilterUpdateHandler } from "@/components/core/sidebar/progress-stats/shared";
import { useCycle } from "@/hooks/store/use-cycle";
import { useMember } from "@/hooks/store/use-member";
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkItemFilters } from "@/hooks/store/work-item-filters/use-work-item-filters";
import useLocalStorage from "@/hooks/use-local-storage";
import { SidebarChartRoot } from "@/plane-web/components/cycles";
import { CycleService } from "@/services/cycle.service";

type Props = {
  workspaceSlug: string;
  projectId: string;
  cycleId: string;
};

type TOverviewExpandPanel = null | "overdue" | "stats";

type TCycleFile = {
  id: string;
  name: string;
  size: number;
  created_at: string;
};

const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
};

const sectionCard = "rounded-lg border border-subtle bg-surface-1";
const kpiCardBase =
  "rounded-lg border border-subtle bg-surface-1 px-4 py-5 transition-all duration-200 hover:border-primary/20 hover:shadow-sm";
const kpiIconShell = "grid h-11 w-11 flex-shrink-0 place-items-center rounded-sm bg-surface-2";
const kpiLabelClass = "text-sm font-medium text-primary";
const kpiValueNumberClass = "text-18 font-semibold text-primary";
const kpiValueUnitClass = "text-sm font-normal text-primary";

type KpiCardProps = {
  icon: React.ReactNode;
  label: string;
  value: number;
  iconColor?: string;
};

function KpiCard({ icon, label, value, iconColor }: KpiCardProps) {
  return (
    <div className={kpiCardBase}>
      <div className="flex items-center gap-2.5">
        <div className={kpiIconShell}>
          <span className={iconColor}>{icon}</span>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className={kpiLabelClass}>{label}</div>
          <div className="flex items-baseline gap-1">
            <span className={kpiValueNumberClass}>{value}</span>
            <span className={kpiValueUnitClass}>个</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const OVERVIEW_TABS = [
  { key: "stat-test-plans", label: "测试计划" },
  { key: "stat-assignees", i18n_title: "common.assignees" },
  { key: "stat-files", label: "文件" },
];

const validateCycleSnapshot = (cycleDetails: ICycle | null): ICycle | null => {
  if (!cycleDetails || cycleDetails === null) return cycleDetails;
  const updatedCycleDetails: any = { ...cycleDetails };
  if (!isEmpty(cycleDetails.progress_snapshot)) {
    Object.keys(cycleDetails.progress_snapshot || {}).forEach((key) => {
      const currentKey = key as keyof TProgressSnapshot;
      if (!isEmpty(cycleDetails.progress_snapshot) && !isEmpty(updatedCycleDetails)) {
        updatedCycleDetails[currentKey as keyof ICycle] = cycleDetails?.progress_snapshot?.[currentKey];
      }
    });
  }
  return updatedCycleDetails;
};

export const CycleOverviewContent = observer(function CycleOverviewContent(props: Props) {
  const { workspaceSlug, projectId, cycleId } = props;
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const peekCycle = searchParams.get("peekCycle") || undefined;
  const cycleService = useMemo(() => new CycleService(), []);
  const { getPlotTypeByCycleId, getEstimateTypeByCycleId, getCycleById } = useCycle();
  const { getUserDetails } = useMember();
  const { getFilter, updateFilterValueFromSidebar } = useWorkItemFilters();
  const { allowPermissions } = useUserPermissions();
  const [files, setFiles] = useState<TCycleFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesUploading, setFilesUploading] = useState(false);
  const [filesPage, setFilesPage] = useState(1);
  const [filesTotal, setFilesTotal] = useState(0);
  const [filesDownloadingId, setFilesDownloadingId] = useState<string | null>(null);
  const [filesDeletingId, setFilesDeletingId] = useState<string | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);
  const filesPageSize = 5;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [expandPanel, setExpandPanel] = useState<TOverviewExpandPanel>(null);
  const [cycleDescriptionModalOpen, setCycleDescriptionModalOpen] = useState(false);
  const [cycleDescriptionModalInitialEdit, setCycleDescriptionModalInitialEdit] = useState(false);
  const { storedValue: currentTab, setValue: setCurrentTab } = useLocalStorage(
    `cycle-overview-tab-${cycleId}`,
    "stat-test-plans"
  );

  useCyclesDetails({ workspaceSlug, projectId, cycleId });

  /** 当前迭代内延期工作项按负责人聚合（截止时间早于今天且未完成/未取消） */
  const { data: cycleOverdueByAssignee } = useSWR(
    workspaceSlug && projectId && cycleId
      ? `cycle-overdue-by-assignee-${workspaceSlug}-${projectId}-${cycleId}`
      : null,
    () => cycleService.getCycleOverdueByAssignee(workspaceSlug, projectId, cycleId)
  );

  const cycleFilter = getFilter(EIssuesStoreType.CYCLE, cycleId);
  const selectedAssignees = cycleFilter?.findFirstConditionByPropertyAndOperator("assignee_id", "in");

  const rawCycleDetails = getCycleById(cycleId);
  const cycleDetails = validateCycleSnapshot(rawCycleDetails);

  const totalIssues = cycleDetails?.total_issues ?? 0;
  const completedIssues = cycleDetails?.completed_issues ?? 0;
  const startedIssues = cycleDetails?.started_issues ?? 0;
  const backlogIssues = cycleDetails?.backlog_issues ?? 0;
  const cancelledIssues = cycleDetails?.cancelled_issues ?? 0;
  const unstartedIssues = cycleDetails?.unstarted_issues ?? 0;
  const progress = calculateCycleProgress(cycleDetails);

  const cycleStatus = cycleDetails?.status ?? "not_started";
  const statusInfo = CYCLE_STATUS.find((s) => s.value === cycleStatus);
  const cycleOwner = cycleDetails ? getUserDetails(cycleDetails.owned_by_id) : undefined;
  const startDate = getDate(cycleDetails?.start_date);
  const endDate = getDate(cycleDetails?.end_date);

  const plotType: TCyclePlotType = getPlotTypeByCycleId(cycleId);
  const estimateType = getEstimateTypeByCycleId(cycleId);
  const chartDistributionData =
    estimateType === "points" ? cycleDetails?.estimate_distribution : cycleDetails?.distribution || undefined;

  const cycleStartDate = getDate(cycleDetails?.start_date);
  const cycleEndDate = getDate(cycleDetails?.end_date);
  const isCycleStartDateValid = cycleStartDate && cycleStartDate <= new Date();
  const isCycleEndDateValid = cycleStartDate && cycleEndDate && cycleEndDate >= cycleStartDate;
  const isCycleDateValid = isCycleStartDateValid && isCycleEndDateValid;

  const selectedAssigneeIds = toFilterArray(selectedAssignees?.value || []) as string[];

  const currentDistribution = chartDistributionData as TCycleDistribution;
  const currentEstimateDistribution = chartDistributionData as TCycleEstimateDistribution;

  const distributionAssigneeData: TAssigneeData =
    plotType === "burndown"
      ? (currentDistribution?.assignees || []).map((assignee) => ({
          id: assignee?.assignee_id || undefined,
          title: assignee?.display_name || undefined,
          avatar_url: assignee?.avatar_url || undefined,
          completed: assignee.completed_issues,
          total: assignee.total_issues,
        }))
      : (currentEstimateDistribution?.assignees || []).map((assignee) => ({
          id: assignee?.assignee_id || undefined,
          title: assignee?.display_name || undefined,
          avatar_url: assignee?.avatar_url || undefined,
          completed: assignee.completed_estimates,
          total: assignee.total_estimates,
        }));

  const cyclePlans = useMemo(() => {
    const plans = cycleDetails?.plans;
    if (Array.isArray(plans)) return plans;
    if (plans && Array.isArray(plans.data)) return plans.data;
    return [];
  }, [cycleDetails?.plans]);

  const handleFiltersUpdate = updateFilterValueFromSidebar.bind(
    updateFilterValueFromSidebar,
    EIssuesStoreType.CYCLE,
    cycleId
  );
  const handleAssigneeFiltersUpdate = createFilterUpdateHandler("assignee_id", selectedAssigneeIds, handleFiltersUpdate);

  const isEditable = Boolean(!peekCycle) && cycleFilter !== undefined;
  const canEditCycleDescription =
    Boolean(!peekCycle) &&
    allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.PROJECT);

  const formatDate = (d: Date | null | undefined) => {
    if (!d) return "-";
    return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric", year: "numeric" });
  };

  const formatPlanDate = (value?: string | null) => {
    if (!value) return "-";
    const date = getDate(value);
    if (!date) return "-";
    return date.toLocaleDateString("zh-CN");
  };

  const getPassRate = (passRate: any) => {
    if (typeof passRate === "number") return `${passRate}%`;
    if (!passRate || typeof passRate !== "object") return "0%";
    const total = Object.values(passRate).reduce((sum, count) => sum + Number(count || 0), 0);
    const passed = Number(passRate?.["成功"] || passRate?.success || 0);
    const percent = total > 0 ? Math.floor((passed / total) * 100) : 0;
    return `${percent}%`;
  };

  const getPlanStatusClassName = (state?: string) => {
    if (state === "进行中") return "text-[#F59E0B]";
    if (state === "已完成") return "text-success-primary";
    if (state === "未开始") return "text-secondary";
    return "text-placeholder";
  };

  const normalizedOverviewTab =
    currentTab === "stat-states" ? "stat-assignees" : currentTab ?? "stat-test-plans";
  const activeOverviewTabKey = OVERVIEW_TABS.some((t) => t.key === normalizedOverviewTab)
    ? normalizedOverviewTab
    : "stat-test-plans";
  const overviewTabIndex = OVERVIEW_TABS.findIndex((tab) => tab.key === activeOverviewTabKey);

  const fetchFiles = async (page = 1) => {
    if (!workspaceSlug || !projectId || !cycleId) return;
    try {
      setFilesLoading(true);
      setFilesError(null);
      const response = await cycleService.getCycleFileList(workspaceSlug, projectId, cycleId, {
        page,
        page_size: filesPageSize,
      });
      const list = Array.isArray(response?.data) ? response.data : [];
      const count = Number(response?.count ?? 0);
      setFiles(
        list.map((file: any) => ({
          id: file.id,
          name: file.name,
          size: Number(file.size ?? 0),
          created_at: file.created_at,
        }))
      );
      setFilesTotal(count);
      setFilesPage(page);
    } catch (error: any) {
      setFilesError(error?.error || error?.detail || "获取迭代文件失败");
    } finally {
      setFilesLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles(1);
  }, [cycleId, cycleService, projectId, workspaceSlug]);

  const handleUploadCycleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile || !workspaceSlug || !projectId || !cycleId) return;

    try {
      setFilesUploading(true);
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("cycle_id", cycleId);
      await cycleService.uploadCycleFile(workspaceSlug, projectId, formData);
      await fetchFiles(1);
      setFilesError(null);
    } catch (error: any) {
      setFilesError(error?.error || error?.detail || "上传文件失败");
    } finally {
      setFilesUploading(false);
      event.target.value = "";
    }
  };

  const handleDownloadCycleFile = async (fileId: string, fileName: string) => {
    if (!workspaceSlug || !projectId) return;
    try {
      setFilesDownloadingId(fileId);
      const blob = await cycleService.downloadCycleFile(workspaceSlug, projectId, fileId);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch (error: any) {
      setFilesError(error?.error || error?.detail || "下载文件失败");
    } finally {
      setFilesDownloadingId(null);
    }
  };

  const handleDeleteCycleFile = async (fileId: string) => {
    if (!workspaceSlug || !projectId) return;
    try {
      setFilesDeletingId(fileId);
      await cycleService.deleteCycleFile(workspaceSlug, projectId, fileId);
      await fetchFiles(filesPage);
    } catch (error: any) {
      setFilesError(error?.error || error?.detail || "删除文件失败");
    } finally {
      setFilesDeletingId(null);
    }
  };

  if (!cycleDetails) {
    return (
      <div className="h-full w-full overflow-y-auto vertical-scrollbar scrollbar-sm">
        <div className="flex flex-col gap-5 px-6 py-4">
          <Loader className="max-w-xl">
            <Loader.Item height="16px" />
            <Loader.Item height="16px" />
            <Loader.Item height="16px" />
          </Loader>
        </div>
      </div>
    );
  }

  const statsExpandTitle =
    activeOverviewTabKey === "stat-test-plans"
      ? "测试计划"
      : activeOverviewTabKey === "stat-assignees"
        ? t("common.assignees")
        : "文件";

  const StatsExpandIcon =
    activeOverviewTabKey === "stat-test-plans"
      ? ClipboardList
      : activeOverviewTabKey === "stat-assignees"
        ? MembersPropertyIcon
        : WorkItemsIcon;

  return (
    <div className="h-full w-full overflow-y-auto vertical-scrollbar scrollbar-sm">
      <div className="flex flex-col gap-5 px-6 py-4">
        {/* Header: cycle name + meta */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center gap-3">
            <CircularProgressIndicator size={48} percentage={progress} strokeWidth={4}>
              {progress === 100 ? (
                <CheckIcon className="h-4 w-4 stroke-2 text-primary" />
              ) : (
                <span className="text-16 font-medium tabular-nums leading-none text-primary">{`${progress}%`}</span>
              )}
            </CircularProgressIndicator>
            <div className="min-w-0">
              <h1 className="shrink-0 text-lg font-normal text-primary">{cycleDetails.name || "概览"}</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {statusInfo && (
              <span
                className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium"
                style={{ color: statusInfo.color, backgroundColor: `${statusInfo.color}20` }}
              >
                {t(statusInfo.i18n_title)}
              </span>
            )}
            {startDate && endDate && (
              <span className="inline-flex items-center gap-1.5 text-sm text-placeholder">
                <CalendarDays className="h-3.5 w-3.5 text-placeholder" />
                {formatDate(startDate)}
                <ArrowRight className="h-3 w-3 text-placeholder" />
                {formatDate(endDate)}
              </span>
            )}
            {cycleOwner && (
              <span className="inline-flex items-center gap-1.5 text-sm text-placeholder">
                <SquareUser className="h-3.5 w-3.5 text-placeholder" />
                <Avatar size="sm" name={cycleOwner.display_name} src={getFileURL(cycleOwner.avatar_url ?? "")} />
                <span>{cycleOwner.display_name}</span>
              </span>
            )}
            {cycleDetails.assignee_ids && cycleDetails.assignee_ids.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-sm text-placeholder">
                <MembersPropertyIcon className="h-3.5 w-3.5 text-placeholder" />
                <AvatarGroup showTooltip>
                  {cycleDetails.assignee_ids.map((id) => {
                    const m = getUserDetails(id);
                    return <Avatar key={id} name={m?.display_name ?? ""} src={getFileURL(m?.avatar_url ?? "")} />;
                  })}
                </AvatarGroup>
                <span>{cycleDetails.assignee_ids.length} {t("members")}</span>
              </span>
            )}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard
            icon={<Layers className="h-5 w-5" />}
            label={t("work_items")}
            value={totalIssues}
            iconColor="text-[#3f76ff]"
          />
          <KpiCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            label="已完成"
            value={completedIssues}
            iconColor="text-success-primary"
          />
          <KpiCard
            icon={<PlayCircle className="h-5 w-5" />}
            label="进行中"
            value={startedIssues}
            iconColor="text-[#F59E0B]"
          />
          <KpiCard
            icon={<Circle className="h-5 w-5" />}
            label="未开始"
            value={unstartedIssues}
            iconColor="text-[#64748b]"
          />
          <KpiCard
            icon={<Clock className="h-5 w-5" />}
            label="待处理"
            value={backlogIssues}
            iconColor="text-[#6366f1]"
          />
          <KpiCard
            icon={<XCircle className="h-5 w-5" />}
            label="已取消"
            value={cancelledIssues}
            iconColor="text-danger-primary"
          />
        </div>

        {/* 迭代描述 + 延期负责人：置于 KPI 行下方，一行两个 card */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className={`${sectionCard} flex h-[420px] min-h-0 flex-col overflow-hidden p-4`}>
            <div className="mb-3 flex flex-shrink-0 items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-placeholder" />
                <span className="text-sm font-medium text-primary">迭代描述</span>
              </div>
              <div className="flex min-w-0 shrink-0 items-center gap-1">
                {canEditCycleDescription ? (
                  <button
                    type="button"
                    className="cursor-pointer rounded-md p-1 text-placeholder transition-colors hover:bg-surface-2 hover:text-primary"
                    onClick={() => {
                      setCycleDescriptionModalInitialEdit(true);
                      setCycleDescriptionModalOpen(true);
                    }}
                    aria-label="编辑迭代描述"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded transition-colors hover:bg-surface-2"
                  onClick={() => {
                    setCycleDescriptionModalInitialEdit(false);
                    setCycleDescriptionModalOpen(true);
                  }}
                  aria-label="放大"
                >
                  <Maximize2 className="h-3.5 w-3.5 text-placeholder" />
                </button>
              </div>
            </div>
            {cycleDetails.description ? (
              <div className="relative min-h-0 flex-1">
                <div className="absolute inset-0 overflow-y-auto pr-1 vertical-scrollbar scrollbar-sm">
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-secondary">
                    {cycleDetails.description}
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 place-items-center text-sm text-placeholder">暂无迭代描述</div>
            )}
          </div>

          <OverdueByAssigneeCard
            data={cycleOverdueByAssignee}
            title="延期工作项负责人"
            subtitle=""
            headerExtra={
              <button
                type="button"
                className="grid h-6 w-6 shrink-0 place-items-center rounded transition-colors hover:bg-surface-2"
                onClick={() => setExpandPanel("overdue")}
                aria-label="放大"
              >
                <Maximize2 className="h-3.5 w-3.5 text-placeholder" />
              </button>
            }
          />
        </div>

        {/* Chart + Stats side by side */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Left: Burndown chart */}
          <div className={`${sectionCard} flex flex-col p-4`}>
            <div className="mb-2 text-sm font-medium text-primary">
              {t("project_cycles.active_cycle.progress")}
            </div>
            {cycleStartDate && cycleEndDate && isCycleDateValid ? (
              <SidebarChartRoot workspaceSlug={workspaceSlug} projectId={projectId} cycleId={cycleId} />
            ) : (
              <div className="grid h-[320px] place-items-center text-sm text-placeholder">
                {t("no_data_yet")}
              </div>
            )}
          </div>

          {/* Right: Stats tabs (测试计划 / 负责人 / 文件) */}
          <div className={`${sectionCard} flex flex-col p-4`}>
            <Tab.Group
              selectedIndex={overviewTabIndex >= 0 ? overviewTabIndex : 0}
              onChange={(index) => {
                const nextTab = OVERVIEW_TABS[index]?.key;
                if (nextTab) setCurrentTab(nextTab);
              }}
            >
              <div className="flex w-full flex-shrink-0 items-center gap-1">
                <Tab.List
                  as="div"
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md bg-layer-2 p-1 text-11"
                >
                  {OVERVIEW_TABS.map((tab) => (
                    <Tab
                      className={cn(
                        "w-full cursor-pointer rounded-sm p-1 text-primary transition-all outline-none focus:outline-none",
                        tab.key === activeOverviewTabKey
                          ? "bg-layer-transparent-active text-secondary"
                          : "text-placeholder hover:text-secondary"
                      )}
                      key={tab.key}
                    >
                      {tab.label ?? t(tab.i18n_title!)}
                    </Tab>
                  ))}
                </Tab.List>
                <button
                  type="button"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded transition-colors hover:bg-surface-2"
                  onClick={() => setExpandPanel("stats")}
                  aria-label="放大"
                >
                  <Maximize2 className="h-3.5 w-3.5 text-placeholder" />
                </button>
              </div>
              <Tab.Panels className="min-h-0 flex-1 py-3 text-secondary">
                <Tab.Panel key="stat-test-plans" className="flex h-full min-h-0 flex-col">
                  {cyclePlans.length === 0 ? (
                    <div className="grid h-32 place-items-center text-sm text-placeholder">暂无关联测试计划</div>
                  ) : (
                    <div className="flex h-full min-h-0 flex-col">
                      <div className="min-h-0 flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm">
                        <table className="min-w-full table-fixed">
                          <thead>
                            <tr className="border-b border-subtle text-left text-xs text-secondary">
                              <th className="w-[34%] px-2 py-2">名称</th>
                              <th className="w-[14%] px-2 py-2">状态</th>
                              <th className="w-[14%] px-2 py-2">通过率</th>
                              <th className="w-[19%] px-2 py-2">开始时间</th>
                              <th className="w-[19%] px-2 py-2">结束时间</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cyclePlans.map((plan: any) => (
                              <tr key={plan.id ?? plan.name} className="border-b border-subtle hover:bg-layer-1">
                                <td className="truncate px-2 py-2 text-sm text-primary" title={plan.name ?? "-"}>
                                  {plan.name ?? "-"}
                                </td>
                                <td className={`px-2 py-2 text-sm ${getPlanStatusClassName(plan.state)}`}>
                                  {plan.state ?? "-"}
                                </td>
                                <td className="px-2 py-2 text-sm text-primary">{getPassRate(plan.pass_rate)}</td>
                                <td className="px-2 py-2 text-sm text-primary">
                                  {formatPlanDate(plan.start_date ?? plan.start_at ?? null)}
                                </td>
                                <td className="px-2 py-2 text-sm text-primary">
                                  {formatPlanDate(plan.end_date ?? plan.end_at ?? null)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </Tab.Panel>
                <Tab.Panel key="stat-assignees" className="h-full overflow-y-auto vertical-scrollbar scrollbar-sm">
                  {chartDistributionData ? (
                    <AssigneeStatComponent
                      distribution={distributionAssigneeData}
                      handleAssigneeFiltersUpdate={handleAssigneeFiltersUpdate}
                      isEditable={isEditable}
                      selectedAssigneeIds={selectedAssigneeIds}
                    />
                  ) : (
                    <div className="grid h-32 place-items-center text-sm text-placeholder">{t("no_data_yet")}</div>
                  )}
                </Tab.Panel>
                <Tab.Panel key="stat-files" className="flex h-full min-h-0 flex-col">
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-xs font-medium text-secondary">文件</span>
                    <Button
                      variant="link-neutral"
                      className="p-0"
                      onClick={() => fileInputRef.current?.click()}
                      loading={filesUploading}
                      disabled={filesUploading}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleUploadCycleFile} />
                  </div>

                  {filesLoading ? (
                    <div className="flex items-center justify-center py-8 text-sm text-secondary">加载中...</div>
                  ) : filesError ? (
                    <p className="text-sm text-danger-primary">{filesError}</p>
                  ) : files.length === 0 ? (
                    <div className="grid h-32 place-items-center text-sm text-placeholder">暂无文件</div>
                  ) : (
                    <div className="flex h-full min-h-0 flex-1 flex-col">
                      <div className="min-h-0 flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm">
                        <div className="overflow-x-auto">
                          <table className="min-w-full table-fixed">
                            <thead>
                              <tr className="border-b border-subtle text-left text-xs text-secondary">
                                <th className="w-2/5 px-2 py-2">文件名</th>
                                <th className="w-1/5 px-2 py-2">大小</th>
                                <th className="w-2/5 px-2 py-2">上传时间</th>
                                <th className="w-1/5 px-2 py-2 text-left">操作</th>
                              </tr>
                            </thead>
                            <tbody>
                              {files.map((file) => (
                                <tr key={file.id} className="border-b border-subtle hover:bg-layer-1">
                                  <td className="truncate px-2 py-2 text-sm text-primary" title={file.name}>
                                    <div className="flex items-center gap-2">
                                      <WorkItemsIcon className="h-4 w-4 flex-shrink-0 text-placeholder" />
                                      <span className="truncate">{file.name}</span>
                                    </div>
                                  </td>
                                  <td className="px-2 py-2 text-sm text-primary">{formatFileSize(file.size)}</td>
                                  <td className="px-2 py-2 text-sm text-primary">
                                    {file.created_at ? new Date(file.created_at).toLocaleDateString() : "-"}
                                  </td>
                                  <td className="px-2 py-2">
                                    <div className="flex items-center justify-end gap-2">
                                      <Button
                                        variant="link-neutral"
                                        className="p-0"
                                        disabled={filesDownloadingId === file.id}
                                        onClick={() => handleDownloadCycleFile(file.id, file.name)}
                                      >
                                        <Download className="h-3.5 w-3.5" />
                                      </Button>
                                      <Popconfirm
                                        title="确认删除该文件？"
                                        okText="删除"
                                        cancelText="取消"
                                        onConfirm={() => void handleDeleteCycleFile(file.id)}
                                      >
                                        <Button
                                          variant="link-danger"
                                          className="p-0"
                                          disabled={filesDeletingId === file.id}
                                          loading={filesDeletingId === file.id}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </Popconfirm>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-2 py-2">
                        <div className="text-sm text-secondary">{filesTotal > 0 ? `共 ${filesTotal} 条` : ""}</div>
                        <Pagination
                          simple
                          current={filesPage}
                          pageSize={filesPageSize}
                          total={filesTotal}
                          onChange={(p) => fetchFiles(p)}
                          size="small"
                        />
                      </div>
                    </div>
                  )}
                </Tab.Panel>
              </Tab.Panels>
            </Tab.Group>
          </div>
        </div>
      </div>

      <CycleDescriptionFullscreenModal
        isOpen={cycleDescriptionModalOpen}
        onClose={() => {
          setCycleDescriptionModalOpen(false);
          setCycleDescriptionModalInitialEdit(false);
        }}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        cycleId={cycleId}
        description={cycleDetails.description}
        canEdit={canEditCycleDescription}
        initialEditing={cycleDescriptionModalInitialEdit}
      />

      <CycleOverviewFullscreenModal
        isOpen={expandPanel === "overdue"}
        onClose={() => setExpandPanel(null)}
        title="延期工作项负责人"
        badgeText={cycleOverdueByAssignee != null ? `共 ${cycleOverdueByAssignee.total} 条` : undefined}
        icon={AlertTriangle}
      >
        <div className="flex min-h-0 flex-1 flex-col bg-surface-1">
          <div className="min-h-0 flex-1 overflow-hidden px-4 pb-3">
            <OverdueByAssigneeCard hideHeader data={cycleOverdueByAssignee} className="h-full min-h-[50vh]" />
          </div>
        </div>
      </CycleOverviewFullscreenModal>

      <CycleOverviewFullscreenModal
        isOpen={expandPanel === "stats"}
        onClose={() => setExpandPanel(null)}
        title={statsExpandTitle}
        icon={StatsExpandIcon}
      >
        <div className="flex min-h-0 flex-1 flex-col bg-surface-1">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 vertical-scrollbar scrollbar-sm">
            {activeOverviewTabKey === "stat-test-plans" ? (
              cyclePlans.length === 0 ? (
                <div className="grid h-32 place-items-center text-sm text-placeholder">暂无关联测试计划</div>
              ) : (
                <table className="min-w-full table-fixed">
                  <thead>
                    <tr className="border-b border-subtle text-left text-xs text-secondary">
                      <th className="w-[34%] px-2 py-2">名称</th>
                      <th className="w-[14%] px-2 py-2">状态</th>
                      <th className="w-[14%] px-2 py-2">通过率</th>
                      <th className="w-[19%] px-2 py-2">开始时间</th>
                      <th className="w-[19%] px-2 py-2">结束时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cyclePlans.map((plan: any) => (
                      <tr key={plan.id ?? plan.name} className="border-b border-subtle hover:bg-layer-1">
                        <td className="truncate px-2 py-2 text-sm text-primary" title={plan.name ?? "-"}>
                          {plan.name ?? "-"}
                        </td>
                        <td className={`px-2 py-2 text-sm ${getPlanStatusClassName(plan.state)}`}>
                          {plan.state ?? "-"}
                        </td>
                        <td className="px-2 py-2 text-sm text-primary">{getPassRate(plan.pass_rate)}</td>
                        <td className="px-2 py-2 text-sm text-primary">
                          {formatPlanDate(plan.start_date ?? plan.start_at ?? null)}
                        </td>
                        <td className="px-2 py-2 text-sm text-primary">
                          {formatPlanDate(plan.end_date ?? plan.end_at ?? null)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            ) : activeOverviewTabKey === "stat-assignees" ? (
              chartDistributionData ? (
                <AssigneeStatComponent
                  distribution={distributionAssigneeData}
                  handleAssigneeFiltersUpdate={handleAssigneeFiltersUpdate}
                  isEditable={isEditable}
                  selectedAssigneeIds={selectedAssigneeIds}
                />
              ) : (
                <div className="grid h-32 place-items-center text-sm text-placeholder">{t("no_data_yet")}</div>
              )
            ) : filesLoading ? (
              <div className="flex items-center justify-center py-8 text-sm text-secondary">加载中...</div>
            ) : filesError ? (
              <p className="text-sm text-danger-primary">{filesError}</p>
            ) : files.length === 0 ? (
              <div className="grid h-32 place-items-center text-sm text-placeholder">暂无文件</div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between pb-2">
                  <span className="text-xs font-medium text-secondary">文件</span>
                  <Button
                    variant="link-neutral"
                    className="p-0"
                    onClick={() => fileInputRef.current?.click()}
                    loading={filesUploading}
                    disabled={filesUploading}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm">
                  <div className="overflow-x-auto">
                    <table className="min-w-full table-fixed">
                      <thead>
                        <tr className="border-b border-subtle text-left text-xs text-secondary">
                          <th className="w-2/5 px-2 py-2">文件名</th>
                          <th className="w-1/5 px-2 py-2">大小</th>
                          <th className="w-2/5 px-2 py-2">上传时间</th>
                          <th className="w-1/5 px-2 py-2 text-left">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {files.map((file) => (
                          <tr key={file.id} className="border-b border-subtle hover:bg-layer-1">
                            <td className="truncate px-2 py-2 text-sm text-primary" title={file.name}>
                              <div className="flex items-center gap-2">
                                <WorkItemsIcon className="h-4 w-4 flex-shrink-0 text-placeholder" />
                                <span className="truncate">{file.name}</span>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-sm text-primary">{formatFileSize(file.size)}</td>
                            <td className="px-2 py-2 text-sm text-primary">
                              {file.created_at ? new Date(file.created_at).toLocaleDateString() : "-"}
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="link-neutral"
                                  className="p-0"
                                  disabled={filesDownloadingId === file.id}
                                  onClick={() => handleDownloadCycleFile(file.id, file.name)}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                                <Popconfirm
                                  title="确认删除该文件？"
                                  okText="删除"
                                  cancelText="取消"
                                  onConfirm={() => void handleDeleteCycleFile(file.id)}
                                >
                                  <Button
                                    variant="link-danger"
                                    className="p-0"
                                    disabled={filesDeletingId === file.id}
                                    loading={filesDeletingId === file.id}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </Popconfirm>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="mt-2 flex flex-shrink-0 items-center justify-between border-t border-subtle bg-surface-1 px-2 py-2">
                  <div className="text-sm text-secondary">{filesTotal > 0 ? `共 ${filesTotal} 条` : ""}</div>
                  <Pagination
                    simple
                    current={filesPage}
                    pageSize={filesPageSize}
                    total={filesTotal}
                    onChange={(p) => fetchFiles(p)}
                    size="small"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </CycleOverviewFullscreenModal>
    </div>
  );
});
