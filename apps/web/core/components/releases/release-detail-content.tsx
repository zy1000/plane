"use client";
import React, { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import {
  Plus,
  Unlink,
  Pencil,
  Download,
  Trash2,
  CalendarDays,
  ArrowRight,
  SquareUser,
  CheckCircle2,
  PlayCircle,
  Circle,
  XCircle,
  Layers,
  Timer,
  ClipboardList,
  FileText,
  Repeat,
  Maximize2,
  ScrollText,
  Activity,
  AlertTriangle,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { Tab } from "@headlessui/react";
import { Button } from "@plane/propel/button";
import {
  CYCLE_STATUS,
  MODULE_STATUS,
  PROJECT_ERROR_MESSAGES,
  isProjectPermissionError,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { CheckIcon, MembersPropertyIcon, WorkItemsIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Dialog, Transition } from "@headlessui/react";
import { Modal, Popconfirm, Tooltip } from "antd";
import { Avatar, AvatarGroup, CircularProgressIndicator, Loader } from "@plane/ui";
import { ReadonlyDate } from "@/components/readonly/date";
import { ReleaseService } from "@/services/release.service";
import { WorkspaceService } from "@/services/workspace.service";
import { cn, getDate, getFileURL, renderFormattedPayloadDate, findTotalDaysInRange } from "@plane/utils";
import { EFileAssetType } from "@plane/types";
import { useMember } from "@/hooks/store/use-member";
import { useRelease } from "@/hooks/store/use-release";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import useLocalStorage from "@/hooks/use-local-storage";
import { RichTextEditor } from "@/components/editor/rich-text";
import { OverdueByAssigneeCard } from "@/components/common/overdue-by-assignee-card";
import { CycleOverviewFullscreenModal } from "@/components/cycles/cycle-overview-fullscreen-modal";

type Props = {
  releaseId: string;
  isArchived?: boolean;
  isOpen?: boolean;
};

type TReleaseFile = {
  id: string;
  name: string;
  size: number;
  created_at: string;
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
  { key: "stat-cycles", label: "关联迭代", Icon: Repeat },
  { key: "stat-test-plans", label: "测试计划", Icon: ClipboardList },
  { key: "stat-files", label: "附件", Icon: FileText },
] as const;

const formatDateLabel = (d: Date | null | undefined) => {
  if (!d) return "-";
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric", year: "numeric" });
};

const PASS_RATE_KEYS = ["成功", "失败", "阻塞", "无效", "未执行"] as const;
const PASS_RATE_COLORS: Record<string, string> = {
  成功: "#52c41a",
  失败: "#ff4d4f",
  阻塞: "#faad14",
  无效: "#3b5999",
  未执行: "#bfbfbf",
};

const renderPlanStateTag = (state: string | null | undefined) => {
  const text = state ? String(state) : "-";
  const classByState: Record<string, string> = {
    未开始: "text-secondary",
    进行中: "text-[#1677ff]",
    已完成: "text-success-primary",
  };
  return (
    <span className={`text-sm font-medium leading-none ${classByState[text] ?? "text-secondary"}`}>
      {text}
    </span>
  );
};

const PlanPassRate: React.FC<{ passRate: Record<string, number> | null | undefined }> = ({ passRate }) => {
  if (!passRate) return <span className="text-sm text-secondary">-</span>;

  const totalCount = PASS_RATE_KEYS.reduce((s, k) => s + Number(passRate[k] || 0), 0);
  const passed = Number(passRate["成功"] || 0);
  const percent = totalCount > 0 ? Math.floor((passed / totalCount) * 100) : 0;

  const segments = PASS_RATE_KEYS.map((k) => {
    const count = Number(passRate[k] || 0);
    const widthPct = totalCount > 0 ? (count / totalCount) * 100 : 0;
    return { key: k, count, color: PASS_RATE_COLORS[k] ?? "#d9d9d9", widthPct };
  });

  const tooltipContent = (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {PASS_RATE_KEYS.map((k) => (
        <div key={k} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "2px",
              backgroundColor: PASS_RATE_COLORS[k] ?? "#d9d9d9",
              display: "inline-block",
            }}
          />
          <span style={{ fontSize: "12px", color: "var(--text-color-primary)" }}>{k}</span>
          <span style={{ marginLeft: "auto", fontSize: "12px", color: "#8c8c8c" }}>{Number(passRate[k] || 0)}</span>
        </div>
      ))}
    </div>
  );

  return (
    <Tooltip mouseEnterDelay={0.25} title={tooltipContent} color="#fff" overlayInnerStyle={{ color: "#333" }}>
      <div className="flex max-w-[76px] items-center gap-1">
        <div className="min-w-0 flex-1" style={{ maxWidth: "48px" }}>
          <div
            style={{
              width: "100%",
              height: "5px",
              border: "1px solid #e8e8e8",
              borderRadius: "5px",
              overflow: "hidden",
              display: "flex",
            }}
          >
            {segments.map((seg, idx) => (
              <div
                key={`${seg.key}-${idx}`}
                style={{ width: `${seg.widthPct}%`, backgroundColor: seg.color, height: "100%" }}
              />
            ))}
          </div>
        </div>
        <span className="shrink-0 text-[11px] tabular-nums text-primary">{percent}%</span>
      </div>
    </Tooltip>
  );
};

export const ReleaseDetailContent: React.FC<Props> = observer(({ releaseId, isOpen }) => {
  const { t } = useTranslation();
  const { workspaceSlug, projectId } = useParams();
  const router = useRouter();
  const { getReleaseById, fetchReleaseDetails } = useRelease();
  const releaseDetails = getReleaseById(releaseId);
  const { getWorkspaceBySlug } = useWorkspace();
  const workspaceId = workspaceSlug ? getWorkspaceBySlug(workspaceSlug.toString())?.id : undefined;
  const { getUserDetails } = useMember();
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const workspaceService = useMemo(() => new WorkspaceService(), []);
  const { storedValue: currentTab, setValue: setCurrentTab } = useLocalStorage(
    `release-overview-tab-${releaseId}`,
    "stat-cycles"
  );

  const todayStr = renderFormattedPayloadDate(new Date());
  const rawDays =
    releaseDetails?.target_date && todayStr
      ? findTotalDaysInRange(todayStr, releaseDetails.target_date, false)
      : undefined;
  const daysLeft = typeof rawDays === "number" ? Math.max(0, rawDays) : undefined;

  const status = releaseDetails?.status;
  const statusInfo = MODULE_STATUS.find((s) => s.value === status);

  const releaseLead = releaseDetails?.lead_id ? getUserDetails(releaseDetails.lead_id) : undefined;
  const releaseStartDate = getDate(releaseDetails?.start_date);
  const releaseTargetDate = getDate(releaseDetails?.target_date);

  const releaseService = useMemo(() => new ReleaseService(), []);
  const [cycles, setCycles] = useState<any[]>([]);
  const [cyclesLoading, setCyclesLoading] = useState(false);
  const [cyclesError, setCyclesError] = useState<string | null>(null);
  const [associateOpen, setAssociateOpen] = useState(false);
  const [selectLoading, setSelectLoading] = useState(false);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [selectPage, setSelectPage] = useState(1);
  const [selectPageSize, setSelectPageSize] = useState(10);
  const [selectTotal, setSelectTotal] = useState(0);
  const [selectData, setSelectData] = useState<any[]>([]);
  const [selectedCycleIds, setSelectedCycleIds] = useState<string[]>([]);
  const [hoverRowId, setHoverRowId] = useState<string | null>(null);
  const initializedRef = useRef(false);

  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [stats, setStats] = useState<any | null>(null);

  const [plans, setPlans] = useState<any[]>([]);
  const [planAssociateOpen, setPlanAssociateOpen] = useState(false);
  const [selectablePlans, setSelectablePlans] = useState<any[]>([]);
  const [selectablePlansLoading, setSelectablePlansLoading] = useState(false);
  const [selectablePlansError, setSelectablePlansError] = useState<string | null>(null);
  const [selectedPlanIds, setSelectedPlanIds] = useState<string[]>([]);
  const [associatingPlans, setAssociatingPlans] = useState(false);
  const [cancelingPlanId, setCancelingPlanId] = useState<string | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);

  const [statsExpandOpen, setStatsExpandOpen] = useState(false);
  const [noteExpandOpen, setNoteExpandOpen] = useState(false);
  const [activityExpandOpen, setActivityExpandOpen] = useState(false);
  const [overdueExpandOpen, setOverdueExpandOpen] = useState(false);

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteHtml, setNoteHtml] = useState<string>("");
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [releaseFiles, setReleaseFiles] = useState<TReleaseFile[]>([]);
  const [releaseFilesLoading, setReleaseFilesLoading] = useState(false);
  const [releaseFilesError, setReleaseFilesError] = useState<string | null>(null);
  const [releaseFilesTotal, setReleaseFilesTotal] = useState(0);
  const [releaseFilesUploading, setReleaseFilesUploading] = useState(false);
  const [releaseFilesDeletingId, setReleaseFilesDeletingId] = useState<string | null>(null);
  const [releaseFilesDownloadingId, setReleaseFilesDownloadingId] = useState<string | null>(null);

  /** 与后端 CustomPaginator.max_page_size 一致，单次请求上限；多页时循环拉取直至全部 */
  const RELEASE_FILES_PAGE_SIZE = 100;

  const releaseOverdueSwrKey =
    workspaceSlug && projectId && releaseId
      ? `release-overdue-by-assignee-${workspaceSlug}-${projectId}-${releaseId}`
      : null;
  const { data: releaseOverdueByAssignee, mutate: mutateReleaseOverdueByAssignee } = useSWR(
    releaseOverdueSwrKey,
    () =>
      releaseService.getReleaseOverdueByAssignee(
        workspaceSlug!.toString(),
        projectId!.toString(),
        releaseId
      )
  );

  const showReleaseFileApiError = (error: unknown, genericTitle: string, genericMessage: string) => {
    if (isProjectPermissionError(error)) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title),
        message: PROJECT_ERROR_MESSAGES.permissionError.i18n_message
          ? t(PROJECT_ERROR_MESSAGES.permissionError.i18n_message)
          : undefined,
      });
    } else {
      setToast({ type: TOAST_TYPE.ERROR, title: genericTitle, message: genericMessage });
    }
  };

  const fetchReleaseStatistics = async () => {
    if (!workspaceSlug || !projectId || !releaseId) return;
    try {
      setStatsLoading(true);
      setStatsError(null);
      const data = await releaseService.getReleaseStatistics(workspaceSlug.toString(), projectId.toString(), releaseId);
      setStats(data ?? null);
    } catch (e: any) {
      setStatsError(e?.detail || e?.error || "获取统计信息失败");
    } finally {
      setStatsLoading(false);
    }
  };

  const fetchPlans = async () => {
    if (!workspaceSlug || !projectId || !releaseId) return;
    try {
      setPlansLoading(true);
      setPlansError(null);
      const data = await releaseService.getReleasePlans(workspaceSlug.toString(), projectId.toString(), releaseId);
      setPlans(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setPlansError(e?.detail || e?.error || "获取测试计划失败");
    } finally {
      setPlansLoading(false);
    }
  };

  const openPlanAssociateModal = async () => {
    if (!workspaceSlug || !projectId || !releaseId) return;
    setPlanAssociateOpen(true);
    setSelectedPlanIds([]);
    setSelectablePlansLoading(true);
    setSelectablePlansError(null);
    try {
      const res = await releaseService.getReleaseSelectablePlans(
        workspaceSlug.toString(),
        projectId.toString(),
        releaseId
      );
      setSelectablePlans(Array.isArray(res?.data) ? res.data : []);
    } catch (e: any) {
      setSelectablePlansError(e?.error || e?.detail || "获取可选测试计划失败");
      setSelectablePlans([]);
    } finally {
      setSelectablePlansLoading(false);
    }
  };

  const handleConfirmAssociatePlans = async () => {
    if (!workspaceSlug || !projectId || !releaseId || selectedPlanIds.length === 0) return;
    try {
      setAssociatingPlans(true);
      await releaseService.associateReleasePlans(
        workspaceSlug.toString(),
        projectId.toString(),
        releaseId,
        selectedPlanIds
      );
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "关联成功",
        message: `已关联 ${selectedPlanIds.length} 个测试计划`,
      });
      setPlanAssociateOpen(false);
      setSelectedPlanIds([]);
      void fetchPlans();
    } catch (e: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "关联失败",
        message: e?.error || e?.detail || "请稍后重试",
      });
    } finally {
      setAssociatingPlans(false);
    }
  };

  const handleCancelPlanAssociation = async (planId: string) => {
    if (!workspaceSlug || !projectId || !releaseId) return;
    try {
      setCancelingPlanId(planId);
      await releaseService.cancelReleasePlanAssociation(
        workspaceSlug.toString(),
        projectId.toString(),
        releaseId,
        [planId]
      );
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已取消关联", message: "测试计划已取消关联" });
      void fetchPlans();
    } catch (e: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "操作失败",
        message: e?.error || e?.detail || "请稍后重试",
      });
    } finally {
      setCancelingPlanId(null);
    }
  };

  const fetchCycles = async () => {
    if (!workspaceSlug || !projectId || !releaseId) return;
    try {
      setCyclesLoading(true);
      setCyclesError(null);
      const data = await releaseService.getCycleList(workspaceSlug.toString(), projectId.toString(), releaseId);

      setCycles(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setCyclesError(e?.detail || e?.error || "获取迭代列表失败");
    } finally {
      setCyclesLoading(false);
    }
  };

  const fetchReleaseFiles = async () => {
    if (!workspaceSlug || !projectId || !releaseId) return;
    try {
      setReleaseFilesLoading(true);
      setReleaseFilesError(null);
      const all: TReleaseFile[] = [];
      let total = 0;
      let page = 1;
      for (;;) {
        const res = await releaseService.getReleaseFileList(
          workspaceSlug.toString(),
          projectId.toString(),
          releaseId,
          { page, page_size: RELEASE_FILES_PAGE_SIZE }
        );
        const list = Array.isArray(res?.data) ? res.data : [];
        if (page === 1) {
          total = Number(res?.count ?? 0);
        }
        all.push(...list);
        if (list.length === 0) break;
        if (total > 0 && all.length >= total) break;
        if (list.length < RELEASE_FILES_PAGE_SIZE) break;
        page += 1;
        if (page > 500) break;
      }
      setReleaseFiles(all);
      setReleaseFilesTotal(total > 0 ? total : all.length);
    } catch (e: unknown) {
      if (isProjectPermissionError(e)) {
        setReleaseFilesError(t(PROJECT_ERROR_MESSAGES.permissionError.i18n_title));
      } else {
        const err = e as { detail?: string; error?: string };
        setReleaseFilesError(err?.detail || err?.error || "获取文件列表失败");
      }
    } finally {
      setReleaseFilesLoading(false);
    }
  };

  const handleUploadReleaseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!workspaceSlug || !projectId || !releaseId) return;
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setReleaseFilesUploading(true);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("release_id", releaseId);
      await releaseService.uploadReleaseFile(workspaceSlug.toString(), projectId.toString(), formData);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "上传成功", message: "文件已上传" });
      await fetchReleaseFiles();
    } catch (e: unknown) {
      showReleaseFileApiError(e, "上传失败", "请稍后重试");
    } finally {
      event.target.value = "";
      setReleaseFilesUploading(false);
    }
  };

  const handleDeleteReleaseFile = async (fileId: string) => {
    try {
      setReleaseFilesDeletingId(fileId);
      await releaseService.deleteReleaseFile(workspaceSlug.toString(), projectId.toString(), fileId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "删除成功", message: "文件已删除" });
      await fetchReleaseFiles();
    } catch (e: unknown) {
      showReleaseFileApiError(e, "删除失败", "请稍后重试");
    } finally {
      setReleaseFilesDeletingId(null);
    }
  };

  const handleDownloadReleaseFile = async (fileId: string, fileName: string) => {
    try {
      setReleaseFilesDownloadingId(fileId);
      const blob = await releaseService.downloadReleaseFile(
        workspaceSlug.toString(),
        projectId.toString(),
        fileId
      );
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } catch (e: unknown) {
      showReleaseFileApiError(e, "下载失败", "请稍后重试");
    } finally {
      setReleaseFilesDownloadingId(null);
    }
  };

  const formatFileSize = (size = 0) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  };

  const fetchSelectable = async (page = selectPage, pageSize = selectPageSize) => {
    if (!workspaceSlug || !projectId) return;
    try {
      setSelectLoading(true);
      setSelectError(null);
      const res = await releaseService.selectCycleList(workspaceSlug.toString(), projectId.toString(), {
        page,
        page_size: pageSize,
      });
      const list = res?.data ?? res?.results ?? [];
      const count = res?.count ?? res?.total_results ?? 0;
      setSelectData(Array.isArray(list) ? list : []);
      setSelectTotal(Number(count) || 0);
      setSelectPage(page);
      setSelectPageSize(pageSize);
    } catch (e: any) {
      setSelectError(e?.detail || e?.error || "获取可选迭代失败");
    } finally {
      setSelectLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen || !workspaceSlug || !projectId || !releaseId) return;

    setAssociateOpen(false);
    setSelectedCycleIds([]);
    setCurrentTab("stat-cycles");
    fetchReleaseDetails(workspaceSlug.toString(), projectId.toString(), releaseId);
    fetchCycles();
    fetchReleaseStatistics();
    fetchReleaseFiles();
    fetchPlans();
  }, [fetchReleaseDetails, isOpen, releaseId, projectId, setCurrentTab, workspaceSlug]);

  const handleNoteEditorUploadFile = async (blockId: string | undefined, file: File) => {
    if (!workspaceSlug || !projectId) throw new Error("Missing context");
    const { asset_id } = await uploadEditorAsset({
      blockId: blockId ?? "",
      data: {
        entity_identifier: projectId.toString(),
        entity_type: EFileAssetType.PROJECT_DESCRIPTION,
      },
      file,
      projectId: projectId.toString(),
      workspaceSlug: workspaceSlug.toString(),
    });
    return asset_id;
  };

  const handleNoteEditorDuplicateFile = async (assetId: string) => {
    if (!workspaceSlug || !projectId) throw new Error("Missing context");
    const { asset_id } = await duplicateEditorAsset({
      assetId,
      entityId: projectId.toString(),
      entityType: EFileAssetType.PROJECT_DESCRIPTION,
      projectId: projectId.toString(),
      workspaceSlug: workspaceSlug.toString(),
    });
    return asset_id;
  };

  const handleNoteOpen = () => {
    setNoteHtml(releaseDetails?.note || "");
    setNoteOpen(true);
  };

  const handleNoteSubmit = async () => {
    if (!workspaceSlug || !projectId || !releaseId) return;
    try {
      setNoteSubmitting(true);
      await releaseService.updateNote(workspaceSlug.toString(), projectId.toString(), releaseId, noteHtml);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "更新成功", message: "发布日志已更新" });
      setNoteOpen(false);
      await fetchReleaseDetails(workspaceSlug.toString(), projectId.toString(), releaseId);
    } catch (e: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "更新失败", message: e?.detail || e?.error || "请稍后重试" });
    } finally {
      setNoteSubmitting(false);
    }
  };

  const handleAssociateClose = () => {
    setAssociateOpen(false);
    setSelectedCycleIds([]);
    void fetchReleaseStatistics();
    void mutateReleaseOverdueByAssignee();
  };

  const handleAssociateConfirm = async () => {
    if (!workspaceSlug || !projectId || !releaseId || selectedCycleIds.length === 0) {
      handleAssociateClose();
      return;
    }
    try {
      const payloads = selectedCycleIds.map((cid) => ({ release_id: releaseId, cycle_id: cid }));
      await Promise.all(
        payloads.map((p) => releaseService.associateCycle(workspaceSlug.toString(), projectId.toString(), p))
      );
      setToast({ type: TOAST_TYPE.SUCCESS, title: "关联成功", message: "已关联所选迭代" });
      handleAssociateClose();
      fetchCycles();
    } catch (e: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "关联失败", message: e?.detail || e?.error || "请稍后重试" });
    }
  };

  const handleCancelAssociation = async (cycleId: string) => {
    if (!workspaceSlug || !projectId || !releaseId) return;
    try {
      await releaseService.cancelCycleAssociation(workspaceSlug.toString(), projectId.toString(), {
        release_id: releaseId,
        cycle_id: cycleId,
      });
      setToast({ type: TOAST_TYPE.SUCCESS, title: "已取消关联", message: "迭代已取消关联" });
      fetchCycles();
      void fetchReleaseStatistics();
      void mutateReleaseOverdueByAssignee();
    } catch (e: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "操作失败", message: e?.detail || e?.error || "请稍后重试" });
    }
  };

  const totalIssues = Number(stats?.total_issues ?? 0);
  const backlogIssues = Number(stats?.state_distribution?.backlog ?? 0);
  const inProgressIssues = Number(
    (stats?.state_distribution?.unstarted ?? 0) + (stats?.state_distribution?.started ?? 0)
  );
  const completedIssues = Number(stats?.state_distribution?.completed ?? 0);
  const cancelledIssues = Number(stats?.state_distribution?.cancelled ?? 0);
  const progress = totalIssues > 0 ? Math.floor((completedIssues / totalIssues) * 100) : 0;

  const normalizedOverviewTab = OVERVIEW_TABS.some((t) => t.key === currentTab)
    ? (currentTab as string)
    : "stat-cycles";
  const overviewTabIndex = OVERVIEW_TABS.findIndex((tab) => tab.key === normalizedOverviewTab);

  const overviewTabCounts: Record<(typeof OVERVIEW_TABS)[number]["key"], number> = {
    "stat-test-plans": plans.length,
    "stat-cycles": cycles.length,
    "stat-files": releaseFilesTotal,
  };

  if (!releaseDetails) {
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

  return (
    <div className="h-full w-full overflow-y-auto vertical-scrollbar scrollbar-sm">
      <div className="flex flex-col gap-5 px-6 py-4">
        {/* Header: release name + meta */}
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
              <h1 className="shrink-0 text-lg font-normal text-primary">{releaseDetails.name || "概览"}</h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {statusInfo && (
              <span
                className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium"
                style={{ color: statusInfo.color, backgroundColor: `${statusInfo.color}20` }}
              >
                {t(statusInfo.i18n_label)}
              </span>
            )}
            {releaseStartDate && releaseTargetDate && (
              <span className="inline-flex items-center gap-1.5 text-sm text-placeholder">
                <CalendarDays className="h-3.5 w-3.5 text-placeholder" />
                {formatDateLabel(releaseStartDate)}
                <ArrowRight className="h-3 w-3 text-placeholder" />
                {formatDateLabel(releaseTargetDate)}
              </span>
            )}
            {typeof daysLeft === "number" && (
              <span className="inline-flex items-center gap-1.5 text-sm text-placeholder">
                <Timer className="h-3.5 w-3.5 text-placeholder" />
                距离发布还有 <span className="font-medium tabular-nums text-primary">{daysLeft}</span> 天
              </span>
            )}
            {releaseLead && (
              <span className="inline-flex items-center gap-1.5 text-sm text-placeholder">
                <SquareUser className="h-3.5 w-3.5 text-placeholder" />
                <Avatar size="sm" name={releaseLead.display_name} src={getFileURL(releaseLead.avatar_url ?? "")} />
                <span>{releaseLead.display_name}</span>
              </span>
            )}
            {releaseDetails.member_ids && releaseDetails.member_ids.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-sm text-placeholder">
                <MembersPropertyIcon className="h-3.5 w-3.5 text-placeholder" />
                <AvatarGroup showTooltip>
                  {releaseDetails.member_ids.map((id) => {
                    const m = getUserDetails(id);
                    return <Avatar key={id} name={m?.display_name ?? ""} src={getFileURL(m?.avatar_url ?? "")} />;
                  })}
                </AvatarGroup>
                <span>{releaseDetails.member_ids.length} {t("members")}</span>
              </span>
            )}
          </div>
        </div>

        {releaseDetails.description && (
          <p className="line-clamp-2 text-sm leading-relaxed text-secondary">{releaseDetails.description}</p>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <KpiCard
            icon={<Layers className="h-5 w-5" />}
            label={t("work_items")}
            value={totalIssues}
            iconColor="text-[#3f76ff]"
          />
          <KpiCard
            icon={<Circle className="h-5 w-5" />}
            label="未开始"
            value={backlogIssues}
            iconColor="text-[#64748b]"
          />
          <KpiCard
            icon={<PlayCircle className="h-5 w-5" />}
            label="进行中"
            value={inProgressIssues}
            iconColor="text-[#F59E0B]"
          />
          <KpiCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            label="已完成"
            value={completedIssues}
            iconColor="text-success-primary"
          />
          <KpiCard
            icon={<XCircle className="h-5 w-5" />}
            label="已取消"
            value={cancelledIssues}
            iconColor="text-danger-primary"
          />
        </div>

        {/* Release log + Activity (moved above chart row) */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className={`${sectionCard} group relative flex h-[420px] flex-col overflow-hidden p-4`}>
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <ScrollText className="h-4 w-4 shrink-0 text-placeholder" aria-hidden />
                <div className="text-sm font-medium text-primary">发布日志</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="link-neutral"
                  className="p-0 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={handleNoteOpen}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <button
                  type="button"
                  className="grid h-6 w-6 shrink-0 place-items-center rounded transition-colors hover:bg-surface-2"
                  onClick={() => setNoteExpandOpen(true)}
                  aria-label="放大"
                >
                  <Maximize2 className="h-3.5 w-3.5 text-placeholder" />
                </button>
              </div>
            </div>
            <div className="mt-3 min-h-0 flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm">
              {releaseDetails.note ? (
                <div
                  className="prose max-w-none text-sm text-secondary"
                  dangerouslySetInnerHTML={{ __html: releaseDetails.note }}
                />
              ) : (
                <div className="grid h-full place-items-center text-sm text-placeholder">暂无发布日志</div>
              )}
            </div>
          </div>

          <div className={`${sectionCard} flex h-[420px] flex-col p-4`}>
            <div className="flex items-center justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <Activity className="h-4 w-4 shrink-0 text-placeholder" aria-hidden />
                <div className="text-sm font-medium text-primary">发布动态</div>
              </div>
              <button
                type="button"
                className="grid h-6 w-6 shrink-0 place-items-center rounded transition-colors hover:bg-surface-2"
                onClick={() => setActivityExpandOpen(true)}
                aria-label="放大"
              >
                <Maximize2 className="h-3.5 w-3.5 text-placeholder" />
              </button>
            </div>
            <div className="mt-3 grid min-h-0 flex-1 place-items-center text-sm text-placeholder">
              {t("no_data_yet")}
            </div>
          </div>
        </div>

        {/* Tabs + Work item type pie chart */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {/* Left: Tabs (测试计划 / 关联迭代 / 附件) */}
          <div className={`${sectionCard} flex h-[420px] flex-col p-4`}>
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
                        <span className="min-w-0 truncate">{tab.label}</span>
                        <span className="shrink-0 tabular-nums text-placeholder">{overviewTabCounts[tab.key]}</span>
                      </Tab>
                    );
                  })}
                </Tab.List>
                <div className="flex shrink-0 items-center gap-1">
                  {normalizedOverviewTab === "stat-test-plans" && (
                    <Button
                      variant="link-neutral"
                      className="p-0"
                      onClick={() => void openPlanAssociateModal()}
                      aria-label="关联测试计划"
                    >
                      <Plus className="h-4 w-4 text-placeholder" />
                    </Button>
                  )}
                  {normalizedOverviewTab === "stat-cycles" && (
                    <Button
                      variant="link-neutral"
                      className="p-0"
                      onClick={() => {
                        setAssociateOpen(true);
                        fetchSelectable(1, selectPageSize);
                      }}
                      aria-label="关联迭代"
                    >
                      <Plus className="h-4 w-4 text-placeholder" />
                    </Button>
                  )}
                  {normalizedOverviewTab === "stat-files" && (
                    <Button
                      variant="link-neutral"
                      className="p-0"
                      onClick={() => fileInputRef.current?.click()}
                      loading={releaseFilesUploading}
                      disabled={releaseFilesUploading}
                      aria-label="上传附件"
                    >
                      <Plus className="h-4 w-4 text-placeholder" />
                    </Button>
                  )}
                  <input ref={fileInputRef} type="file" className="hidden" onChange={handleUploadReleaseFile} />
                  <button
                    type="button"
                    className="grid h-6 w-6 shrink-0 place-items-center rounded transition-colors hover:bg-surface-2"
                    onClick={() => setStatsExpandOpen(true)}
                    aria-label="放大"
                  >
                    <Maximize2 className="h-3.5 w-3.5 text-placeholder" />
                  </button>
                </div>
              </div>
              <Tab.Panels className="min-h-0 flex-1 py-3 text-secondary">
                {/* 关联迭代 */}
                <Tab.Panel key="stat-cycles" className="flex h-full min-h-0 flex-col">
                  {cyclesLoading ? (
                    <div className="flex items-center justify-center py-8 text-sm text-secondary">加载中...</div>
                  ) : cyclesError ? (
                    <p className="text-sm text-danger-primary">{cyclesError}</p>
                  ) : cycles.length === 0 ? (
                    <div className="grid min-h-0 flex-1 place-items-center text-sm text-placeholder">暂无关联迭代</div>
                  ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm">
                      <table className="min-w-full table-fixed">
                        <thead>
                          <tr className="text-left text-xs text-secondary [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface-1 [&>th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
                            <th className="w-1/5 px-2 py-2 text-sm font-medium text-primary">迭代</th>
                            <th className="w-1/5 px-2 py-2 text-sm font-medium text-primary">状态</th>
                            <th className="w-1/5 px-2 py-2 text-sm font-medium text-primary">开始时间</th>
                            <th className="w-1/5 px-2 py-2 text-sm font-medium text-primary">结束时间</th>
                            <th className="w-1/5 px-2 py-2 text-left text-sm font-medium text-primary">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cycles.map((c) => (
                            <tr
                              key={c.id}
                              className="border-b border-subtle hover:bg-layer-1"
                              onMouseEnter={() => setHoverRowId(c.id)}
                              onMouseLeave={() => setHoverRowId((prev) => (prev === c.id ? null : prev))}
                            >
                              <td className="truncate px-2 py-2 text-sm text-primary" title={c.name}>
                                {c.id ? (
                                  <button
                                    type="button"
                                    className="truncate text-left text-sm text-primary hover:underline"
                                    onClick={() =>
                                      router.push(`/${workspaceSlug}/projects/${projectId}/cycles/${c.id}/overview`)
                                    }
                                  >
                                    {c.name}
                                  </button>
                                ) : (
                                  c.name
                                )}
                              </td>
                              <td className="px-2 py-2 text-sm text-primary">
                                {(() => {
                                  const statusMap: Record<string, string> = {
                                    未开始: "not_started",
                                    进行中: "in_progress",
                                    已延期: "delayed",
                                    已完成: "completed",
                                    已取消: "cancelled",
                                    not_started: "not_started",
                                    in_progress: "in_progress",
                                    delayed: "delayed",
                                    completed: "completed",
                                    cancelled: "cancelled",
                                    canceled: "cancelled",
                                    NOT_STARTED: "not_started",
                                    IN_PROGRESS: "in_progress",
                                    DELAYED: "delayed",
                                    COMPLETED: "completed",
                                    CANCELLED: "cancelled",
                                    CURRENT: "in_progress",
                                    UPCOMING: "not_started",
                                    DRAFT: "not_started",
                                  };
                                  let normalized: string | undefined = c.status ? statusMap[String(c.status)] : undefined;
                                  if (!normalized) {
                                    const now = Date.now();
                                    const start = c.start_date ? new Date(c.start_date).getTime() : NaN;
                                    const end = c.end_date ? new Date(c.end_date).getTime() : NaN;
                                    if (!Number.isNaN(start) && start > now) normalized = "not_started";
                                    else if (!Number.isNaN(end) && end < now) normalized = "completed";
                                    else if (!Number.isNaN(start) && !Number.isNaN(end)) normalized = "in_progress";
                                    else normalized = "not_started";
                                  }
                                  const info = CYCLE_STATUS.find((s) => s.value === normalized);
                                  if (!info) return "-";
                                  return (
                                    <span className="text-sm font-medium leading-none" style={{ color: info.color }}>
                                      {t(info.i18n_title)}
                                    </span>
                                  );
                                })()}
                              </td>
                              <td className="px-2 py-2 text-sm text-primary">
                                <ReadonlyDate value={c.start_date} formatToken="yyyy-MM-dd" hideIcon={true} />
                              </td>
                              <td className="px-2 py-2 text-sm text-primary">
                                <ReadonlyDate value={c.end_date} formatToken="yyyy-MM-dd" hideIcon={true} />
                              </td>
                              <td className="px-2 py-2 text-left">
                                <Button
                                  variant="link-neutral"
                                  className="p-0"
                                  onClick={() => handleCancelAssociation(c.id)}
                                >
                                  <Unlink className="h-3.5 w-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Tab.Panel>

                {/* 测试计划 */}
                <Tab.Panel key="stat-test-plans" className="flex h-full min-h-0 flex-col">
                  {plansLoading ? (
                    <div className="flex items-center justify-center py-8 text-sm text-secondary">加载中...</div>
                  ) : plansError ? (
                    <p className="text-sm text-danger-primary">{plansError}</p>
                  ) : plans.length === 0 ? (
                    <div className="grid min-h-0 flex-1 place-items-center text-sm text-placeholder">暂无关联测试计划</div>
                  ) : (
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
                          {plans.map((p) => (
                            <tr key={p.id} className="border-b border-subtle hover:bg-layer-1">
                              <td className="truncate px-2 py-2 text-sm text-primary" title={p.name ?? "-"}>
                                {p.id ? (
                                  <button
                                    type="button"
                                    className="truncate text-left text-sm text-primary hover:underline"
                                    onClick={() =>
                                      router.push(
                                        `/${workspaceSlug}/projects/${projectId}/testhub/plan-cases?planId=${p.id}`
                                      )
                                    }
                                  >
                                    {p.name ?? "-"}
                                  </button>
                                ) : (
                                  p.name ?? "-"
                                )}
                              </td>
                              <td className="px-2 py-2">
                                <div className="flex items-center">{renderPlanStateTag(p.state)}</div>
                              </td>
                              <td className="px-2 py-2">
                                <PlanPassRate passRate={p.pass_rate} />
                              </td>
                              <td className="px-2 py-2 text-sm text-primary">{p.begin_time || "-"}</td>
                              <td className="px-2 py-2 text-sm text-primary">{p.end_time || "-"}</td>
                              <td className="px-2 py-2 text-left" onClick={(e) => e.stopPropagation()}>
                                <Popconfirm
                                  title="确定取消该测试计划的关联吗？"
                                  okText="取消关联"
                                  cancelText="取消"
                                  onConfirm={() => void handleCancelPlanAssociation(p.id)}
                                >
                                  <Button
                                    variant="link-neutral"
                                    className="p-0"
                                    loading={cancelingPlanId === p.id}
                                    disabled={cancelingPlanId === p.id}
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
                  )}
                </Tab.Panel>

                {/* 附件 */}
                <Tab.Panel key="stat-files" className="flex h-full min-h-0 flex-col">
                  {releaseFilesLoading ? (
                    <div className="flex items-center justify-center py-8 text-sm text-secondary">加载中...</div>
                  ) : releaseFilesError ? (
                    <p className="text-sm text-danger-primary">{releaseFilesError}</p>
                  ) : releaseFiles.length === 0 ? (
                    <div className="grid min-h-0 flex-1 place-items-center text-sm text-placeholder">暂无附件</div>
                  ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm">
                      <div className="overflow-x-auto">
                        <table className="min-w-full table-fixed">
                          <thead>
                            <tr className="text-left text-xs text-secondary [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface-1 [&>th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
                              <th className="w-1/4 px-2 py-2 text-sm font-medium text-primary">附件</th>
                              <th className="w-1/4 px-2 py-2 text-sm font-medium text-primary">大小</th>
                              <th className="w-1/4 px-2 py-2 text-sm font-medium text-primary">上传时间</th>
                              <th className="w-1/4 pl-3 pr-2 py-2 text-left text-sm font-medium text-primary">操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {releaseFiles.map((file) => (
                              <tr key={file.id} className="border-b border-subtle hover:bg-layer-1">
                                <td className="truncate px-2 py-2 text-sm text-primary" title={file.name}>
                                  <div className="flex items-center gap-2">
                                    <WorkItemsIcon className="h-4 w-4 flex-shrink-0 text-placeholder" />
                                    <span className="truncate">{file.name}</span>
                                  </div>
                                </td>
                                <td className="px-2 py-2 text-sm text-primary">{formatFileSize(Number(file.size ?? 0))}</td>
                                <td className="px-2 py-2 text-sm text-primary">
                                  <ReadonlyDate value={file.created_at} formatToken="yyyy-MM-dd" hideIcon={true} />
                                </td>
                                <td className="pl-3 pr-2 py-2">
                                  <div className="flex items-center justify-start gap-2">
                                    <Button
                                      variant="link-neutral"
                                      className="p-0"
                                      disabled={releaseFilesDownloadingId === file.id}
                                      onClick={() => handleDownloadReleaseFile(file.id, file.name)}
                                    >
                                      <Download className="h-3.5 w-3.5" />
                                    </Button>
                                    <Popconfirm
                                      title="确认删除该附件？"
                                      okText="删除"
                                      cancelText="取消"
                                      onConfirm={() => void handleDeleteReleaseFile(file.id)}
                                    >
                                      <Button
                                        variant="link-danger"
                                        className="p-0"
                                        disabled={releaseFilesDeletingId === file.id}
                                        loading={releaseFilesDeletingId === file.id}
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
                  )}
                </Tab.Panel>
              </Tab.Panels>
            </Tab.Group>
          </div>

          {/* Right: 延期工作项负责人（与迭代概览一致） */}
          <OverdueByAssigneeCard
            data={releaseOverdueByAssignee}
            title="延期工作项负责人"
            subtitle=""
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

      <CycleOverviewFullscreenModal
        isOpen={statsExpandOpen}
        onClose={() => setStatsExpandOpen(false)}
        title={
          normalizedOverviewTab === "stat-test-plans"
            ? "测试计划"
            : normalizedOverviewTab === "stat-cycles"
              ? "关联迭代"
              : "附件"
        }
        icon={
          normalizedOverviewTab === "stat-test-plans"
            ? ClipboardList
            : normalizedOverviewTab === "stat-cycles"
              ? Repeat
              : FileText
        }
      >
        <div className="flex min-h-0 flex-1 flex-col bg-surface-1">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 vertical-scrollbar scrollbar-sm">
            {normalizedOverviewTab === "stat-test-plans" ? (
              <>
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
                {plansLoading ? (
                  <div className="flex items-center justify-center py-8 text-sm text-secondary">加载中...</div>
                ) : plansError ? (
                  <p className="text-sm text-danger-primary">{plansError}</p>
                ) : plans.length === 0 ? (
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
                      {plans.map((p) => (
                        <tr key={p.id} className="border-b border-subtle hover:bg-layer-1">
                          <td className="truncate px-2 py-2 text-sm text-primary" title={p.name ?? "-"}>
                            {p.id ? (
                              <button
                                type="button"
                                className="truncate text-left text-sm text-primary hover:underline"
                                onClick={() =>
                                  router.push(
                                    `/${workspaceSlug}/projects/${projectId}/testhub/plan-cases?planId=${p.id}`
                                  )
                                }
                              >
                                {p.name ?? "-"}
                              </button>
                            ) : (
                              p.name ?? "-"
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center">{renderPlanStateTag(p.state)}</div>
                          </td>
                          <td className="px-2 py-2">
                            <PlanPassRate passRate={p.pass_rate} />
                          </td>
                          <td className="px-2 py-2 text-sm text-primary">{p.begin_time || "-"}</td>
                          <td className="px-2 py-2 text-sm text-primary">{p.end_time || "-"}</td>
                          <td className="px-2 py-2 text-left" onClick={(e) => e.stopPropagation()}>
                            <Popconfirm
                              title="确定取消该测试计划的关联吗？"
                              okText="取消关联"
                              cancelText="取消"
                              onConfirm={() => void handleCancelPlanAssociation(p.id)}
                            >
                              <Button
                                variant="link-neutral"
                                className="p-0"
                                loading={cancelingPlanId === p.id}
                                disabled={cancelingPlanId === p.id}
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
              </>
            ) : normalizedOverviewTab === "stat-cycles" ? (
              <>
                <div className="flex items-center justify-end pb-2">
                  <Button
                    variant="link-neutral"
                    className="p-0"
                    onClick={() => {
                      setAssociateOpen(true);
                      fetchSelectable(1, selectPageSize);
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {cyclesLoading ? (
                  <div className="flex items-center justify-center py-8 text-sm text-secondary">加载中...</div>
                ) : cyclesError ? (
                  <p className="text-sm text-danger-primary">{cyclesError}</p>
                ) : cycles.length === 0 ? (
                  <div className="grid h-32 place-items-center text-sm text-placeholder">暂无关联迭代</div>
                ) : (
                  <table className="min-w-full table-fixed">
                    <thead>
                      <tr className="text-left text-xs text-secondary [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface-1 [&>th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
                        <th className="w-1/5 px-2 py-2 text-sm font-medium text-primary">迭代</th>
                        <th className="w-1/5 px-2 py-2 text-sm font-medium text-primary">状态</th>
                        <th className="w-1/5 px-2 py-2 text-sm font-medium text-primary">开始时间</th>
                        <th className="w-1/5 px-2 py-2 text-sm font-medium text-primary">结束时间</th>
                        <th className="w-1/5 px-2 py-2 text-left text-sm font-medium text-primary">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cycles.map((c) => (
                        <tr key={c.id} className="border-b border-subtle hover:bg-layer-1">
                          <td className="truncate px-2 py-2 text-sm text-primary" title={c.name}>
                            {c.id ? (
                              <button
                                type="button"
                                className="truncate text-left text-sm text-primary hover:underline"
                                onClick={() =>
                                  router.push(`/${workspaceSlug}/projects/${projectId}/cycles/${c.id}/overview`)
                                }
                              >
                                {c.name}
                              </button>
                            ) : (
                              c.name
                            )}
                          </td>
                          <td className="px-2 py-2 text-sm text-primary">
                            {(() => {
                              const statusMap: Record<string, string> = {
                                未开始: "not_started",
                                进行中: "in_progress",
                                已延期: "delayed",
                                已完成: "completed",
                                已取消: "cancelled",
                                not_started: "not_started",
                                in_progress: "in_progress",
                                delayed: "delayed",
                                completed: "completed",
                                cancelled: "cancelled",
                                canceled: "cancelled",
                                NOT_STARTED: "not_started",
                                IN_PROGRESS: "in_progress",
                                DELAYED: "delayed",
                                COMPLETED: "completed",
                                CANCELLED: "cancelled",
                                CURRENT: "in_progress",
                                UPCOMING: "not_started",
                                DRAFT: "not_started",
                              };
                              let normalized: string | undefined = c.status ? statusMap[String(c.status)] : undefined;
                              if (!normalized) {
                                const now = Date.now();
                                const start = c.start_date ? new Date(c.start_date).getTime() : NaN;
                                const end = c.end_date ? new Date(c.end_date).getTime() : NaN;
                                if (!Number.isNaN(start) && start > now) normalized = "not_started";
                                else if (!Number.isNaN(end) && end < now) normalized = "completed";
                                else if (!Number.isNaN(start) && !Number.isNaN(end)) normalized = "in_progress";
                                else normalized = "not_started";
                              }
                              const info = CYCLE_STATUS.find((s) => s.value === normalized);
                              if (!info) return "-";
                              return (
                                <span className="text-sm font-medium leading-none" style={{ color: info.color }}>
                                  {t(info.i18n_title)}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-2 py-2 text-sm text-primary">
                            <ReadonlyDate value={c.start_date} formatToken="yyyy-MM-dd" hideIcon={true} />
                          </td>
                          <td className="px-2 py-2 text-sm text-primary">
                            <ReadonlyDate value={c.end_date} formatToken="yyyy-MM-dd" hideIcon={true} />
                          </td>
                          <td className="px-2 py-2 text-left">
                            <Button
                              variant="link-neutral"
                              className="p-0"
                              onClick={() => handleCancelAssociation(c.id)}
                            >
                              <Unlink className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center justify-end pb-2">
                  <Button
                    variant="link-neutral"
                    className="p-0"
                    onClick={() => fileInputRef.current?.click()}
                    loading={releaseFilesUploading}
                    disabled={releaseFilesUploading}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {releaseFilesLoading ? (
                  <div className="flex items-center justify-center py-8 text-sm text-secondary">加载中...</div>
                ) : releaseFilesError ? (
                  <p className="text-sm text-danger-primary">{releaseFilesError}</p>
                ) : releaseFiles.length === 0 ? (
                  <div className="grid h-32 place-items-center text-sm text-placeholder">暂无附件</div>
                ) : (
                  <div className="min-h-0 flex-1 overflow-y-auto vertical-scrollbar scrollbar-sm">
                    <div className="overflow-x-auto">
                      <table className="min-w-full table-fixed">
                        <thead>
                          <tr className="text-left text-xs text-secondary [&>th]:sticky [&>th]:top-0 [&>th]:z-10 [&>th]:bg-surface-1 [&>th]:shadow-[inset_0_-1px_0_var(--border-subtle)]">
                            <th className="w-1/4 px-2 py-2 text-sm font-medium text-primary">附件</th>
                            <th className="w-1/4 px-2 py-2 text-sm font-medium text-primary">大小</th>
                            <th className="w-1/4 px-2 py-2 text-sm font-medium text-primary">上传时间</th>
                            <th className="w-1/4 pl-3 pr-2 py-2 text-left text-sm font-medium text-primary">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {releaseFiles.map((file) => (
                            <tr key={file.id} className="border-b border-subtle hover:bg-layer-1">
                              <td className="truncate px-2 py-2 text-sm text-primary" title={file.name}>
                                <div className="flex items-center gap-2">
                                  <WorkItemsIcon className="h-4 w-4 flex-shrink-0 text-placeholder" />
                                  <span className="truncate">{file.name}</span>
                                </div>
                              </td>
                              <td className="px-2 py-2 text-sm text-primary">{formatFileSize(Number(file.size ?? 0))}</td>
                              <td className="px-2 py-2 text-sm text-primary">
                                <ReadonlyDate value={file.created_at} formatToken="yyyy-MM-dd" hideIcon={true} />
                              </td>
                              <td className="pl-3 pr-2 py-2">
                                <div className="flex items-center justify-start gap-2">
                                  <Button
                                    variant="link-neutral"
                                    className="p-0"
                                    disabled={releaseFilesDownloadingId === file.id}
                                    onClick={() => handleDownloadReleaseFile(file.id, file.name)}
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </Button>
                                  <Popconfirm
                                    title="确认删除该附件？"
                                    okText="删除"
                                    cancelText="取消"
                                    onConfirm={() => void handleDeleteReleaseFile(file.id)}
                                  >
                                    <Button
                                      variant="link-danger"
                                      className="p-0"
                                      disabled={releaseFilesDeletingId === file.id}
                                      loading={releaseFilesDeletingId === file.id}
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
                )}
              </>
            )}
          </div>
        </div>
      </CycleOverviewFullscreenModal>
      <CycleOverviewFullscreenModal
        isOpen={noteExpandOpen}
        onClose={() => setNoteExpandOpen(false)}
        title="发布日志"
        icon={ScrollText}
      >
        <div className="flex min-h-0 flex-1 flex-col bg-surface-1">
          <div className="flex items-center justify-end px-4 pt-3">
            <Button
              variant="link-neutral"
              className="p-0"
              onClick={handleNoteOpen}
              aria-label="编辑发布日志"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 vertical-scrollbar scrollbar-sm">
            {releaseDetails.note ? (
              <div
                className="prose max-w-none text-sm text-secondary"
                dangerouslySetInnerHTML={{ __html: releaseDetails.note }}
              />
            ) : (
              <div className="grid h-full min-h-[50vh] place-items-center text-sm text-placeholder">
                暂无发布日志
              </div>
            )}
          </div>
        </div>
      </CycleOverviewFullscreenModal>

      <CycleOverviewFullscreenModal
        isOpen={activityExpandOpen}
        onClose={() => setActivityExpandOpen(false)}
        title="发布动态"
        icon={Activity}
      >
        <div className="flex min-h-0 flex-1 flex-col bg-surface-1">
          <div className="grid min-h-0 flex-1 place-items-center text-sm text-placeholder">
            {t("no_data_yet")}
          </div>
        </div>
      </CycleOverviewFullscreenModal>

      <CycleOverviewFullscreenModal
        isOpen={overdueExpandOpen}
        onClose={() => setOverdueExpandOpen(false)}
        title="延期工作项负责人"
        badgeText={
          releaseOverdueByAssignee != null ? `共 ${releaseOverdueByAssignee.total} 条` : undefined
        }
        icon={AlertTriangle}
      >
        <div className="flex min-h-0 flex-1 flex-col bg-surface-1">
          <div className="min-h-0 flex-1 overflow-hidden px-4 pb-3">
            <OverdueByAssigneeCard
              hideHeader
              data={releaseOverdueByAssignee}
              className="h-full min-h-[50vh]"
            />
          </div>
        </div>
      </CycleOverviewFullscreenModal>

      <Transition.Root show={associateOpen} as={Fragment}>
        <Dialog as="div" className="relative z-[10000]" onClose={handleAssociateClose}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-backdrop transition-opacity" />
          </Transition.Child>
          <div className="fixed inset-0 z-10 overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                enterTo="opacity-100 translate-y-0 sm:scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              >
                <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-surface-1 text-left shadow-overlay-100 transition-all sm:my-8 sm:w-full sm:max-w-2xl">
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium">选择迭代</h3>
                      <Button variant="secondary" onClick={handleAssociateClose}>
                        关闭
                      </Button>
                    </div>
                    <div className="mt-3">
                      {selectLoading && (
                        <div className="flex items-center justify-center py-8 text-sm text-secondary">
                          加载中...
                        </div>
                      )}
                      {selectError && (
                        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
                          {selectError}
                        </div>
                      )}
                      {!selectLoading && !selectError && (
                        <div className="overflow-x-auto">
                          <table className="min-w-full table-fixed">
                            <thead>
                              <tr className="text-left text-xs text-secondary border-b border-subtle">
                                <th className="w-10 px-2 py-2"></th>
                                <th className="w-2/5 px-2 py-2 text-sm font-medium text-primary">名称</th>
                                <th className="w-1/5 px-2 py-2 text-sm font-medium text-primary">开始时间</th>
                                <th className="w-1/5 px-2 py-2 text-sm font-medium text-primary">结束时间</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectData.length === 0 && (
                                <tr>
                                  <td className="px-2 py-6 text-sm text-secondary" colSpan={4}>
                                    暂无可选迭代
                                  </td>
                                </tr>
                              )}
                              {selectData.map((c) => {
                                const checked = selectedCycleIds.includes(c.id);
                                return (
                                  <tr key={c.id} className="border-b border-subtle hover:bg-layer-1-hover">
                                    <td className="px-2 py-2">
                                      <input
                                        type="checkbox"
                                        className="size-4"
                                        checked={checked}
                                        onChange={(e) => {
                                          const v = e.target.checked;
                                          setSelectedCycleIds((prev) => {
                                            if (v) return Array.from(new Set([...prev, c.id]));
                                            return prev.filter((x) => x !== c.id);
                                          });
                                        }}
                                      />
                                    </td>
                                    <td className="px-2 py-2">
                                      <span className="truncate text-sm text-primary">{c.name}</span>
                                    </td>
                                    <td className="px-2 py-2">
                                      <ReadonlyDate value={c.start_date} formatToken="yyyy-MM-dd" hideIcon={true} />
                                    </td>
                                    <td className="px-2 py-2">
                                      <ReadonlyDate value={c.end_date} formatToken="yyyy-MM-dd" hideIcon={true} />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <div className="mt-3 flex items-center justify-between">
                            <div className="text-sm text-secondary">共 {selectTotal} 条</div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="secondary"
                                disabled={selectPage <= 1}
                                onClick={() => fetchSelectable(selectPage - 1, selectPageSize)}
                              >
                                上一页
                              </Button>
                              <div className="text-sm">第 {selectPage} 页</div>
                              <Button
                                variant="secondary"
                                disabled={selectPage * selectPageSize >= selectTotal}
                                onClick={() => fetchSelectable(selectPage + 1, selectPageSize)}
                              >
                                下一页
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button variant="secondary" onClick={handleAssociateClose}>
                        取消
                      </Button>
                      <Button variant="primary" onClick={handleAssociateConfirm} disabled={selectedCycleIds.length === 0}>
                        确定
                      </Button>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>
      <Transition.Root show={noteOpen} as={Fragment}>
        <Dialog as="div" className="relative z-[100]" onClose={() => setNoteOpen(false)}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-backdrop transition-opacity" />
          </Transition.Child>
          <div className="fixed inset-0 z-10 overflow-y-auto">
            <div className="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
                enterTo="opacity-100 translate-y-0 sm:scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 translate-y-0 sm:scale-100"
                leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
              >
                <Dialog.Panel className="relative transform overflow-hidden rounded-lg bg-surface-1 text-left shadow-overlay-100 transition-all sm:my-8 sm:w-full sm:max-w-2xl">
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium">编辑发布日志</h3>
                      <Button variant="secondary" onClick={() => setNoteOpen(false)}>
                        关闭
                      </Button>
                    </div>
                    <div className="mt-3">
                      <RichTextEditor
                        id="release-note-editor"
                        editable
                        initialValue={noteHtml ?? ""}
                        workspaceSlug={workspaceSlug?.toString() ?? ""}
                        workspaceId={workspaceId ?? ""}
                        projectId={projectId?.toString() ?? ""}
                        onChange={(_: any, val: string) => setNoteHtml(val)}
                        uploadFile={handleNoteEditorUploadFile}
                        duplicateFile={handleNoteEditorDuplicateFile}
                        searchMentionCallback={async (payload) =>
                          await workspaceService.searchEntity(workspaceSlug?.toString() ?? "", {
                            ...payload,
                            project_id: projectId?.toString() ?? "",
                          })
                        }
                        containerClassName="min-h-[180px] rounded-md"
                      />
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => setNoteOpen(false)}
                        disabled={noteSubmitting}
                      >
                        取消
                      </Button>
                      <Button onClick={handleNoteSubmit} disabled={noteSubmitting} loading={noteSubmitting}>
                        确定
                      </Button>
                    </div>
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition.Root>

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
                    <th className="w-2/5 px-2 py-2 text-sm font-medium text-primary">名称</th>
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
                          <td className="px-2 py-2 text-sm text-primary">{plan.state ?? "-"}</td>
                          <td className="px-2 py-2 text-sm text-primary">{plan.begin_time || "-"}</td>
                          <td className="px-2 py-2 text-sm text-primary">{plan.end_time || "-"}</td>
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
