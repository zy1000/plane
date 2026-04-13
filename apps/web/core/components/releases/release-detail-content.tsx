"use client";
import React, { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { Plus, Unlink, Pencil, Download, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@plane/propel/button";
import { BarChart } from "@plane/propel/charts/bar-chart";
import { PROJECT_ERROR_MESSAGES, STATE_GROUPS, isProjectPermissionError } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Dialog, Transition } from "@headlessui/react";
import { Pagination, Popconfirm, Tag, Tooltip } from "antd";
import { ReadonlyDate } from "@/components/readonly/date";
import { ReleaseService } from "@/services/release.service";
import { WorkspaceService } from "@/services/workspace.service";
import { renderFormattedPayloadDate, findTotalDaysInRange } from "@plane/utils";
import { EFileAssetType } from "@plane/types";
import { useRelease } from "@/hooks/store/use-release";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useEditorAsset } from "@/hooks/store/use-editor-asset";
import { RichTextEditor } from "@/components/editor/rich-text";

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


const PASS_RATE_KEYS = ["成功", "失败", "阻塞", "无效", "未执行"] as const;
const PASS_RATE_COLORS: Record<string, string> = {
  成功: "#52c41a",
  失败: "#ff4d4f",
  阻塞: "#faad14",
  无效: "#3b5999",
  未执行: "#bfbfbf",
};

