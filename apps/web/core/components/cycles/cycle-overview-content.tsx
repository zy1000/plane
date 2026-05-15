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
import { useRouter, useSearchParams } from "next/navigation";
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
  LineChart,
  Pencil,
  Unlink,
} from "lucide-react";
import { Modal, Popconfirm } from "antd";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CYCLE_STATUS, EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { CheckIcon, MembersPropertyIcon } from "@plane/propel/icons";
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
  { key: "stat-test-plans", label: "测试计划", Icon: ClipboardList },
  { key: "stat-assignees", i18n_title: "common.assignees", Icon: MembersPropertyIcon },
  { key: "stat-files", label: "附件", Icon: FileText },
] as const;

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const peekCycle = searchParams.get("peekCycle") || undefined;
  const cycleService = useMemo(() => new CycleService(), []);
  const { getPlotTypeByCycleId, getEstimateTypeByCycleId, getCycleById, fetchCycleDetails } = useCycle();
  const { getUserDetails } = useMember();
  const { getFilter, updateFilterValueFromSidebar } = useWorkItemFilters();
  const { allowPermissions } = useUserPermissions();
  const [files, setFiles] = useState<TCycleFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesUploading, setFilesUploading] = useState(false);
  const [filesTotal, setFilesTotal] = useState(0);
  const [filesDownloadingId, setFilesDownloadingId] = useState<string | null>(null);
  const [filesDeletingId, setFilesDeletingId] = useState<string | null>(null);
  const [filesError, setFilesError] = useState<string | null>(null);
  /** 与后端 CustomPaginator.max_page_size 一致；单次请求上限，多页循环拉取直至全部 */
  const CYCLE_FILES_FETCH_PAGE_SIZE = 100;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [expandPanel, setExpandPanel] = useState<TOverviewExpandPanel>(null);
  const [cycleDescriptionModalOpen, setCycleDescriptionModalOpen] = useState(false);
  const [cycleDescriptionModalInitialEdit, setCycleDescriptionModalInitialEdit] = useState(false);

  const [planAssociateOpen, setPlanAssociateOpen] = useState(false);
  const [selectablePlans, setSelectablePlans] = useState<any[]>([]);
  const [selectablePlansLoading, setSelectablePlansLoading] = useState(false);
  const [selectablePlansError, setSelectablePlansError] = useState<string | null>(null);
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [associatingPlans, setAssociatingPlans] = useState(false);
  const [cancelingPlanId, setCancelingPlanId] = useState<string | null>(null);
  const { storedValue: currentTab, setValue: setCurrentTab } = useLocalStorage(
    `cycle-overview-tab-${cycleId}`,
    "stat-test-plans"
  );

  useEffect(() => {
    if (!cycleId) return;
    setCurrentTab("stat-test-plans");
  }, [cycleId, setCurrentTab]);

  useCyclesDetails({ workspaceSlug, projectId, cycleId });

  /** 当前迭代内延期工作项按负责人聚合（截止时间早于今天且未完成/未取消） */
  const { data: cycleOverdueByAssignee } = useSWR(
    workspaceSlug && projectId && cycleId
      ? `cycle-overdue-by-assignee-${workspaceSlug}-${projectId}-${cycleId}`
      : null,
    () => cycleService.getCycleOverdueByAssignee(workspaceSlug, projectId, cycleId)
  );

  /** 当前迭代已关联的测试计划（独立拉取，便于关联/取消关联后即时刷新） */
  const { data: cyclePlansResp, mutate: mutateCyclePlans } = useSWR(
    workspaceSlug && projectId && cycleId
      ? `cycle-plans-${workspaceSlug}-${projectId}-${cycleId}`
      : null,
    () => cycleService.getCyclePlans(workspaceSlug, projectId, cycleId)
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
    if (cyclePlansResp && Array.isArray(cyclePlansResp.data)) return cyclePlansResp.data;
    const plans = cycleDetails?.plans;
    if (Array.isArray(plans)) return plans;
    if (plans && Array.isArray((plans as any).data)) return (plans as any).data;
    return [];
  }, [cyclePlansResp, cycleDetails?.plans]);

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

  const overviewTabCounts: Record<(typeof OVERVIEW_TABS)[number]["key"], number> = {
    "stat-test-plans": cyclePlans.length,
    "stat-assignees": chartDistributionData ? distributionAssigneeData.length : 0,
    "stat-files": filesTotal,
  };

  const fetchFiles = async () => {
    if (!workspaceSlug || !projectId || !cycleId) return;
    try {
      setFilesLoading(true);
      setFilesError(null);
      const aggregated: TCycleFile[] = [];
      let total = 0;
      let page = 1;
      for (;;) {
        const response = await cycleService.getCycleFileList(workspaceSlug, projectId, cycleId, {
          page,
          page_size: CYCLE_FILES_FETCH_PAGE_SIZE,
        });
        const list = Array.isArray(response?.data) ? response.data : [];
        total = Number(response?.count ?? total);
        for (const file of list as any[]) {
          aggregated.push({
            id: file.id,
            name: file.name,
            size: Number(file.size ?? 0),
            created_at: file.created_at,
          });
        }
        if (list.length === 0 || list.length < CYCLE_FILES_FETCH_PAGE_SIZE || aggregated.length >= total) {
          break;
        }
        page += 1;
      }
      setFiles(aggregated);
      setFilesTotal(total);
    } catch (error: any) {
      setFilesError(error?.error || error?.detail || "获取迭代文件失败");
    } finally {
      setFilesLoading(false);
    }
  };

  useEffect(() => {
    void fetchFiles();
  }, [cycleId, cycleService, projectId, workspaceSlug]);

  const handleUploadCycleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile || !workspaceSlug || !projectId || !cycleId) return;

    try {
      setFilesUploading(true);
      await cycleService.uploadCycleFile(workspaceSlug, projectId, cycleId, selectedFile);
      await fetchFiles();
      setFilesError(null);
    } catch (error: any) {
      setFilesError(error?.error || error?.detail || "上传文件失败");
    } finally {
      setFilesUploading(false);
      event.target.value = "";
    }
  };

  const handleDownloadCycleFile = async (fileId: string, _fileName: string) => {
    if (!workspaceSlug || !projectId) return;
    try {
      setFilesDownloadingId(fileId);
      const url = await cycleService.downloadCycleFile(workspaceSlug, projectId, fileId);
      window.open(url, "_blank", "noopener,noreferrer");
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
      await fetchFiles();
    } catch (error: any) {
      setFilesError(error?.error || error?.detail || "删除文件失败");
    } finally {
      setFilesDeletingId(null);
    }
  };

  const refreshCycleDetails = () => {
    if (!workspaceSlug || !projectId || !cycleId) return;
    void mutateCyclePlans();
    void fetchCycleDetails(workspaceSlug, projectId, cycleId);
  };

  const openPlanAssociateModal = async () => {
    if (!workspaceSlug || !projectId || !cycleId) return;
    setPlanAssociateOpen(true);
    setSelectedPlanIds([]);
    setSelectablePlansLoading(true);
    setSelectablePlansError(null);
    try {
      const res = await cycleService.getCycleSelectablePlans(workspaceSlug, projectId, cycleId);
      setSelectablePlans(Array.isArray(res?.data) ? res.data : []);
    } catch (error: any) {
      setSelectablePlansError(error?.error || error?.detail || "获取可选测试计划失败");
      setSelectablePlans([]);
    } finally {
      setSelectablePlansLoading(false);
    }
  };

  const handleConfirmAssociatePlans = async () => {
    if (!workspaceSlug || !projectId || !cycleId || selectedPlanIds.length === 0) return;
    try {
      setAssociatingPlans(true);
      await cycleService.associateCyclePlans(workspaceSlug, projectId, cycleId, selectedPlanIds);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "关联成功",
        message: `已关联 ${selectedPlanIds.length} 个测试计划`,
      });
      setPlanAssociateOpen(false);
      setSelectedPlanIds([]);
      refreshCycleDetails();
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "关联失败",
        message: error?.error || error?.detail || "请稍后重试",
      });
    } finally {
      setAssociatingPlans(false);
    }
  };

  const handleCancelPlanAssociation = async (planId: string) => {
    if (!workspaceSlug || !projectId || !cycleId) return;
    try {
      setCancelingPlanId(planId);
      await cycleService.cancelCyclePlanAssociation(workspaceSlug, projectId, cycleId, [planId]);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "已取消关联",
        message: "测试计划已取消关联",
      });
      refreshCycleDetails();
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "操作失败",
        message: error?.error || error?.detail || "请稍后重试",
      });
    } finally {
      setCancelingPlanId(null);
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
        : "附件";

  const StatsExpandIcon =
    activeOverviewTabKey === "stat-test-plans"
      ? ClipboardList
      : activeOverviewTabKey === "stat-assignees"
        ? MembersPropertyIcon
        : FileText;

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
            <div className="mb-2 flex items-center gap-2">
              <LineChart className="h-3.5 w-3.5 shrink-0 text-placeholder" aria-hidden />
              <span className="text-sm font-medium text-primary">{t("project_cycles.active_cycle.progress")}</span>
            </div>
            {cycleStartDate && cycleEndDate && isCycleDateValid ? (
              <SidebarChartRoot workspaceSlug={workspaceSlug} projectId={projectId} cycleId={cycleId} />
            ) : (
              <div className="grid h-[320px] place-items-center text-sm text-placeholder">
                {t("no_data_yet")}
              </div>
            )}
          </div>

          {/* Right: Stats tabs (测试计划 / 负责人 / 附件) */}
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
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md bg-layer-2 p-1 text-sm font-medium"
                >
                  {OVERVIEW_TABS.map((tab) => {
                    const TabIcon = tab.Icon;
                    return (
                      <Tab
                        key={tab.key}
                        className={({ selected }) =>
                          cn(
                            "w-full cursor-pointer rounded-sm p-1 text-primary transition-all outline-none focus:outline-none",
                            "flex items-center justify-center gap-1.5",
                            selected
                              ? "bg-layer-transparent-active text-secondary"
                              : "text-placeholder hover:text-secondary"
                          )
                        }
                      >
                        <TabIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="min-w-0 truncate">{tab.label ?? t(tab.i18n_title)}</span>
                        <span className="shrink-0 text-placeholder">{overviewTabCounts[tab.key]}</span>
                      </Tab>
                    );
                  })}
                </Tab.List>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className={cn(
                      "grid h-6 w-6 shrink-0 place-items-center rounded transition-colors hover:bg-surface-2",
                      activeOverviewTabKey === "stat-assignees" && "pointer-events-none invisible"
                    )}
                    onClick={() => {
                      if (activeOverviewTabKey === "stat-test-plans") {
                        void openPlanAssociateModal();
                      } else if (activeOverviewTabKey === "stat-files") {
                        if (!filesUploading) fileInputRef.current?.click();
                      }
                    }}
                    disabled={activeOverviewTabKey === "stat-files" && filesUploading}
                    aria-hidden={activeOverviewTabKey === "stat-assignees"}
                    tabIndex={activeOverviewTabKey === "stat-assignees" ? -1 : 0}
                    aria-label={
                      activeOverviewTabKey === "stat-test-plans"
                        ? "关联测试计划"
                        : activeOverviewTabKey === "stat-files"
                          ? "上传附件"
                          : undefined
                    }
                  >
                    <Plus className="h-4 w-4 text-placeholder" />
                  </button>
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleUploadCycleFile} />
                  <button
                    type="button"
                    className="grid h-6 w-6 shrink-0 place-items-center rounded transition-colors hover:bg-surface-2"
                    onClick={() => setExpandPanel("stats")}
                    aria-label="放大"
                  >
                    <Maximize2 className="h-3.5 w-3.5 text-placeholder" />
                  </button>
                </div>
              </div>
              <Tab.Panels className="min-h-0 flex-1 py-3 text-secondary">
                <Tab.Panel key="stat-test-plans" className="flex h-full min-h-0 flex-col">
                  {cyclePlans.length === 0 ? (
                    <div className="grid min-h-0 flex-1 place-items-center text-sm text-placeholder">暂无关联测试计划</div>
                  ) : (
                    <div className="flex h-full min-h-0 flex-col">
                      <div className="min-h-0 max-h-[min(360px,50vh)] flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm">
                        <table className="min-w-full table-fixed">
                          <thead>
                            <tr className="text-left text-xs text-secondary [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface-1 [&>th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
                              <th className="w-1/6 px-2 py-2 text-sm font-medium text-primary">测试计划</th>
                              <th className="w-1/6 px-2 py-2 text-sm font-medium text-primary">状态</th>
                              <th className="w-1/6 px-2 py-2 text-sm font-medium text-primary">通过率</th>
                              <th className="w-1/6 px-2 py-2 text-sm font-medium text-primary">开始时间</th>
                              <th className="w-1/6 px-2 py-2 text-sm font-medium text-primary">结束时间</th>
                              <th className="w-1/6 px-2 py-2 text-left text-sm font-medium text-primary">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cyclePlans.map((plan: any) => (
                              <tr key={plan.id ?? plan.name} className="border-b border-subtle hover:bg-layer-1">
                                <td className="truncate px-2 py-2 text-sm text-primary" title={plan.name ?? "-"}>
                                  {plan.id ? (
                                    <button
                                      type="button"
                                      className="truncate text-left text-sm text-primary hover:underline"
                                      onClick={() =>
                                        router.push(
                                          `/${workspaceSlug}/projects/${projectId}/testhub/plan-cases?planId=${plan.id}`
                                        )
                                      }
                                    >
                                      {plan.name ?? "-"}
                                    </button>
                                  ) : (
                                    plan.name ?? "-"
                                  )}
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
                                <td className="px-2 py-2 text-left">
                                  <Popconfirm
                                    title="确定取消该测试计划的关联吗？"
                                    okText="取消关联"
                                    cancelText="取消"
                                    onConfirm={() => void handleCancelPlanAssociation(plan.id)}
                                  >
                                    <Button
                                      variant="link-neutral"
                                      className="p-0"
                                      loading={cancelingPlanId === plan.id}
                                      disabled={cancelingPlanId === plan.id}
                                      aria-label="取消关联"
                                    >
                                      <Unlink className="h-3.5 w-3.5" />
                                    </Button>
                                  </Popconfirm>
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
                    <div className="grid min-h-0 h-full place-items-center text-sm text-placeholder">{t("no_data_yet")}</div>
                  )}
                </Tab.Panel>
                <Tab.Panel key="stat-files" className="flex h-full min-h-0 flex-col">
                  {filesLoading ? (
                    <div className="flex items-center justify-center py-8 text-sm text-secondary">加载中...</div>
                  ) : filesError ? (
                    <p className="text-sm text-danger-primary">{filesError}</p>
                  ) : files.length === 0 ? (
                    <div className="grid min-h-0 flex-1 place-items-center text-sm text-placeholder">暂无附件</div>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col">
                      <div className="min-h-0 max-h-[min(360px,50vh)] flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm">
                        <div className="overflow-x-auto">
                          <table className="min-w-full table-fixed">
                            <thead>
                              <tr className="text-left text-xs text-secondary [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface-1 [&>th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
                                <th className="w-1/4 px-2 py-2 text-sm font-medium text-primary">附件</th>
                                <th className="w-1/4 px-2 py-2 text-sm font-medium text-primary">大小</th>
                                <th className="w-1/4 px-2 py-2 text-sm font-medium text-primary">上传时间</th>
                                <th className="w-1/4 px-2 py-2 text-left text-sm font-medium text-primary">操作</th>
                              </tr>
                            </thead>
                            <tbody>
                              {files.map((file) => (
                                <tr key={file.id} className="border-b border-subtle hover:bg-layer-1">
                                  <td className="truncate px-2 py-2 text-sm text-primary" title={file.name}>
                                    <span className="truncate">{file.name}</span>
                                  </td>
                                  <td className="px-2 py-2 text-sm text-primary">{formatFileSize(file.size)}</td>
                                  <td className="px-2 py-2 text-sm text-primary">
                                    {file.created_at ? new Date(file.created_at).toLocaleDateString() : "-"}
                                  </td>
                                  <td className="px-2 py-2 text-left">
                                    <div className="flex items-center justify-start gap-2">
                                      <Button
                                        variant="link-neutral"
                                        className="p-0"
                                        disabled={filesDownloadingId === file.id}
                                        onClick={() => handleDownloadCycleFile(file.id, file.name)}
                                      >
                                        <Download className="h-3.5 w-3.5" />
                                      </Button>
                                      <Popconfirm
                                        title="确认删除该附件？"
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
              <div className="flex flex-col">
                <div className="flex items-center justify-end pb-2">
                  <Button
                    variant="link-neutral"
                    className="p-0"
                    onClick={openPlanAssociateModal}
                    aria-label="关联测试计划"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {cyclePlans.length === 0 ? (
                  <div className="grid h-32 place-items-center text-sm text-placeholder">暂无关联测试计划</div>
                ) : (
                  <table className="min-w-full table-fixed">
                    <thead>
                      <tr className="text-left text-xs text-secondary [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface-1 [&>th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
                        <th className="w-1/6 px-2 py-2 text-sm font-medium text-primary">测试计划</th>
                        <th className="w-1/6 px-2 py-2 text-sm font-medium text-primary">状态</th>
                        <th className="w-1/6 px-2 py-2 text-sm font-medium text-primary">通过率</th>
                        <th className="w-1/6 px-2 py-2 text-sm font-medium text-primary">开始时间</th>
                        <th className="w-1/6 px-2 py-2 text-sm font-medium text-primary">结束时间</th>
                        <th className="w-1/6 px-2 py-2 text-left text-sm font-medium text-primary">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cyclePlans.map((plan: any) => (
                        <tr key={plan.id ?? plan.name} className="border-b border-subtle hover:bg-layer-1">
                          <td className="truncate px-2 py-2 text-sm text-primary" title={plan.name ?? "-"}>
                            {plan.id ? (
                              <button
                                type="button"
                                className="truncate text-left text-sm text-primary hover:underline"
                                onClick={() =>
                                  router.push(
                                    `/${workspaceSlug}/projects/${projectId}/testhub/plan-cases?planId=${plan.id}`
                                  )
                                }
                              >
                                {plan.name ?? "-"}
                              </button>
                            ) : (
                              plan.name ?? "-"
                            )}
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
                          <td className="px-2 py-2 text-left">
                            <Popconfirm
                              title="确定取消该测试计划的关联吗？"
                              okText="取消关联"
                              cancelText="取消"
                              onConfirm={() => void handleCancelPlanAssociation(plan.id)}
                            >
                              <Button
                                variant="link-neutral"
                                className="p-0"
                                loading={cancelingPlanId === plan.id}
                                disabled={cancelingPlanId === plan.id}
                                aria-label="取消关联"
                              >
                                <Unlink className="h-3.5 w-3.5" />
                              </Button>
                            </Popconfirm>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
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
              <div className="grid h-32 place-items-center text-sm text-placeholder">暂无附件</div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-end pb-2">
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
                        <tr className="text-left text-xs text-secondary [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface-1 [&>th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
                          <th className="w-1/4 px-2 py-2 text-sm font-medium text-primary">附件</th>
                          <th className="w-1/4 px-2 py-2 text-sm font-medium text-primary">大小</th>
                          <th className="w-1/4 px-2 py-2 text-sm font-medium text-primary">上传时间</th>
                          <th className="w-1/4 px-2 py-2 text-left text-sm font-medium text-primary">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {files.map((file) => (
                          <tr key={file.id} className="border-b border-subtle hover:bg-layer-1">
                            <td className="truncate px-2 py-2 text-sm text-primary" title={file.name}>
                              <span className="truncate">{file.name}</span>
                            </td>
                            <td className="px-2 py-2 text-sm text-primary">{formatFileSize(file.size)}</td>
                            <td className="px-2 py-2 text-sm text-primary">
                              {file.created_at ? new Date(file.created_at).toLocaleDateString() : "-"}
                            </td>
                            <td className="px-2 py-2 text-left">
                              <div className="flex items-center justify-start gap-2">
                                <Button
                                  variant="link-neutral"
                                  className="p-0"
                                  disabled={filesDownloadingId === file.id}
                                  onClick={() => handleDownloadCycleFile(file.id, file.name)}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                                <Popconfirm
                                  title="确认删除该附件？"
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
              </div>
            )}
          </div>
        </div>
      </CycleOverviewFullscreenModal>

      <Modal
        title="关联测试计划"
        open={planAssociateOpen}
        onCancel={() => setPlanAssociateOpen(false)}
        onOk={handleConfirmAssociatePlans}
        okText="确定"
        cancelText="取消"
        okButtonProps={{
          disabled: selectedPlanIds.length === 0 || selectablePlansLoading,
          loading: associatingPlans,
        }}
        width={720}
        destroyOnClose
      >
        <div className="mt-2">
          {selectablePlansLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-secondary">加载中...</div>
          ) : selectablePlansError ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {selectablePlansError}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full table-fixed">
                <thead>
                  <tr className="text-left text-xs text-secondary [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface-1 [&>th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
                    <th className="w-10 px-2 py-2">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={
                          selectablePlans.length > 0 &&
                          selectedPlanIds.length === selectablePlans.length
                        }
                        onChange={(e) => {
                          if (e.target.checked) setSelectedPlanIds(selectablePlans.map((p: any) => p.id));
                          else setSelectedPlanIds([]);
                        }}
                      />
                    </th>
                    <th className="w-2/5 px-2 py-2 text-sm font-medium text-primary">测试计划</th>
                    <th className="w-1/5 px-2 py-2 text-sm font-medium text-primary">状态</th>
                    <th className="w-1/5 px-2 py-2 text-sm font-medium text-primary">开始时间</th>
                    <th className="w-1/5 px-2 py-2 text-sm font-medium text-primary">结束时间</th>
                  </tr>
                </thead>
                <tbody>
                  {selectablePlans.length === 0 ? (
                    <tr>
                      <td className="px-2 py-6 text-sm text-secondary" colSpan={5}>
                        暂无可选测试计划
                      </td>
                    </tr>
                  ) : (
                    selectablePlans.map((plan: any) => {
                      const checked = selectedPlanIds.includes(plan.id);
                      return (
                        <tr key={plan.id} className="border-b border-subtle hover:bg-layer-1-hover">
                          <td className="px-2 py-2">
                            <input
                              type="checkbox"
                              className="size-4"
                              checked={checked}
                              onChange={(e) => {
                                const v = e.target.checked;
                                setSelectedPlanIds((prev) => {
                                  if (v) return Array.from(new Set([...prev, plan.id]));
                                  return prev.filter((x) => x !== plan.id);
                                });
                              }}
                            />
                          </td>
                          <td className="truncate px-2 py-2 text-sm text-primary" title={plan.name ?? "-"}>
                            {plan.name ?? "-"}
                          </td>
                          <td className={`px-2 py-2 text-sm ${getPlanStatusClassName(plan.state)}`}>
                            {plan.state ?? "-"}
                          </td>
                          <td className="px-2 py-2 text-sm text-primary">
                            {formatPlanDate(plan.start_date ?? plan.start_at ?? null)}
                          </td>
                          <td className="px-2 py-2 text-sm text-primary">
                            {formatPlanDate(plan.end_date ?? plan.end_at ?? null)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
});