const renderPlanStateTag = (state: string | null | undefined) => {
  const colorMap: Record<string, string> = {
    未开始: "default",
    进行中: "processing",
    已完成: "success",
  };
  const color = colorMap[state ?? ""] || "default";
  const text = state ? String(state) : "-";
  return <Tag color={color}>{text}</Tag>;
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
  const { uploadEditorAsset, duplicateEditorAsset } = useEditorAsset();
  const workspaceService = useMemo(() => new WorkspaceService(), []);

  const todayStr = renderFormattedPayloadDate(new Date());
  const rawDays =
    releaseDetails?.target_date && todayStr
      ? findTotalDaysInRange(todayStr, releaseDetails.target_date, false)
      : undefined;
  const daysLeft = typeof rawDays === "number" ? Math.max(0, rawDays) : undefined;

  const status = releaseDetails?.status;
  const isBacklog = status === "backlog";
  const isProgress = status === "planned" || status === "in-progress" || status === "paused";
  const isCompleted = status === "completed";
  const isCancelled = status === "cancelled";
  const progressLabelClass =
    isProgress || isCompleted || isCancelled
      ? "text-warning-primary bg-warning-subtle"
      : "text-secondary bg-layer-1";
  const line1BorderClass = isBacklog ? "border-subtle" : "border-warning-strong";
  const line2BorderClass = isCompleted ? "border-success-strong" : isCancelled ? "border-danger-strong" : "border-subtle";
  const line1BorderStyle = isBacklog ? "border-dashed" : "border-solid";
  const line2BorderStyle = isCompleted || isCancelled ? "border-solid" : "border-dashed";

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
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteHtml, setNoteHtml] = useState<string>("");
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [releaseFiles, setReleaseFiles] = useState<TReleaseFile[]>([]);
  const [releaseFilesLoading, setReleaseFilesLoading] = useState(false);
  const [releaseFilesError, setReleaseFilesError] = useState<string | null>(null);
  const [releaseFilesPage, setReleaseFilesPage] = useState(1);
  const [releaseFilesTotal, setReleaseFilesTotal] = useState(0);
  const [releaseFilesUploading, setReleaseFilesUploading] = useState(false);
  const [releaseFilesDeletingId, setReleaseFilesDeletingId] = useState<string | null>(null);
  const [releaseFilesDownloadingId, setReleaseFilesDownloadingId] = useState<string | null>(null);

  const releaseFilesPageSize = 5;

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

  const fetchReleaseFiles = async (page = releaseFilesPage) => {
    if (!workspaceSlug || !projectId || !releaseId) return;
    try {
      setReleaseFilesLoading(true);
      setReleaseFilesError(null);
      const res = await releaseService.getReleaseFileList(workspaceSlug.toString(), projectId.toString(), releaseId, {
        page,
        page_size: releaseFilesPageSize,
      });
      const list = Array.isArray(res?.data) ? res.data : [];
      const count = Number(res?.count ?? 0);
      const totalPages = Math.max(Math.ceil(count / releaseFilesPageSize), 1);
      const safePage = Math.min(Math.max(page, 1), totalPages);
      if (safePage !== page) {
        await fetchReleaseFiles(safePage);
        return;
      }
      setReleaseFiles(list);
      setReleaseFilesTotal(count);
      setReleaseFilesPage(page);
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
      await fetchReleaseFiles(1);
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
      await fetchReleaseFiles(releaseFilesPage);
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
    setReleaseFilesPage(1);

    fetchReleaseDetails(workspaceSlug.toString(), projectId.toString(), releaseId);
    fetchCycles();
    fetchReleaseStatistics();
    fetchReleaseFiles(1);
    fetchPlans();
  }, [fetchReleaseDetails, isOpen, releaseId, projectId, workspaceSlug]);

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
    fetchReleaseStatistics();
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
      fetchReleaseStatistics();
    } catch (e: any) {
      setToast({ type: TOAST_TYPE.ERROR, title: "操作失败", message: e?.detail || e?.error || "请稍后重试" });
    }
  };

  const typeDistribution = Array.isArray(stats?.type_distribution) ? stats.type_distribution : [];
  const showTypeDistributionTooltip = typeDistribution.some((t: any) => {
    const total =
      Number(t?.backlog ?? 0) +
      Number(t?.unstarted ?? 0) +
      Number(t?.started ?? 0) +
      Number(t?.completed ?? 0) +
      Number(t?.cancelled ?? 0);
    return total > 0;
  });

  return (
    <div className="h-full overflow-y-auto vertical-scrollbar scrollbar-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-canvas">
        <div className="md:col-span-2 bg-surface-1 border border-subtle shadow-md p-4">
          <div className="text-sm font-medium text-secondary mb-3">基本信息</div>
          <div className="flex flex-col md:flex-row md:items-stretch md:justify-between gap-3">
            <div className="md:w-1/3">
              <div className="grid grid-cols-2 gap-2">
                <div className="text-sm text-secondary">距离发布还有：</div>
                <div className="text-sm text-secondary">负责人：</div>
                <div className="text-base font-medium text-primary">
                  {releaseDetails?.target_date ? `${daysLeft ?? 0}天` : "--"}
                </div>
                <div>
                  <div className="w-full rounded-md border border-transparent text-sm hover:border-blue-300 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-300">
                    <MemberDropdown
                      multiple={false}
                      disabled={true}
                      value={releaseDetails?.lead_id ?? null}
                      placeholder="请选择维护人"
                      className="w-full text-sm"
                      buttonContainerClassName="w-full text-left"
                      buttonVariant="transparent-with-text"
                      buttonClassName="text-sm"
                      dropdownArrowClassName="h-3.5 w-3.5"
                      showUserDetails={true}
                      optionsClassName="z-[60]"
                      projectId={releaseDetails?.project_id}
                      onChange={() => {}}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="hidden md:flex items-center flex-shrink-0">
              <div className="h-12 border-l border-subtle"></div>
            </div>

            <div className="md:w-2/3 flex md:items-center">
              <div className="flex items-center gap-2 md:gap-3 w-full">
                <div
                  className={`px-3 py-1 rounded-full text-xs font-medium ${isBacklog ? "text-primary bg-layer-1-active" : "text-secondary bg-layer-1"}`}
                >
                  未开始
                </div>
                <div className={`flex-1 h-0 border-t-2 ${line1BorderStyle} ${line1BorderClass}`}></div>
                <div className={`px-3 py-1 rounded-full text-xs font-medium ${progressLabelClass}`}>进行中</div>
                <div className={`flex-1 h-0 border-t-2 ${line2BorderStyle} ${line2BorderClass}`}></div>
                <div
                  className={`px-3 py-1 rounded-full text-xs font-medium ${isCompleted ? "text-success-primary bg-success-subtle" : isCancelled ? "text-danger-primary bg-danger-subtle" : "text-secondary bg-layer-1"}`}
                >
                  {isCancelled ? "已取消" : "已完成"}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="h-[430px] bg-surface-1 border border-subtle shadow-md flex flex-col">
          <div className="p-4 ">
            <div className="text-base font-semibold text-primary">发布进度</div>
          </div>
          <div className="px-4 pb-4">
            {statsLoading ? (
              <div className="flex items-center justify-center py-8 text-sm text-secondary">加载中...</div>
            ) : statsError ? (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">{statsError}</div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
                  {[
                    {
                      label: "全部",
                      value: Number(stats?.total_issues ?? 0),
                      color: "text-primary",
                    },
                    {
                      label: "未开始",
                      value: Number(stats?.state_distribution?.backlog ?? 0),
                      color: "text-primary",
                    },
                    {
                      label: "进行中",
                      value: Number(
                        (stats?.state_distribution?.unstarted ?? 0) + (stats?.state_distribution?.started ?? 0)
                      ),
                      color: "text-warning-primary",
                    },
                    {
                      label: "已完成",
                      value: Number(stats?.state_distribution?.completed ?? 0),
                      color: "text-success-primary",
                    },
                    {
                      label: "已取消",
                      value: Number(stats?.state_distribution?.cancelled ?? 0),
                      color: "text-danger-primary",
                    },
                  ].map((item) => (
                    <div key={item.label} className="rounded-md border border-subtle p-2">
                      <div className="text-xs text-secondary">{item.label}</div>
                      <div className={`mt-1 text-xl font-semibold ${item.color}`}>{item.value}</div>
                    </div>
                  ))}
                </div>
                <div className="h-[300px]">
                  <BarChart
                    className="h-full w-full"
                    data={(stats?.type_distribution ?? []).map((t: any) => ({
                      name: t?.["type__name"] ?? "",
                      notStarted: Number(t?.backlog ?? 0),
                      inProgress: Number((t?.unstarted ?? 0) + (t?.started ?? 0)),
                      completed: Number(t?.completed ?? 0),
                      cancelled: Number(t?.cancelled ?? 0),
                      typeId: t?.["type__id"] ?? null,
                    }))}
                    bars={[
                      {
                        key: "notStarted",
                        label: "未开始",
                        stackId: "group-a",
                        fill: STATE_GROUPS.backlog.color,
                        textClassName: "",
                        showPercentage: false,
                        showTopBorderRadius: (_key, payload: any) =>
                          Number(payload?.inProgress ?? 0) +
                            Number(payload?.completed ?? 0) +
                            Number(payload?.cancelled ?? 0) ===
                          0,
                        showBottomBorderRadius: () => true,
                        strokeColor: "#ffffff",
                        strokeWidth: 1,
                      },
                      {
                        key: "inProgress",
                        label: "进行中",
                        stackId: "group-a",
                        fill: STATE_GROUPS.started.color,
                        textClassName: "",
                        showPercentage: false,
                        showTopBorderRadius: (_key, payload: any) =>
                          Number(payload?.completed ?? 0) + Number(payload?.cancelled ?? 0) === 0,
                        showBottomBorderRadius: () => false,
                        strokeColor: "#ffffff",
                        strokeWidth: 1,
                      },
                      {
                        key: "completed",
                        label: "已完成",
                        stackId: "group-a",
                        fill: STATE_GROUPS.completed.color,
                        textClassName: "",
                        showPercentage: false,
                        showTopBorderRadius: (_key, payload: any) => Number(payload?.cancelled ?? 0) === 0,
                        showBottomBorderRadius: () => false,
                        strokeColor: "#ffffff",
                        strokeWidth: 1,
                      },
                      {
                        key: "cancelled",
                        label: "已取消",
                        stackId: "group-a",
                        fill: STATE_GROUPS.cancelled.color,
                        textClassName: "",
                        showPercentage: false,
                        showTopBorderRadius: () => true,
                        showBottomBorderRadius: () => false,
                        strokeColor: "#ffffff",
                        strokeWidth: 1,
                      },
                    ]}
                    xAxis={{
                      key: "name",
                    }}
                    yAxis={{
                      key: "count",
                    }}
                    margin={{ left: -20, bottom: 16 }}
                    legend={{
                      align: "left",
                      verticalAlign: "bottom",
                      layout: "horizontal",
                      wrapperStyles: {
                        justifyContent: "start",
                        alignContent: "start",
                        paddingLeft: "20px",
                        paddingTop: "8px",
                        paddingBottom: "12px",
                      },
                    }}
                    barSize={18}
                    showTooltip={showTypeDistributionTooltip}
                    onBarClick={({ barKey, payload, label }) => {
                      const typeId = payload?.typeId;
                      if (!workspaceSlug || !projectId || !typeId) return;
                      router.push(`/${workspaceSlug}/projects/${projectId}/issues?type_id=${typeId}`);
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
        <div className="h-[430px] relative bg-surface-1 border border-subtle shadow-md p-4 group flex flex-col overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="text-base font-semibold text-primary">发布日志</div>
            <div className="flex">
              <Button variant="ghost" className="p-0 opacity-0 group-hover:opacity-100" onClick={handleNoteOpen}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="mt-3 flex-1 min-h-0 overflow-hidden">
            {releaseDetails?.note ? (
              <div
                className="prose max-w-none text-sm text-secondary"
                dangerouslySetInnerHTML={{ __html: releaseDetails.note }}
              />
            ) : (
              <div className="text-sm text-secondary">暂无发布日志</div>
            )}
          </div>
        </div>
        <div className="relative bg-surface-1 border border-subtle shadow-md p-4 group">
          <div className="flex items-center justify-between">
            <div className="text-base font-semibold text-primary">关联迭代</div>
            <div className="flex">
              <Button
                variant="ghost"
                className="p-0"
                onClick={() => {
                  setAssociateOpen(true);
                  fetchSelectable(1, selectPageSize);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="mt-3 max-h-[220px] overflow-y-auto vertical-scrollbar scrollbar-sm">
            {cyclesLoading && (
              <div className="flex items-center justify-center py-8 text-sm text-secondary">加载中...</div>
            )}
            {cyclesError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">{cyclesError}</div>
            )}
            {!cyclesLoading && !cyclesError && (
              <div className="overflow-x-auto">
                <table className="min-w-full table-fixed">
                  <thead>
                    <tr className="text-left text-xs text-secondary border-b border-subtle">
                      <th className="w-2/5 px-2 py-2">名称</th>
                      <th className="w-1/5 px-2 py-2">开始时间</th>
                      <th className="w-1/5 px-2 py-2">结束时间</th>
                      <th className="w-1/5 px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cycles.length === 0 && (
                      <tr>
                        <td className="px-2 py-6 text-sm text-secondary" colSpan={4}>
                          暂无关联迭代
                        </td>
                      </tr>
                    )}
                    {cycles.map((c) => (
                      <tr
                        key={c.id}
                        className="border-b border-subtle hover:bg-layer-1-hover"
                        onMouseEnter={() => setHoverRowId(c.id)}
                        onMouseLeave={() => setHoverRowId((prev) => (prev === c.id ? null : prev))}
                      >
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm text-primary">{c.name}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <ReadonlyDate value={c.start_date} formatToken="yyyy-MM-dd" hideIcon={true} />
                        </td>
                        <td className="px-2 py-2">
                          <ReadonlyDate value={c.end_date} formatToken="yyyy-MM-dd" hideIcon={true} />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Button variant="ghost" className="p-0" onClick={() => handleCancelAssociation(c.id)}>
                            <Unlink className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <div className="h-[300px] relative bg-surface-1 border border-subtle shadow-md p-4 group flex flex-col overflow-hidden">
          <div className="text-base font-semibold text-primary">测试计划</div>
          <div className="mt-3 flex-1 min-h-0 overflow-y-auto vertical-scrollbar scrollbar-sm">
            {plansLoading && (
              <div className="flex items-center justify-center py-8 text-sm text-secondary">加载中...</div>
            )}
            {plansError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">{plansError}</div>
            )}
            {!plansLoading && !plansError && (
              <div className="overflow-x-auto">
                <table className="min-w-full table-fixed">
                  <thead>
                    <tr className="text-left text-xs text-secondary border-b border-subtle">
                      <th className="w-[34%] px-2 py-2">名称</th>
                      <th className="w-[14%] px-2 py-2">状态</th>
                      <th className="w-[18%] px-2 py-2">通过率</th>
                      <th className="w-[17%] px-2 py-2">开始时间</th>
                      <th className="w-[17%] px-2 py-2">结束时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.length === 0 && (
                      <tr>
                        <td className="px-2 py-6 text-sm text-secondary" colSpan={5}>
                          暂无关联测试计划
                        </td>
                      </tr>
                    )}
                    {plans.map((p) => {
                      return (
                        <tr
                          key={p.id}
                          className="border-b border-subtle hover:bg-layer-1-hover cursor-pointer"
                          onClick={() => {
                            router.push(
                              `/${workspaceSlug}/projects/${projectId}/testhub/plan-cases?planId=${p.id}`
                            );
                          }}
                        >
                          <td className="px-2 py-2">
                            <span className="truncate text-sm text-primary">{p.name}</span>
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center">{renderPlanStateTag(p.state)}</div>
                          </td>
                          <td className="px-2 py-2">
                            <PlanPassRate passRate={p.pass_rate} />
                          </td>
                          <td className="px-2 py-2">
                            <span className="text-sm text-primary">
                              {p.begin_time || "-"}
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            <span className="text-sm text-primary">
                              {p.end_time || "-"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <div className="h-[360px] relative bg-surface-1 border border-subtle shadow-md p-4 group flex flex-col">
          <div className="flex items-center justify-between">
            <div className="text-base font-semibold text-primary">文件</div>
            <div className="flex">
              <Button
                variant="ghost"
                className="p-0"
                onClick={() => fileInputRef.current?.click()}
                loading={releaseFilesUploading}
                disabled={releaseFilesUploading}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleUploadReleaseFile} />
            </div>
          </div>
          <div className="mt-3 flex-1 min-h-0 overflow-y-auto vertical-scrollbar scrollbar-sm">
            {releaseFilesLoading && (
              <div className="flex items-center justify-center py-8 text-sm text-secondary">加载中...</div>
            )}
            {releaseFilesError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">{releaseFilesError}</div>
            )}
            {!releaseFilesLoading && !releaseFilesError && (
              <div className="overflow-x-auto">
                <table className="min-w-full table-fixed">
                  <thead>
                    <tr className="text-left text-xs text-secondary border-b border-subtle">
                      <th className="w-2/5 px-2 py-2">文件名</th>
                      <th className="w-1/5 px-2 py-2">大小</th>
                      <th className="w-1/5 px-2 py-2">上传时间</th>
                      <th className="w-1/5 px-5 py-2  text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {releaseFiles.length === 0 && (
                      <tr>
                        <td className="px-2 py-6 text-sm text-secondary" colSpan={4}>
                          暂无文件
                        </td>
                      </tr>
                    )}
                    {releaseFiles.map((file) => (
                      <tr key={file.id} className="border-b border-subtle hover:bg-layer-1-hover">
                        <td className="px-2 py-2 truncate text-sm text-primary" title={file.name}>
                          {file.name}
                        </td>
                        <td className="px-2 py-2 text-sm text-primary">{formatFileSize(Number(file.size ?? 0))}</td>
                        <td className="px-2 py-2 text-sm text-primary">
                          <ReadonlyDate value={file.created_at} formatToken="yyyy-MM-dd" hideIcon={true} />
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              className="p-0"
                              disabled={releaseFilesDownloadingId === file.id}
                              onClick={() => handleDownloadReleaseFile(file.id, file.name)}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                            <Popconfirm
                              title="确认删除该文件？"
                              okText="删除"
                              cancelText="取消"
                              onConfirm={() => void handleDeleteReleaseFile(file.id)}
                            >
                              <Button
                                variant="ghost"
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
            )}
          </div>
          <div className="flex-shrink-0 border-t border-subtle px-2 py-2 bg-surface-1 flex items-center justify-between mt-2">
            <div className="text-sm text-secondary">{releaseFilesTotal > 0 ? `共 ${releaseFilesTotal} 条` : ""}</div>
            <Pagination
              simple
              current={releaseFilesPage}
              pageSize={releaseFilesPageSize}
              total={releaseFilesTotal}
              onChange={(p) => fetchReleaseFiles(p)}
              size="small"
            />
          </div>
        </div>
        <div className="h-[360px] relative bg-surface-1 border border-subtle shadow-md p-4 group">
          <div className="text-base font-semibold text-primary">发布动态</div>
        </div>
      </div>
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
                                <th className="w-2/5 px-2 py-2">名称</th>
                                <th className="w-1/5 px-2 py-2">开始时间</th>
                                <th className="w-1/5 px-2 py-2">结束时间</th>
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
    </div>
  );
});
